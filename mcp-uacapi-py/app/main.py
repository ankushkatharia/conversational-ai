"""FastAPI application factory. Run: `uv run uvicorn app.main:app --reload --port 8787`."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.routing import Route

from app import __version__
from app.api.routes import agent, health, tools
from app.container import Container
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.mcp_server import McpEndpoint, build_mcp_session_manager

DESCRIPTION = """
Conversational commerce backend for the UA shopping assistant widget.

* **agent**: LLM + tools with per-session memory (`/agent` JSON, `/agent/stream` SSE).
* **tools**: deterministic tool endpoints (no LLM).
* **MCP**: the same tools over MCP Streamable HTTP at `POST /mcp` (not shown below).

Shopper context comes from headers: `Authorization: Bearer <token>`, `x-ua-locale`,
`x-ua-customer-no`, `x-ua-user-email`. Errors are returned as `{"error": "..."}`.
"""


def create_app(settings: Settings | None = None, *, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    mcp_endpoint = McpEndpoint()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        c = container or Container.build(settings)
        app.state.container = c
        manager = build_mcp_session_manager(c)
        try:
            async with manager.run():
                mcp_endpoint.manager = manager
                yield
        finally:
            mcp_endpoint.manager = None
            await c.aclose()

    app = FastAPI(
        title="UA Conversational Commerce API",
        version=__version__,
        description=DESCRIPTION,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-request-id"],
    )
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(agent.router)
    app.include_router(tools.router)
    app.router.routes.append(Route("/mcp", endpoint=mcp_endpoint))
    return app


app = create_app()
