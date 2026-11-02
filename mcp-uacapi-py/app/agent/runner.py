"""LLM tool-calling loop. One implementation backs both `POST /agent` and `POST /agent/stream`."""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

from app.agent.filters import merge_filters
from app.agent.prompt import SYSTEM_PROMPT
from app.core.auth import AuthContext
from app.core.config import Settings
from app.core.errors import AppError, UpstreamError
from app.llm import ChatModelProvider, ChatRequest, Completion, Message, Usage
from app.schemas.agent import AgentResponse, ChatTurn, TokenUsage, ToolCallRecord
from app.schemas.interaction import ChatInteraction, RequestUserInputResult
from app.schemas.orders import GetOrderDetailResult, GetOrdersResult, Order, OrderDetail
from app.schemas.products import Product, SearchProductsResult, SearchSuggestions
from app.schemas.support import CreateSupportTicketResult, SupportTicket
from app.tools.base import ToolContext, ToolRegistry

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AgentEvent:
    """One step of a run. `data` is JSON-ready, except `done`, which carries an AgentResponse."""

    type: str
    data: Any


def _dump(items: Sequence[BaseModel]) -> list[dict[str, Any]]:
    return [item.model_dump(mode="json") for item in items]


@dataclass(slots=True)
class _Collected:
    """Structured tool output kept for the UI (the model only sees a compact view)."""

    products: list[Product] = field(default_factory=list)
    suggestions: SearchSuggestions = field(default_factory=SearchSuggestions)
    orders: list[Order] = field(default_factory=list)
    order_detail: OrderDetail | None = None
    support_ticket: SupportTicket | None = None
    interaction: ChatInteraction | None = None

    def absorb(self, result: BaseModel) -> list[AgentEvent]:
        events: list[AgentEvent] = []
        match result:
            case SearchProductsResult():
                if result.products:
                    self.products = result.products
                    events.append(AgentEvent("products", {"products": _dump(result.products)}))
                self.suggestions = result.suggestions
                events.append(
                    AgentEvent("suggestions", {"suggestions": result.suggestions.model_dump(mode="json")})
                )
            case GetOrdersResult() if result.orders:
                self.orders = result.orders
                events.append(AgentEvent("orders", {"orders": _dump(result.orders)}))
            case GetOrderDetailResult() if result.order is not None:
                self.order_detail = result.order
                events.append(
                    AgentEvent("orderDetail", {"orderDetail": result.order.model_dump(mode="json")})
                )
            case CreateSupportTicketResult():
                self.support_ticket = result.ticket
                events.append(
                    AgentEvent("supportTicket", {"supportTicket": result.ticket.model_dump(mode="json")})
                )
            case RequestUserInputResult():
                self.interaction = result.interaction
                events.append(
                    AgentEvent("interaction", {"interaction": result.interaction.model_dump(mode="json")})
                )
        return events


