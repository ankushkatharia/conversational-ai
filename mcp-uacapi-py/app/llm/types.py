"""Provider-neutral chat types shared by the agent loop and the LLM adapters."""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(slots=True)
class ToolCall:
    id: str
    name: str
    arguments: str = ""  # raw JSON text, exactly as the model produced it


@dataclass(slots=True)
class Message:
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str | None = None


@dataclass(frozen=True, slots=True)
class ChatRequest:
    """One model call.

    Adapters must render `tools`, then `system`, then `messages` in a stable order: provider
    prompt caches only match byte-identical prefixes.
    """

    system: str
    messages: Sequence[Message]
    tools: Sequence[ToolDefinition] = ()
    tool_choice: Literal["auto", "none"] = "auto"
    # Stable per-conversation id; lets providers that route by cache key keep a conversation together.
    conversation_key: str | None = None


@dataclass(slots=True)
class Usage:
    """Token usage normalized across providers. `input_tokens` includes cached and cache-write tokens."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    calls: int = 0

    def add(self, other: Usage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_read_tokens += other.cache_read_tokens
        self.cache_write_tokens += other.cache_write_tokens
        self.calls += other.calls


@dataclass(slots=True)
class Completion:
    content: str
    tool_calls: list[ToolCall]
    usage: Usage = field(default_factory=Usage)


class ChatModel(Protocol):
    provider: str
    model: str

    def complete(self, request: ChatRequest, *, stream: bool = False) -> AsyncIterator[str | Completion]:
        """Yields text deltas (when streaming), then exactly one final `Completion`."""
        ...

    async def aclose(self) -> None: ...


def as_int(value: Any) -> int:
    return value if isinstance(value, int) else 0
