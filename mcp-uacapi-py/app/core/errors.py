"""Application error types and their `{"error": ...}` HTTP mapping (the widget reads `error`)."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 500

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code


class BadRequestError(AppError):
    """Invalid input or missing shopper context."""

    status_code = 400


class NotConfiguredError(AppError):
    """A required integration (LLM, UACAPI) is not configured."""

    status_code = 503


class UpstreamError(AppError):
    """UACAPI, Auth0, or the LLM failed."""

    status_code = 502


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.warning("%s: %s", type(exc).__name__, exc.message)
        return JSONResponse(status_code=exc.status_code, content={"error": exc.message})

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")}
            for e in exc.errors()
        ]
        first = details[0]["msg"] if details else "Invalid request."
        return JSONResponse(
            status_code=400, content={"error": f"Invalid request: {first}", "details": details}
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled error", exc_info=exc)
        return JSONResponse(status_code=500, content={"error": "Internal server error."})
