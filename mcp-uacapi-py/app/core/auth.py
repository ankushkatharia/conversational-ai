"""Per-request shopper identity and locale, derived from HTTP headers."""

from __future__ import annotations

import dataclasses
from collections.abc import Mapping
from dataclasses import dataclass, field

from app.core.config import clean_token


@dataclass(frozen=True, slots=True)
class AuthContext:
    """Shopper context injected into tool calls. Never sent to the LLM and never logged."""

    bearer_token: str | None = field(default=None, repr=False)
    site_code: str | None = None
    language_code: str | None = None
    customer_no: str | None = None
    user_email: str | None = field(default=None, repr=False)

    @property
    def owner_key(self) -> str | None:
        """Identity that server-side sessions are bound to (None for guests)."""
        return self.customer_no

    def context_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.site_code:
            headers["ua-site-code"] = self.site_code
        if self.language_code:
            headers["ua-language-code"] = self.language_code
        return headers

    def with_fallbacks(self, **values: str | None) -> AuthContext:
        """Fills only fields that are still empty, so headers take precedence over body values."""
        updates = {k: v for k, v in values.items() if v and getattr(self, k) is None}
        return dataclasses.replace(self, **updates) if updates else self


def auth_context_from_headers(headers: Mapping[str, str]) -> AuthContext:
    """Builds the context from `Authorization`, `x-ua-locale` (e.g. "en-us"), and `x-ua-*` headers.

    Explicit `x-ua-site-code` / `x-ua-language-code` headers win over the locale.
    """

    def get(name: str) -> str | None:
        value = headers.get(name)
        return (value.strip() or None) if value else None

    language = get("x-ua-language-code")
    site = get("x-ua-site-code")
    locale = get("x-ua-locale")
    if locale and (not language or not site):
        lang, _, region = locale.partition("-")
        language = language or lang.lower() or None
        site = site or region.upper() or None

    return AuthContext(
        bearer_token=clean_token(get("authorization")),
        site_code=site,
        language_code=language,
        customer_no=get("x-ua-customer-no"),
        user_email=get("x-ua-user-email"),
    )
