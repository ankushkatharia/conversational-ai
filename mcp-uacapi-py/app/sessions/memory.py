"""Process-local session store with LRU eviction and TTL.

Only valid for a single worker process: state is lost on restart and not shared between
replicas. Use a shared backend (e.g. Redis) before running multiple workers.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from collections.abc import Callable

from app.sessions.base import SessionState


class InMemorySessionStore:
    def __init__(
        self, *, max_sessions: int, ttl_s: float, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._items: OrderedDict[str, tuple[float, SessionState]] = OrderedDict()
        self._max_sessions = max_sessions
        self._ttl_s = ttl_s
        self._clock = clock

    def __len__(self) -> int:
        return len(self._items)

    async def get(self, session_id: str) -> SessionState | None:
        item = self._items.get(session_id)
        if item is None:
            return None
        expires_at, state = item
        if expires_at <= self._clock():
            del self._items[session_id]
            return None
        return state.model_copy(deep=True)

    async def save(self, session_id: str, state: SessionState) -> None:
        self._items.pop(session_id, None)
        self._items[session_id] = (self._clock() + self._ttl_s, state.model_copy(deep=True))
        while len(self._items) > self._max_sessions:
            self._items.popitem(last=False)

    async def delete(self, session_id: str) -> None:
        self._items.pop(session_id, None)

    async def close(self) -> None:
        self._items.clear()
