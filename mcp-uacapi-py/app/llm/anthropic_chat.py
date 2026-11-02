"""Anthropic Messages API adapter (Anthropic API or AWS Bedrock) with explicit prompt caching.

Claude only caches when asked to, using `cache_control` markers (at most 4 per request). Two are used:

1. On the system prompt: caches tools + system (~3.7k tokens). The bytes are identical for every
   shopper, so all conversations share this entry.
2. On the last block of the last message: caches the conversation so far. The next model call
   (the following tool-loop step or the next user turn) re-reads it instead of paying full price.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import anthropic
from anthropic import AsyncAnthropic, AsyncAnthropicBedrock

from app.core.config import Settings
from app.core.errors import UpstreamError
from app.llm.types import ChatRequest, Completion, Message, ToolCall, Usage, as_int

logger = logging.getLogger(__name__)


def _secret(value: Any) -> str | None:
    return value.get_secret_value() if value is not None else None


def build_anthropic_client(settings: Settings) -> AsyncAnthropic | AsyncAnthropicBedrock:
    common: dict[str, Any] = {
        "base_url": settings.anthropic_base_url,
        "timeout": settings.llm_timeout_s,
        "max_retries": settings.llm_max_retries,
    }
    if settings.anthropic_backend == "bedrock":
        return AsyncAnthropicBedrock(
            aws_region=settings.aws_region,
            api_key=_secret(settings.aws_bearer_token_bedrock),
            aws_access_key=settings.aws_access_key_id,
            aws_secret_key=_secret(settings.aws_secret_access_key),
            aws_session_token=_secret(settings.aws_session_token),
            aws_profile=settings.aws_profile,
            **common,
        )
    return AsyncAnthropic(api_key=_secret(settings.anthropic_api_key), **common)


def _arguments(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def to_anthropic_messages(messages: list[Message] | tuple[Message, ...]) -> list[dict[str, Any]]:
    """Converts neutral messages into Claude's alternating user/assistant content-block format."""
    out: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "tool":
            role = "user"
            blocks: list[dict[str, Any]] = [
                {"type": "tool_result", "tool_use_id": message.tool_call_id, "content": message.content}
            ]
        elif message.role == "user":
            role = "user"
            blocks = [{"type": "text", "text": message.content}] if message.content.strip() else []
        else:
            role = "assistant"
            blocks = [{"type": "text", "text": message.content}] if message.content.strip() else []
            blocks += [
                {"type": "tool_use", "id": c.id, "name": c.name, "input": _arguments(c.arguments)}
                for c in message.tool_calls
            ]
        if not blocks or (not out and role == "assistant"):
            continue  # Claude rejects empty turns and conversations that start with the assistant.
        if out and out[-1]["role"] == role:
            out[-1]["content"].extend(blocks)
        else:
            out.append({"role": role, "content": blocks})
    return out


def _usage(raw: Any, base: Usage | None = None) -> Usage:
    """Claude reports uncached input separately; fold cache reads and writes into the input total."""
    usage = base or Usage(calls=1)
    if raw is None:
        return usage
    read = getattr(raw, "cache_read_input_tokens", None)
    write = getattr(raw, "cache_creation_input_tokens", None)
    fresh = getattr(raw, "input_tokens", None)
    if read is not None:
        usage.cache_read_tokens = as_int(read)
    if write is not None:
        usage.cache_write_tokens = as_int(write)
    if fresh is not None:
        usage.input_tokens = as_int(fresh) + usage.cache_read_tokens + usage.cache_write_tokens
    if (output := getattr(raw, "output_tokens", None)) is not None:
        usage.output_tokens = as_int(output)
    return usage


class AnthropicChatModel:
    provider = "anthropic"

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self._settings = settings
        self.model = settings.anthropic_model
        self._client = client or build_anthropic_client(settings)

    def build_params(self, request: ChatRequest) -> dict[str, Any]:
        s = self._settings
        caching = s.llm_prompt_caching
        system: dict[str, Any] = {"type": "text", "text": request.system}
        messages = to_anthropic_messages(list(request.messages))
        if caching:
            prefix_marker: dict[str, Any] = {"type": "ephemeral"}
            if s.anthropic_cache_ttl == "1h":
                prefix_marker["ttl"] = "1h"  # longer TTLs must come before shorter ones; this is first
            system["cache_control"] = prefix_marker
            if messages:
                messages[-1]["content"][-1]["cache_control"] = {"type": "ephemeral"}
        params: dict[str, Any] = {
            "model": self.model,
            "max_tokens": s.anthropic_max_tokens,
            "system": [system],
            "messages": messages,
        }
        if request.tools:
            params["tools"] = [
                {"name": t.name, "description": t.description, "input_schema": t.parameters}
                for t in request.tools
            ]
            params["tool_choice"] = {"type": request.tool_choice}
        return params

    async def complete(
        self, request: ChatRequest, *, stream: bool = False
    ) -> AsyncIterator[str | Completion]:
        params = self.build_params(request)
        try:
            if stream:
                parts: list[str] = []
                calls: dict[int, ToolCall] = {}
                usage = Usage(calls=1)
                async for event in await self._client.messages.create(**params, stream=True):
                    kind = getattr(event, "type", "")
                    if kind == "message_start":
                        usage = _usage(getattr(event.message, "usage", None), usage)
                    elif kind == "content_block_start" and event.content_block.type == "tool_use":
                        block = event.content_block
                        calls[event.index] = ToolCall(id=block.id, name=block.name)
                    elif kind == "content_block_delta":
                        delta = event.delta
                        if delta.type == "text_delta" and delta.text:
                            parts.append(delta.text)
                            yield delta.text
                        elif delta.type == "input_json_delta" and event.index in calls:
                            calls[event.index].arguments += delta.partial_json
                    elif kind == "message_delta":
                        usage = _usage(getattr(event, "usage", None), usage)
                completion = Completion("".join(parts), [calls[i] for i in sorted(calls)], usage)
            else:
                response = await self._client.messages.create(**params)
                completion = Completion(
                    content="".join(b.text for b in response.content if b.type == "text"),
                    tool_calls=[
                        ToolCall(b.id, b.name, json.dumps(b.input, separators=(",", ":")))
                        for b in response.content
                        if b.type == "tool_use"
                    ],
                    usage=_usage(getattr(response, "usage", None)),
                )
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            raise UpstreamError(
                f"LLM authentication failed ({exc.status_code}): check the Anthropic/Bedrock "
                "credentials in .env and retry."
            ) from exc
        except anthropic.APITimeoutError as exc:
            raise UpstreamError("LLM request timed out.", status_code=504) from exc
        except anthropic.APIError as exc:
            raise UpstreamError(f"LLM request failed: {exc.message}") from exc
        yield completion

    async def aclose(self) -> None:
        close = getattr(self._client, "close", None)
        if close is not None:
            await close()
