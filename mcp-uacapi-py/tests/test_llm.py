from __future__ import annotations

import json
import os
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.config import Settings
from app.core.errors import NotConfiguredError
from app.llm import ChatRequest, Completion, LLMProvider, Message, ToolCall, ToolDefinition, build_chat_model
from app.llm.anthropic_chat import AnthropicChatModel, to_anthropic_messages
from app.llm.openai_chat import OpenAIChatModel

TOOLS = (ToolDefinition("search_products", "Search", {"type": "object", "properties": {}}),)


def _ns(**kwargs: Any) -> SimpleNamespace:
    return SimpleNamespace(**kwargs)


def _settings(**overrides: Any) -> Settings:
    return Settings(_env_file=None, **overrides)


def _conversation() -> list[Message]:
    return [
        Message("assistant", "stale greeting"),  # Claude conversations must start with the user
        Message("user", "black hoodies"),
        Message("assistant", "", [ToolCall("t1", "search_products", '{"query":"hoodies"}')]),
        Message("tool", '{"products":[]}', tool_call_id="t1"),
    ]


def _request(**overrides: Any) -> ChatRequest:
    return ChatRequest(system="SYSTEM", messages=_conversation(), tools=TOOLS, **overrides)


async def _collect(model: Any, request: ChatRequest, *, stream: bool) -> tuple[list[str], Completion]:
    deltas: list[str] = []
    completion: Completion | None = None
    async for item in model.complete(request, stream=stream):
        if isinstance(item, Completion):
            completion = item
        else:
            deltas.append(item)
    assert completion is not None
    return deltas, completion


# --- OpenAI ---------------------------------------------------------------------------------------


def test_openai_params_default_rely_on_automatic_prefix_caching():
    params = OpenAIChatModel(_settings(openai_api_key="k"), client=object()).build_params(_request())
    assert params["messages"][0] == {"role": "system", "content": "SYSTEM"}
    assert params["tools"][0]["function"]["name"] == "search_products"
    assert not {"prompt_cache_key", "prompt_cache_retention"} & params.keys()


def test_openai_params_with_cache_options():
    settings = _settings(
        openai_api_key="k",
        openai_prompt_cache_key="ua-agent",
        openai_prompt_cache_retention="24h",
        openai_cache_breakpoints=True,
    )
    model = OpenAIChatModel(settings, client=object())
    params = model.build_params(_request(conversation_key="abc"))
    assert params["prompt_cache_key"] == "ua-agent:abc"
    assert params["prompt_cache_retention"] == "24h"
    assert params["messages"][0]["content"] == [
        {"type": "text", "text": "SYSTEM", "prompt_cache_breakpoint": {"mode": "explicit"}}
    ]
    assert model.build_params(_request())["prompt_cache_key"] == "ua-agent"

    disabled = OpenAIChatModel(settings.model_copy(update={"llm_prompt_caching": False}), client=object())
    params = disabled.build_params(_request(conversation_key="abc"))
    assert "prompt_cache_key" not in params and params["messages"][0]["content"] == "SYSTEM"


# --- Anthropic ------------------------------------------------------------------------------------


def test_anthropic_message_conversion():
    assert to_anthropic_messages(_conversation()) == [
        {"role": "user", "content": [{"type": "text", "text": "black hoodies"}]},
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": "t1", "name": "search_products", "input": {"query": "hoodies"}}
            ],
        },
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": "t1", "content": '{"products":[]}'}],
        },
    ]
    merged = to_anthropic_messages([Message("user", "a"), Message("user", "b")])
    assert merged == [
        {"role": "user", "content": [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]}
    ]


def test_anthropic_params_place_cache_markers():
    model = AnthropicChatModel(_settings(llm_provider="anthropic", anthropic_api_key="k"), client=object())
    params = model.build_params(_request(tool_choice="none"))
    assert params["system"] == [{"type": "text", "text": "SYSTEM", "cache_control": {"type": "ephemeral"}}]
    assert params["messages"][-1]["content"][-1]["cache_control"] == {"type": "ephemeral"}
    assert json.dumps(params).count("cache_control") == 2  # Claude allows at most 4
    assert params["tools"] == [
        {"name": "search_products", "description": "Search", "input_schema": TOOLS[0].parameters}
    ]
    assert params["tool_choice"] == {"type": "none"}
    # Building the same request twice yields identical bytes, so the cached prefix matches.
    assert json.dumps(model.build_params(_request(tool_choice="none"))) == json.dumps(params)


def test_anthropic_long_ttl_and_disabled_caching():
    settings = _settings(llm_provider="anthropic", anthropic_api_key="k", anthropic_cache_ttl="1h")
    params = AnthropicChatModel(settings, client=object()).build_params(_request())
    assert params["system"][0]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert params["messages"][-1]["content"][-1]["cache_control"] == {"type": "ephemeral"}

    off = settings.model_copy(update={"llm_prompt_caching": False})
    assert "cache_control" not in json.dumps(
        AnthropicChatModel(off, client=object()).build_params(_request())
    )


