"""OpenAI Chat Completions adapter (OpenAI API or any OpenAI-compatible endpoint)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

import openai
from openai import AsyncOpenAI

from app.core.config import Settings
from app.core.errors import UpstreamError
from app.llm.types import ChatRequest, Completion, Message, ToolCall, Usage, as_int

logger = logging.getLogger(__name__)


def _message(message: Message) -> dict[str, Any]:
    if message.role == "tool":
        return {"role": "tool", "tool_call_id": message.tool_call_id, "content": message.content}
    if message.role == "user":
        return {"role": "user", "content": message.content}
    out: dict[str, Any] = {
        "role": "assistant",
        "content": message.content or (None if message.tool_calls else ""),
    }
    if message.tool_calls:
        out["tool_calls"] = [
            {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments or "{}"}}
            for c in message.tool_calls
        ]
    return out


def _usage(raw: Any) -> Usage:
    if raw is None:
        return Usage(calls=1)
    details = getattr(raw, "prompt_tokens_details", None)
    return Usage(
        input_tokens=as_int(getattr(raw, "prompt_tokens", 0)),
        output_tokens=as_int(getattr(raw, "completion_tokens", 0)),
        cache_read_tokens=as_int(getattr(details, "cached_tokens", 0)),
        cache_write_tokens=as_int(getattr(details, "cache_write_tokens", 0)),
        calls=1,
    )


class OpenAIChatModel:
    provider = "openai"

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self._settings = settings
        self.model = settings.openai_model
        self._client = client or AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value() if settings.openai_api_key else None,
            base_url=settings.openai_base_url,
            timeout=settings.llm_timeout_s,
            max_retries=settings.llm_max_retries,
        )

    def build_params(self, request: ChatRequest) -> dict[str, Any]:
        s = self._settings
        caching = s.llm_prompt_caching
        system: dict[str, Any] = {"role": "system", "content": request.system}
        if caching and s.openai_cache_breakpoints:
            system["content"] = [
                {"type": "text", "text": request.system, "prompt_cache_breakpoint": {"mode": "explicit"}}
            ]
        params: dict[str, Any] = {
            "model": self.model,
            "messages": [system, *(_message(m) for m in request.messages)],
        }
        if request.tools:
            params["tools"] = [
                {
                    "type": "function",
                    "function": {"name": t.name, "description": t.description, "parameters": t.parameters},
                }
                for t in request.tools
            ]
            params["tool_choice"] = request.tool_choice
        if caching and s.openai_prompt_cache_key:
            key = s.openai_prompt_cache_key
            params["prompt_cache_key"] = (
                f"{key}:{request.conversation_key}" if request.conversation_key else key
            )
        if caching and s.openai_prompt_cache_retention:
            params["prompt_cache_retention"] = s.openai_prompt_cache_retention
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
                response = await self._client.chat.completions.create(
                    **params, stream=True, stream_options={"include_usage": True}
                )
                async for chunk in response:
                    if (raw_usage := getattr(chunk, "usage", None)) is not None:
                        usage = _usage(raw_usage)
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta
                    if delta.content:
                        parts.append(delta.content)
                        yield delta.content
                    for tc in delta.tool_calls or []:
                        call = calls.setdefault(tc.index, ToolCall(id="", name=""))
                        call.id = tc.id or call.id
                        if tc.function and tc.function.name:
                            call.name += tc.function.name
                        if tc.function and tc.function.arguments:
                            call.arguments += tc.function.arguments
                completion = Completion("".join(parts), [calls[i] for i in sorted(calls)], usage)
            else:
                response = await self._client.chat.completions.create(**params)
                message = response.choices[0].message
                completion = Completion(
                    content=message.content or "",
                    tool_calls=[
                        ToolCall(c.id or "", c.function.name, c.function.arguments or "")
                        for c in message.tool_calls or []
                        if getattr(c, "function", None)
                    ],
                    usage=_usage(getattr(response, "usage", None)),
                )
        except openai.AuthenticationError as exc:
            raise UpstreamError(
                "LLM authentication failed (401): OPENAI_API_KEY is expired/invalid or "
                "OPENAI_BASE_URL is wrong. Refresh the key in .env and retry."
            ) from exc
        except openai.APITimeoutError as exc:
            raise UpstreamError("LLM request timed out.", status_code=504) from exc
        except openai.APIError as exc:
            raise UpstreamError(f"LLM request failed: {exc.message}") from exc
        yield completion

    async def aclose(self) -> None:
        close = getattr(self._client, "close", None)
        if close is not None:
            await close()
