"""Agent request/response contract (`POST /agent`, `POST /agent/stream`)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator

from app.core.errors import BadRequestError
from app.schemas.base import CamelModel
from app.schemas.interaction import ChatInteraction
from app.schemas.orders import Order, OrderDetail
from app.schemas.products import Product, SearchSuggestions
from app.schemas.support import SupportTicket

MAX_PROMPT_CHARS = 4000
MAX_MESSAGE_CHARS = 8000


class ChatTurn(CamelModel):
    role: Literal["user", "assistant"]
    content: str


class AgentRequest(CamelModel):
    """Send `prompt` (+ optional `sessionId` for server memory) or a client-managed `messages` list."""

    prompt: str | None = Field(None, max_length=MAX_PROMPT_CHARS)
    session_id: str | None = Field(
        None,
        max_length=128,
        description="Conversation id. The server remembers turns and search filters per session.",
    )
    messages: list[ChatTurn] | None = Field(
        None,
        max_length=50,
        description="Client-managed history; the last user turn is the current message.",
    )

    @field_validator("messages")
    @classmethod
    def _bound_message_size(cls, messages: list[ChatTurn] | None) -> list[ChatTurn] | None:
        if messages and any(len(m.content) > MAX_MESSAGE_CHARS for m in messages):
            raise ValueError(f"Each message must be at most {MAX_MESSAGE_CHARS} characters.")
        return messages

    def resolve(self) -> tuple[str, list[ChatTurn]]:
        """Returns (current prompt, prior turns supplied by the client)."""
        if self.messages is not None:
            turns = [
                ChatTurn(role=m.role, content=m.content.strip()) for m in self.messages if m.content.strip()
            ]
            last_user = next((i for i in range(len(turns) - 1, -1, -1) if turns[i].role == "user"), None)
            if last_user is None:
                raise BadRequestError("messages must include at least one user turn.")
            return turns[last_user].content, turns[:last_user]

        prompt = (self.prompt or "").strip()
        if not prompt:
            raise BadRequestError('Body must include a non-empty "prompt" or "messages".')
        return prompt, []


class ToolCallRecord(CamelModel):
    name: str
    arguments: dict[str, Any]


class TokenUsage(CamelModel):
    """LLM token usage for one agent turn, summed over every model call in the tool loop."""

    provider: str | None = None
    model: str | None = None
    llm_calls: int = 0
    input_tokens: int = Field(0, description="All input tokens, including cached ones.")
    cached_input_tokens: int = Field(0, description="Input tokens read from the provider's prompt cache.")
    cache_write_tokens: int = Field(0, description="Input tokens written to the prompt cache.")
    output_tokens: int = 0


class AgentResponse(CamelModel):
    answer: str
    products: list[Product] = Field(default_factory=list)
    suggestions: SearchSuggestions = Field(default_factory=SearchSuggestions)
    orders: list[Order] = Field(default_factory=list)
    order_detail: OrderDetail | None = None
    support_ticket: SupportTicket | None = None
    interaction: ChatInteraction | None = None
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    filters: dict[str, Any] = Field(
        default_factory=dict, description="Accumulated search filters for this session."
    )
    usage: TokenUsage = Field(default_factory=TokenUsage)
