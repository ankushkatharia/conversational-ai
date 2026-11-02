"""Composition root: builds and owns the long-lived, shared service objects."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import partial

import httpx

from app.agent.runner import AgentRunner
from app.clients.integration_token import IntegrationTokenManager
from app.clients.uacapi import UacapiClient
from app.core.config import Settings
from app.llm import ChatModelProvider, LLMProvider
from app.services.agent_service import AgentService
from app.services.email import Mailer, build_mailer
from app.sessions import SessionStore, build_session_store
from app.tools import ToolContext, ToolRegistry, build_registry


@dataclass(slots=True)
class Container:
    settings: Settings
    http: httpx.AsyncClient
    registry: ToolRegistry
    sessions: SessionStore
    llm: ChatModelProvider
    agent: AgentService
    tool_context: Callable[..., ToolContext]

    @classmethod
    def build(
        cls,
        settings: Settings,
        *,
        http: httpx.AsyncClient | None = None,
        llm: ChatModelProvider | None = None,
        sessions: SessionStore | None = None,
        mailer: Mailer | None = None,
    ) -> Container:
        """Wires dependencies; pass overrides to inject fakes in tests."""
        http = http or httpx.AsyncClient(
            timeout=httpx.Timeout(settings.uacapi_timeout_ms / 1000),
            limits=httpx.Limits(
                max_connections=settings.uacapi_max_connections,
                max_keepalive_connections=settings.uacapi_max_connections,
            ),
        )
        tool_context = partial(
            ToolContext,
            settings=settings,
            uacapi=UacapiClient(settings, http),
            tokens=IntegrationTokenManager(settings, http),
            mailer=mailer or build_mailer(settings),
        )
        registry = build_registry()
        llm = llm or LLMProvider(settings)
        sessions = sessions or build_session_store(settings)
        runner = AgentRunner(settings=settings, llm=llm, registry=registry, tool_context=tool_context)
        return cls(
            settings=settings,
            http=http,
            registry=registry,
            sessions=sessions,
            llm=llm,
            agent=AgentService(settings=settings, runner=runner, sessions=sessions),
            tool_context=tool_context,
        )

    async def aclose(self) -> None:
        await self.http.aclose()
        await self.llm.aclose()
        await self.sessions.close()
