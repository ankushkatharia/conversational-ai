from __future__ import annotations

import base64
import json

import pytest

from app.agent.filters import merge_filters
from app.clients.integration_token import jwt_expiry
from app.core.auth import auth_context_from_headers
from app.core.config import Settings
from app.schemas.agent import ChatTurn
from app.sessions import InMemorySessionStore, SessionState
from app.tools import build_registry
from app.tools.images import normalize_image_url
from app.tools.search_products import parse_price_label


def test_merge_filters_keeps_previous_values_and_ignores_blanks():
    base = {"query": "training shoes", "maxPrice": 100}
    merged = merge_filters(base, {"color": "Black", "query": " ", "reset": True, "unknown": 1})
    assert merged == {"query": "training shoes", "maxPrice": 100, "color": "Black"}


def test_auth_context_from_headers():
    auth = auth_context_from_headers(
        {"authorization": "Bearer  abc.def ", "x-ua-locale": "en-ca", "x-ua-customer-no": "c-1"}
    )
    assert (auth.bearer_token, auth.site_code, auth.language_code) == ("abc.def", "CA", "en")
    assert auth.owner_key == "c-1"
    assert "abc.def" not in repr(auth)
    explicit = auth_context_from_headers({"x-ua-locale": "en-ca", "x-ua-site-code": "US"})
    assert explicit.site_code == "US"


def test_normalize_image_url_replaces_crop_directives():
    url = normalize_image_url("https://img.test/x.jpg?rp=standard|pdp&scl=1&fmt=jpg", 400)
    assert url is not None
    assert "rp=" not in url and "scl=" not in url
    assert "fmt=jpg" in url and "wid=400" in url and "fit=constrain" in url
    assert normalize_image_url("/relative.jpg", 400) == "/relative.jpg"


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Under $25", {"maxPrice": 25}),
        ("$25 - $50", {"minPrice": 25, "maxPrice": 50}),
        ("$200 +", {"minPrice": 200}),
        ("Over $75", {"minPrice": 75}),
        ("Sale", None),
    ],
)
def test_parse_price_label(label, expected):
    assert parse_price_label(label) == expected


def test_llm_tool_schemas_are_flat_and_hide_server_fields():
    tools = {t.name: t.parameters for t in build_registry().definitions}
    assert set(tools) == {
        "search_products",
        "get_orders",
        "get_order_detail_by_order_number",
        "create_support_ticket",
        "request_user_input",
    }
    raw = json.dumps(tools)
    assert '"title"' not in raw and "$ref" not in raw and '"null"' not in raw and "auth" not in raw
    assert tools["search_products"]["properties"]["minPrice"]["type"] == "number"
    assert tools["get_order_detail_by_order_number"]["required"] == ["orderNumber"]
    assert tools["request_user_input"]["properties"]["options"]["items"]["required"] == ["label", "value"]


def test_jwt_expiry():
    payload = base64.urlsafe_b64encode(json.dumps({"exp": 1234}).encode()).decode().rstrip("=")
    assert jwt_expiry(f"h.{payload}.s") == 1234
    assert jwt_expiry("opaque-token") is None


async def test_memory_store_ttl_lru_and_isolation():
    now = [0.0]
    store = InMemorySessionStore(max_sessions=2, ttl_s=10, clock=lambda: now[0])
    state = SessionState(history=[ChatTurn(role="user", content="hi")])
    await store.save("a", state)
    await store.save("b", state)
    await store.save("c", state)
    assert await store.get("a") is None  # evicted (LRU)

    loaded = await store.get("b")
    assert loaded is not None
    loaded.history.append(ChatTurn(role="assistant", content="mutated"))
    assert len((await store.get("b")).history) == 1  # stored copy is isolated

    now[0] = 11
    assert await store.get("b") is None  # expired


def test_settings_treat_blank_env_values_as_unset(tmp_path):
    env = tmp_path / ".env"
    env.write_text("UACAPI_HEADERS=\nDEBUG_UACAPI=\nCORS_ALLOW_ORIGINS=https://a.com, https://b.com\n")
    settings = Settings(_env_file=env)
    assert settings.uacapi_headers == {}
    assert settings.debug_uacapi is False
    assert settings.cors_allow_origins == ["https://a.com", "https://b.com"]

    env.write_text('UACAPI_HEADERS={"X-Custom": "1"}\n')
    assert Settings(_env_file=env).uacapi_context_headers == {"x-custom": "1"}
