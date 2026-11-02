"""Session store factory."""

from app.core.config import Settings
from app.sessions.base import SessionState, SessionStore
from app.sessions.memory import InMemorySessionStore

__all__ = ["InMemorySessionStore", "SessionState", "SessionStore", "build_session_store"]


def build_session_store(settings: Settings) -> SessionStore:
    match settings.session_backend:
        case "memory":
            return InMemorySessionStore(
                max_sessions=settings.session_max_sessions, ttl_s=settings.session_ttl_s
            )
