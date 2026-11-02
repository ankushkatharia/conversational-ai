"""Conversation orchestration: session memory around the agent loop."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from app.agent.runner import AgentEvent, AgentRunner
from app.core.auth import AuthContext
from app.core.config import Settings
from app.schemas.agent import AgentRequest, AgentResponse, ChatTurn
from app.sessions.base import SessionState, SessionStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class PreparedTurn:
    prompt: str
    session_id: str | None
    history: list[ChatTurn]
    filters: dict[str, Any]


class AgentService:
    def __init__(self, *, settings: Settings, runner: AgentRunner, sessions: SessionStore) -> None:
        self._settings = settings
        self._runner = runner
        self._sessions = sessions

    async def prepare(self, request: AgentRequest, auth: AuthContext) -> PreparedTurn:
        """Validates the request and loads session memory (done before any streaming starts)."""
        prompt, client_history = request.resolve()
        session_id = request.session_id or (
            None if request.messages is not None else self._settings.agent_default_session
        )
        state: SessionState | None = None
        if session_id:
            state = await self._sessions.get(session_id)
            if state and state.owner and state.owner != auth.owner_key:
                # Never read or overwrite another shopper's conversation.
                logger.warning("Session owned by a different shopper; ignoring it for this turn.")
                state, session_id = None, None
        return PreparedTurn(
            prompt=prompt,
            session_id=session_id,
            history=[*(state.history if state else []), *client_history],
            filters=dict(state.filters) if state else {},
        )

    async def run(self, turn: PreparedTurn, auth: AuthContext) -> AgentResponse:
        result = await self._runner.run(
            turn.prompt,
            history=turn.history,
            filters=turn.filters,
            auth=auth,
            conversation_id=turn.session_id,
        )
        await self._persist(turn, result, auth)
        return result

    async def stream(self, turn: PreparedTurn, auth: AuthContext) -> AsyncIterator[AgentEvent]:
        async for event in self._runner.events(
            turn.prompt,
            history=turn.history,
            filters=turn.filters,
            auth=auth,
            conversation_id=turn.session_id,
            stream=True,
        ):
            if event.type == "done":
                await self._persist(turn, event.data, auth)
            yield event

    async def end_session(self, session_id: str, auth: AuthContext) -> None:
        state = await self._sessions.get(session_id)
        if state and (not state.owner or state.owner == auth.owner_key):
            await self._sessions.delete(session_id)

    async def _persist(self, turn: PreparedTurn, result: AgentResponse, auth: AuthContext) -> None:
        if not turn.session_id:
            return
        max_turns = self._settings.session_max_turns
        history = [
            *turn.history,
            ChatTurn(role="user", content=turn.prompt),
            ChatTurn(role="assistant", content=result.answer),
        ]
        await self._sessions.save(
            turn.session_id,
            SessionState(
                history=history[-max_turns:] if max_turns else [],
                filters=result.filters,
                owner=auth.owner_key,
            ),
        )
