"""FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.container import Container
from app.core.auth import AuthContext, auth_context_from_headers


def get_container(request: Request) -> Container:
    return request.app.state.container


ContainerDep = Annotated[Container, Depends(get_container)]

_bearer = HTTPBearer(auto_error=False, description="Shopper UACAPI token (guest or registered). Optional.")


def get_auth(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    x_ua_locale: Annotated[
        str | None, Header(description='Shopper locale, e.g. "en-us" -> site US, language en.')
    ] = None,
    x_ua_site_code: Annotated[str | None, Header(description="Overrides the locale's site.")] = None,
    x_ua_language_code: Annotated[str | None, Header(description="Overrides the locale's language.")] = None,
    x_ua_customer_no: Annotated[
        str | None, Header(description="Shopper customer number (UUID) for order lookups.")
    ] = None,
    x_ua_user_email: Annotated[
        str | None, Header(description="Shopper login email (support-ticket fallback).")
    ] = None,
) -> AuthContext:
    headers = {
        "authorization": credentials.credentials if credentials else None,
        "x-ua-locale": x_ua_locale,
        "x-ua-site-code": x_ua_site_code,
        "x-ua-language-code": x_ua_language_code,
        "x-ua-customer-no": x_ua_customer_no,
        "x-ua-user-email": x_ua_user_email,
    }
    return auth_context_from_headers({k: v for k, v in headers.items() if v})


AuthDep = Annotated[AuthContext, Depends(get_auth)]
