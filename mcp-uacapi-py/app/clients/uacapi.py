"""Async GraphQL client for UACAPI (shared connection pool, static documents + variables)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.core.config import Settings
from app.core.errors import NotConfiguredError, UpstreamError

logger = logging.getLogger(__name__)

_AUTH_ERROR = re.compile(r"unauthor|jwt expired|must have an integration token|token.*expir", re.IGNORECASE)


class UacapiRequestError(UpstreamError):
    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        graphql_errors: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.graphql_errors = graphql_errors or []

    @property
    def is_auth_error(self) -> bool:
        if self.status in (401, 403):
            return True
        return any(_AUTH_ERROR.search(str(e.get("message", ""))) for e in self.graphql_errors)


class UacapiClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http
        self._static_headers = settings.uacapi_context_headers

    async def request(
        self,
        query: str,
        variables: dict[str, Any],
        *,
        bearer_token: str | None = None,
        context_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Executes a GraphQL operation and returns `data`.

        `bearer_token` (the shopper or integration token) overrides the static token, and
        `context_headers` override the static site/language headers.
        """
        endpoint = self._settings.uacapi_endpoint
        if not endpoint:
            raise NotConfiguredError("UACAPI_ENDPOINT is not configured.")

        headers = {
            "content-type": "application/json",
            "accept": "application/json",
            **self._static_headers,
            **(context_headers or {}),
        }
        static_token = self._settings.uacapi_bearer_token
        token = bearer_token or (static_token.get_secret_value() if static_token else None)
        if token:
            headers["authorization"] = f"Bearer {token}"

        payload = {
            "query": query,
            "variables": {k: v for k, v in variables.items() if v is not None},
        }
        if self._settings.debug_uacapi:
            safe = {k: ("Bearer <redacted>" if k == "authorization" else v) for k, v in headers.items()}
            logger.info(
                "UACAPI -> %s headers=%s variables=%s", endpoint, safe, json.dumps(payload["variables"])
            )

        try:
            response = await self._http.post(endpoint, json=payload, headers=headers)
        except httpx.TimeoutException as exc:
            raise UacapiRequestError("UACAPI request timed out.") from exc
        except httpx.HTTPError as exc:
            raise UacapiRequestError(f"UACAPI request failed: {exc}") from exc

        if response.status_code >= 400:
            raise UacapiRequestError(
                f"UACAPI returned HTTP {response.status_code}. {response.text[:500]}".strip(),
                status=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise UacapiRequestError("UACAPI returned invalid JSON.") from exc

        if errors := body.get("errors"):
            summary = "; ".join(str(e.get("message", "")) for e in errors)
            raise UacapiRequestError(f"UACAPI GraphQL error: {summary}", graphql_errors=errors)
        data = body.get("data")
        if not data:
            raise UacapiRequestError("UACAPI returned an empty data payload.")
        return data
