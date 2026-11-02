"""Integration (M2M) token manager for shield-gated back-office queries such as `orders`.

Resolution order: cached minted token -> valid static UACAPI_INTEGRATION_TOKEN -> mint via
Auth0 client credentials -> the (possibly expired) static token.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Any

import httpx

from app.clients.uacapi import UacapiClient, UacapiRequestError
from app.core.config import Settings
from app.core.errors import UpstreamError

logger = logging.getLogger(__name__)

EXPIRY_SKEW_S = 60.0


def jwt_expiry(token: str) -> float | None:
    """Returns the JWT `exp` (epoch seconds), or None when it cannot be read."""
    parts = token.split(".")
    if len(parts) < 2:
        return None
    try:
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        exp = json.loads(base64.urlsafe_b64decode(padded)).get("exp")
    except (ValueError, AttributeError):
        return None
    return float(exp) if isinstance(exp, int | float) else None


def _is_expired(token: str) -> bool:
    exp = jwt_expiry(token)
    return exp is not None and exp - EXPIRY_SKEW_S <= time.time()


class IntegrationTokenManager:
    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http
        self._cached: tuple[str, float] | None = None
        self._lock = asyncio.Lock()

    def _static(self) -> str | None:
        token = self._settings.uacapi_integration_token
        return token.get_secret_value() if token else None

    def _cached_token(self) -> str | None:
        if self._cached and self._cached[1] - EXPIRY_SKEW_S > time.time():
            return self._cached[0]
        return None

    async def get_token(self, *, force_refresh: bool = False) -> str | None:
        if not force_refresh:
            if cached := self._cached_token():
                return cached
            static = self._static()
            if static and not _is_expired(static):
                return static

        if not self._settings.auth0_token_url:
            static = self._static()
            if static and _is_expired(static):
                logger.warning("UACAPI_INTEGRATION_TOKEN is expired and Auth0 auto-mint is not configured.")
            return static

        seen = self._cached
        async with self._lock:
            # Another request may have minted while this one waited for the lock.
            if self._cached is not seen and (cached := self._cached_token()):
                return cached
            try:
                return await self._mint()
            except UpstreamError:
                if static := self._static():
                    logger.warning("Auth0 mint failed; falling back to the static integration token.")
                    return static
                raise

    async def _mint(self) -> str:
        s = self._settings
        assert s.auth0_token_url and s.uacapi_auth0_client_secret  # guaranteed by the caller
        try:
            response = await self._http.post(
                s.auth0_token_url,
                json={
                    "grant_type": "client_credentials",
                    "client_id": s.uacapi_auth0_client_id,
                    "client_secret": s.uacapi_auth0_client_secret.get_secret_value(),
                    "audience": s.uacapi_auth0_audience,
                },
            )
        except httpx.HTTPError as exc:
            raise UpstreamError(f"Auth0 token mint failed: {exc}") from exc
        if response.status_code >= 400:
            raise UpstreamError(
                f"Auth0 token mint failed: HTTP {response.status_code}. {response.text[:300]}"
            )

        data: dict[str, Any] = response.json()
        token = data.get("access_token")
        if not isinstance(token, str) or not token:
            raise UpstreamError("Auth0 token mint returned no access_token.")
        expires_in = data.get("expires_in")
        expires_at = jwt_expiry(token) or time.time() + (
            expires_in if isinstance(expires_in, int | float) else 3600
        )
        self._cached = (token, expires_at)
        logger.info("Minted integration token via Auth0 (valid for %.0fs).", expires_at - time.time())
        return token

    async def request(
        self,
        client: UacapiClient,
        query: str,
        variables: dict[str, Any],
        *,
        context_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Runs a query with the integration token, retrying once with a fresh token on 401."""
        token = await self.get_token()
        try:
            return await client.request(query, variables, bearer_token=token, context_headers=context_headers)
        except UacapiRequestError as exc:
            if not (token and self._settings.auth0_token_url and exc.is_auth_error):
                raise
            logger.warning("Integration token rejected; refreshing and retrying once.")
            fresh = await self.get_token(force_refresh=True)
            return await client.request(query, variables, bearer_token=fresh, context_headers=context_headers)