class _FakeAnthropic:
    def __init__(self, response: Any = None, events: list[Any] | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self._response, self._events = response, events or []
        self.messages = _ns(create=self._create)

    async def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if kwargs.get("stream"):
            return self._stream()
        return self._response

    async def _stream(self):
        for event in self._events:
            yield event


async def test_anthropic_complete_normalizes_cache_usage():
    response = _ns(
        content=[
            _ns(type="text", text="Looking now."),
            _ns(type="tool_use", id="tu_1", name="search_products", input={"query": "socks"}),
        ],
        usage=_ns(
            input_tokens=50, cache_read_input_tokens=3700, cache_creation_input_tokens=200, output_tokens=30
        ),
    )
    model = AnthropicChatModel(_settings(anthropic_api_key="k"), client=_FakeAnthropic(response=response))
    _, completion = await _collect(model, _request(), stream=False)
    assert completion.content == "Looking now."
    assert completion.tool_calls == [ToolCall("tu_1", "search_products", '{"query":"socks"}')]
    usage = completion.usage
    assert (usage.input_tokens, usage.cache_read_tokens, usage.cache_write_tokens) == (3950, 3700, 200)
    assert (usage.output_tokens, usage.calls) == (30, 1)


async def test_anthropic_stream_assembles_text_tool_calls_and_usage():
    start_usage = _ns(
        input_tokens=10, cache_read_input_tokens=3700, cache_creation_input_tokens=0, output_tokens=1
    )
    events = [
        _ns(type="message_start", message=_ns(usage=start_usage)),
        _ns(type="content_block_start", index=0, content_block=_ns(type="text", text="")),
        _ns(type="content_block_delta", index=0, delta=_ns(type="text_delta", text="Here ")),
        _ns(type="content_block_delta", index=0, delta=_ns(type="text_delta", text="you go")),
        _ns(
            type="content_block_start",
            index=1,
            content_block=_ns(type="tool_use", id="tu_9", name="get_orders"),
        ),
        _ns(type="content_block_delta", index=1, delta=_ns(type="input_json_delta", partial_json='{"limit"')),
        _ns(type="content_block_delta", index=1, delta=_ns(type="input_json_delta", partial_json=":2}")),
        _ns(type="message_delta", usage=_ns(output_tokens=42)),
        _ns(type="message_stop"),
    ]
    fake = _FakeAnthropic(events=events)
    model = AnthropicChatModel(_settings(anthropic_api_key="k"), client=fake)
    deltas, completion = await _collect(model, _request(), stream=True)
    assert deltas == ["Here ", "you go"]
    assert completion.content == "Here you go"
    assert completion.tool_calls == [ToolCall("tu_9", "get_orders", '{"limit":2}')]
    assert (completion.usage.input_tokens, completion.usage.cache_read_tokens) == (3710, 3700)
    assert completion.usage.output_tokens == 42
    assert fake.calls[0]["stream"] is True


# --- Provider selection ---------------------------------------------------------------------------


def test_build_chat_model_selects_provider_and_validates_config():
    assert isinstance(build_chat_model(_settings(openai_api_key="k")), OpenAIChatModel)
    anthropic = build_chat_model(_settings(llm_provider="anthropic", anthropic_api_key="k"))
    assert isinstance(anthropic, AnthropicChatModel) and anthropic.model == "claude-sonnet-5-5"
    with pytest.raises(NotConfiguredError, match="ANTHROPIC_API_KEY"):
        build_chat_model(_settings(llm_provider="anthropic"))
    with pytest.raises(NotConfiguredError, match="AWS_REGION"):
        build_chat_model(_settings(llm_provider="anthropic", anthropic_backend="bedrock"))
    bedrock = _settings(
        llm_provider="anthropic",
        anthropic_backend="bedrock",
        aws_region="us-east-1",
        aws_bearer_token_bedrock="b",
    )
    assert isinstance(build_chat_model(bedrock), AnthropicChatModel)


def test_llm_provider_rebuilds_when_env_file_changes(tmp_path):
    env = tmp_path / ".env"
    env.write_text("LLM_PROVIDER=openai\nOPENAI_API_KEY=first\n")
    provider = LLMProvider(Settings(_env_file=env), env_file=env)
    first = provider.model()
    assert isinstance(first, OpenAIChatModel) and provider.model() is first

    env.write_text("LLM_PROVIDER=anthropic\nANTHROPIC_API_KEY=second\n")
    stat = env.stat()
    os.utime(env, (stat.st_atime, stat.st_mtime + 5))
    assert isinstance(provider.model(), AnthropicChatModel)
