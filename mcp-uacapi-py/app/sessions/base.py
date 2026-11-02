"""Session store contract. Swap the in-memory implementation for Redis without touching callers."""

from __future__ import annotations

from typing import Any, Protocol

from pydantic import BaseModel, Field

from app.schemas.agent import ChatTurn


class SessionState(BaseModel):
    history: list[ChatTurn] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    owner: str | None = None


class SessionStore(Protocol):
    async def get(self, session_id: str) -> SessionState | None: ...

    async def save(self, session_id: str, state: SessionState) -> None: ...

    async def delete(self, session_id: str) -> None: ...

    async def close(self) -> None: ...
