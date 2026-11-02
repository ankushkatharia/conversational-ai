"""Shopping assistant endpoints."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterable
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

from app.api.deps import AuthDep, ContainerDep
from app.core.errors import AppError
from app.schemas.agent import AgentRequest, AgentResponse
from app.services.agent_service import PreparedTurn

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent"])


async def _prepare_turn(body: AgentRequest, auth: AuthDep, c: ContainerDep) -> PreparedTurn:
    # Runs as a dependency so bad input returns a normal 400 before an SSE stream opens.
    return await c.agent.prepare(body, auth)


TurnDep = Annotated[PreparedTurn, Depends(_prepare_turn)]


@router.post("/agent", response_model=AgentResponse, summary="Ask the assistant (JSON response)")
async def run_agent(turn: TurnDep, auth: AuthDep, c: ContainerDep) -> AgentResponse:
    return await c.agent.run(turn, auth)


@router.post(
    "/agent/stream",
    response_class=EventSourceResponse,
    summary="Ask the assistant (Server-Sent Events)",
    description=(
        "Streams events as they happen: `token` {value}, `tool_call` {name, arguments}, "
        "`products`, `suggestions`, `filters`, `orders`, `orderDetail`, `supportTicket`, "
        "`interaction`, then `done` (the full /agent response) or `error` {error}."
    ),
)
async def stream_agent(turn: TurnDep, auth: AuthDep, c: ContainerDep) -> AsyncIterable[ServerSentEvent]:
    try:
        async for event in c.agent.stream(turn, auth):
            data = event.data.model_dump(mode="json") if isinstance(event.data, BaseModel) else event.data
            yield ServerSentEvent(event=event.type, data=data)
    except AppError as exc:
        yield ServerSentEvent(event="error", data={"error": exc.message})
    except Exception:
        logger.exception("Agent stream failed")
        yield ServerSentEvent(event="error", data={"error": "Internal server error."})


@router.delete(
    "/agent/sessions/{session_id}",
    status_code=204,
    summary="Forget a conversation's server-side memory (e.g. on 'New chat')",
)
async def delete_session(session_id: str, auth: AuthDep, c: ContainerDep) -> Response:
    await c.agent.end_session(session_id, auth)
    return Response(status_code=204)