def _parse_arguments(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _conversation_key(conversation_id: str | None) -> str | None:
    # Hashed so raw session ids never leave the service.
    if not conversation_id:
        return None
    return hashlib.sha256(conversation_id.encode()).hexdigest()[:16]


class AgentRunner:
    def __init__(
        self,
        *,
        settings: Settings,
        llm: ChatModelProvider,
        registry: ToolRegistry,
        tool_context: Callable[..., ToolContext],
    ) -> None:
        self._settings = settings
        self._llm = llm
        self._registry = registry
        self._tool_context = tool_context

    async def run(
        self,
        prompt: str,
        *,
        history: Sequence[ChatTurn] = (),
        filters: dict[str, Any] | None = None,
        auth: AuthContext | None = None,
        conversation_id: str | None = None,
    ) -> AgentResponse:
        async for event in self.events(
            prompt, history=history, filters=filters, auth=auth, conversation_id=conversation_id
        ):
            if event.type == "done":
                return event.data
        raise UpstreamError("Agent run ended without a result.")

    async def events(
        self,
        prompt: str,
        *,
        history: Sequence[ChatTurn] = (),
        filters: dict[str, Any] | None = None,
        auth: AuthContext | None = None,
        conversation_id: str | None = None,
        stream: bool = False,
    ) -> AsyncIterator[AgentEvent]:
        """Runs the loop and yields events; the last event is always `done`."""
        settings = self._settings
        model = self._llm.model()
        ctx = self._tool_context(auth=auth or AuthContext())
        filter_state: dict[str, Any] = dict(filters or {})
        collected = _Collected()
        records: list[ToolCallRecord] = []
        messages = self._initial_messages(prompt, history)
        conversation_key = _conversation_key(conversation_id)
        usage = Usage()
        calls_made = 0

        def result(answer: str) -> AgentResponse:
            return AgentResponse(
                answer=answer,
                products=collected.products,
                suggestions=collected.suggestions,
                orders=collected.orders,
                order_detail=collected.order_detail,
                support_ticket=collected.support_ticket,
                interaction=collected.interaction,
                tool_calls=records,
                filters=filter_state,
                usage=TokenUsage(
                    provider=model.provider,
                    model=model.model,
                    llm_calls=usage.calls,
                    input_tokens=usage.input_tokens,
                    cached_input_tokens=usage.cache_read_tokens,
                    cache_write_tokens=usage.cache_write_tokens,
                    output_tokens=usage.output_tokens,
                ),
            )

        for _ in range(settings.agent_max_turns):
            # Once the tool budget is spent, force a text answer instead of looping.
            request = ChatRequest(
                system=SYSTEM_PROMPT,
                messages=messages,
                tools=self._registry.definitions,
                tool_choice="none" if calls_made >= settings.agent_max_tool_calls else "auto",
                conversation_key=conversation_key,
            )
            completion: Completion | None = None
            async for item in model.complete(request, stream=stream):
                if isinstance(item, Completion):
                    completion = item
                else:
                    yield AgentEvent("token", {"value": item})
            if completion is None:
                raise UpstreamError("LLM returned no completion.")
            usage.add(completion.usage)
            _log_usage(model.provider, model.model, completion.usage)

            for index, call in enumerate(completion.tool_calls):
                call.id = call.id or f"call_{index}"
            messages.append(
                Message(role="assistant", content=completion.content, tool_calls=completion.tool_calls)
            )

            if not completion.tool_calls:
                yield AgentEvent("done", result(completion.content.strip()))
                return

            for call in completion.tool_calls:
                calls_made += 1
                args = _parse_arguments(call.arguments)
                if call.name == "search_products":
                    base = {} if args.get("reset") is True else filter_state
                    filter_state = merge_filters(base, args)
                    args = dict(filter_state)
                    logger.info("search_products effective filters=%s", json.dumps(args))
                else:
                    logger.info("tool %s requested (args: %s)", call.name, sorted(args))
                records.append(ToolCallRecord(name=call.name, arguments=args))
                yield AgentEvent("tool_call", {"name": call.name, "arguments": args})

                content, events = await self._execute(call.name, args, ctx, collected)
                for event in events:
                    yield event
                if call.name == "search_products":
                    yield AgentEvent("filters", {"filters": filter_state})
                messages.append(Message(role="tool", content=content, tool_call_id=call.id))

        yield AgentEvent(
            "done", result(f"Stopped after {settings.agent_max_turns} turns without a final answer.")
        )

    def _initial_messages(self, prompt: str, history: Sequence[ChatTurn]) -> list[Message]:
        settings = self._settings
        limit = settings.agent_max_history_turns
        prior = list(history)[-limit:] if limit else []
        messages: list[Message] = []
        for turn in prior:
            content = turn.content.strip()
            if not content:
                continue
            if turn.role == "assistant":
                content = content[: settings.agent_max_assistant_chars]
            messages.append(Message(role=turn.role, content=content))
        messages.append(Message(role="user", content=prompt))
        return messages

    async def _execute(
        self, name: str, args: dict[str, Any], ctx: ToolContext, collected: _Collected
    ) -> tuple[str, list[AgentEvent]]:
        """Runs a tool; failures go back to the model as text so it can explain them."""
        try:
            spec = self._registry.get(name)
            result = await spec.invoke(args, ctx)
        except AppError as exc:
            logger.warning("tool %s failed: %s", name, exc.message)
            return f"Tool error: {exc.message}", []
        except Exception:
            logger.exception("tool %s crashed", name)
            return "Tool error: unexpected failure.", []
        return spec.llm_payload(result), collected.absorb(result)


def _log_usage(provider: str, model: str, usage: Usage) -> None:
    hit = usage.cache_read_tokens / usage.input_tokens if usage.input_tokens else 0.0
    logger.info(
        "llm call provider=%s model=%s input=%d cached=%d cache_write=%d output=%d cache_hit=%.0f%%",
        provider,
        model,
        usage.input_tokens,
        usage.cache_read_tokens,
        usage.cache_write_tokens,
        usage.output_tokens,
        hit * 100,
    )
