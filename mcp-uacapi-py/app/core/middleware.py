"""ASGI middleware."""

from __future__ import annotations

import logging
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id_var

logger = logging.getLogger("app.access")


class RequestContextMiddleware:
    """Assigns an `x-request-id` and logs one access line per request.

    Implemented as pure ASGI (not BaseHTTPMiddleware) so SSE responses are never buffered.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = (Headers(scope=scope).get("x-request-id") or uuid.uuid4().hex)[:64]
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message).append("x-request-id", request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info("%s %s -> %s (%.1f ms)", scope["method"], scope["path"], status, elapsed_ms)
            request_id_var.reset(token)
