from __future__ import annotations

import json

LOCALE_US = {"x-ua-locale": "en-us"}


def _sse_events(text: str) -> list[tuple[str, dict]]:
    events, current = [], None
    for line in text.splitlines():
        if line.startswith("event:"):
            current = line.split(":", 1)[1].strip()
        elif line.startswith("data:") and current:
            events.append((current, json.loads(line.split(":", 1)[1])))
            current = None
    return events


def test_health_and_openapi(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/agent", "/agent/stream", "/search", "/orders", "/order-detail", "/support-ticket"} <= set(paths)


def test_response_carries_request_id(client):
    response = client.get("/health", headers={"x-request-id": "req-123"})
    assert response.headers["x-request-id"] == "req-123"


def test_search_maps_products_and_forwards_shopper_context(client, uacapi):
    response = client.post(
        "/search",
        json={"query": "shoes", "color": "black", "maxPrice": 100},
        headers={"Authorization": "Bearer shopper-token", "x-ua-locale": "en-ca"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    product = body["products"][0]
    assert product["style"] == "3026"
    assert product["price"]["list"] == {"min": 120, "max": 120}
    assert "b.jpg" in product["imageUrl"] and "wid=600" in product["imageUrl"]
    color_group, price_group = body["suggestions"]["refinements"]
    assert [v["label"] for v in color_group["values"]] == ["Blue", "Black"]
    assert price_group["values"][0]["delta"] == {"minPrice": 25, "maxPrice": 50}
    assert body["suggestions"]["sorts"][0]["delta"] == {"sort": "top-sellers"}

    call = uacapi.last("McpSearchProducts")
    refinement = call["variables"]["refinement"]
    assert refinement["price"] == {"from": 0, "to": 100}
    assert {"attributeId": "c_colorgroup", "values": ["Black"]} in refinement["customRefinements"]
    assert "sort" not in call["variables"]
    assert call["headers"]["authorization"] == "Bearer shopper-token"
    assert call["headers"]["ua-site-code"] == "CA"


def test_search_requires_query_or_category(client):
    response = client.post("/search", json={"color": "Black"})
    assert response.status_code == 400
    assert "query" in response.json()["error"]


def test_orders_require_customer_number(client):
    response = client.post("/orders", json={}, headers=LOCALE_US)
    assert response.status_code == 400
    assert "customer number" in response.json()["error"]


def test_orders_use_integration_token(client, uacapi):
    response = client.post(
        "/orders",
        json={"limit": 2},
        headers={**LOCALE_US, "x-ua-customer-no": "cust-1", "Authorization": "Bearer shopper"},
    )
    assert response.status_code == 200, response.text
    order = response.json()["orders"][0]
    assert order["totals"]["grandTotal"] == 113 and order["totals"]["discount"] == 10
    assert order["items"][0]["price"] == 40
    call = uacapi.last("McpGetOrders")
    assert call["variables"] == {"first": 2, "siteId": "US", "customerNo": "cust-1"}
    assert call["headers"]["authorization"] == "Bearer static-integration-token"


def test_order_detail_found_and_missing(client):
    headers = {**LOCALE_US, "x-ua-customer-no": "cust-1"}
    found = client.post("/order-detail", json={"orderNumber": "US-1"}, headers=headers).json()
    assert found["order"]["shipments"] == [
        {
            "trackingNumber": "1Z",
            "trackingLink": "https://track.test/1Z",
            "status": "Fulfilled",
            "estimatedDelivery": "2026-10-05",
            "dateShipped": "2026-10-02",
            "dateDelivered": None,
        }
    ]
    missing = client.post("/order-detail", json={"orderNumber": "US-404"}, headers=headers).json()
    assert missing == {"order": None}


def test_support_ticket_validation_and_creation(client):
    payload = {"category": "order", "description": "Late delivery", "preferredContact": "call"}
    bad = client.post("/support-ticket", json=payload)
    assert bad.status_code == 400 and "phone" in bad.json()["error"]

    ok = client.post(
        "/support-ticket",
        json={**payload, "preferredContact": "ticket"},
        headers={"x-ua-user-email": "shopper@test.com"},
    )
    assert ok.status_code == 200, ok.text
    ticket = ok.json()["ticket"]
    assert ticket["ref"].startswith("UA-HELP-")
    assert ticket["contactEmail"] == "shopper@test.com" and ticket["delivered"] is False


def test_agent_remembers_filters_and_history_per_session(client, llm, uacapi):
    llm.script = [
        {"tool_calls": [("search_products", {"query": "training shoes", "sort": "top-sellers"})]},
        {"content": "Here are training shoes:"},
        {"tool_calls": [("search_products", {"maxPrice": 100})]},
        {"content": "Here they are under $100:"},
    ]
    headers = {"x-ua-customer-no": "cust-1"}
    first = client.post("/agent", json={"sessionId": "s1", "prompt": "training shoes"}, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["products"][0]["name"] == "UA HOVR"

    second = client.post("/agent", json={"sessionId": "s1", "prompt": "under $100"}, headers=headers).json()
    assert second["filters"] == {"query": "training shoes", "sort": "top-sellers", "maxPrice": 100}
    assert uacapi.last("McpSearchProducts")["variables"]["q"] == "training shoes"

    replayed = [m["content"] for m in llm.requests[2]["messages"] if m["role"] in ("user", "assistant")]
    assert replayed[:3] == ["training shoes", "Here are training shoes:", "under $100"]
    tool_message = next(m for m in llm.requests[1]["messages"] if m["role"] == "tool")
    assert "imageUrl" not in tool_message["content"]  # compact LLM view

    # Usage is summed over both model calls of the turn (tool call + final answer).
    assert second["usage"] == {
        "provider": "openai",
        "model": "openai.gpt-oss-120b",
        "llmCalls": 2,
        "inputTokens": 2000,
        "cachedInputTokens": 1600,
        "cacheWriteTokens": 0,
        "outputTokens": 40,
    }
    # The cacheable prefix (system prompt, then tools) is identical on every call.
    assert llm.requests[0]["messages"][0] == llm.requests[3]["messages"][0]
    assert "prompt_cache_key" not in llm.requests[0]  # opt-in: not every compatible endpoint accepts it


def test_agent_session_is_not_shared_across_shoppers(client, llm):
    llm.script = [{"content": "Hi A"}, {"content": "Hi B"}]
    client.post(
        "/agent", json={"sessionId": "shared", "prompt": "secret from A"}, headers={"x-ua-customer-no": "A"}
    )
    client.post("/agent", json={"sessionId": "shared", "prompt": "hello"}, headers={"x-ua-customer-no": "B"})
    contents = [m["content"] for m in llm.requests[1]["messages"]]
    assert "secret from A" not in contents


def test_delete_session_forgets_memory(client, llm):
    llm.script = [{"content": "first"}, {"content": "second"}]
    client.post("/agent", json={"sessionId": "s2", "prompt": "remember me"})
    assert client.delete("/agent/sessions/s2").status_code == 204
    client.post("/agent", json={"sessionId": "s2", "prompt": "again"})
    assert "remember me" not in [m["content"] for m in llm.requests[1]["messages"]]


def test_agent_rejects_empty_prompt(client):
    response = client.post("/agent", json={"prompt": "  "})
    assert response.status_code == 400
    assert "prompt" in response.json()["error"]


def test_agent_stream_emits_events_in_order(client, llm):
    llm.script = [
        {"tool_calls": [("search_products", {"query": "hoodies"})]},
        {"content": "Here are some hoodies"},
    ]
    with client.stream("POST", "/agent/stream", json={"prompt": "hoodies"}) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        events = _sse_events(response.read().decode())

    names = [name for name, _ in events]
    assert names[0] == "tool_call"
    assert {"products", "suggestions", "filters", "token"} <= set(names)
    assert names[-1] == "done"
    tokens = "".join(data["value"] for name, data in events if name == "token")
    assert tokens.strip() == "Here are some hoodies"
    assert events[-1][1]["answer"] == "Here are some hoodies"
    assert events[-1][1]["usage"]["cachedInputTokens"] == 1600
    assert llm.requests[0]["stream"] is True
    assert llm.requests[0]["stream_options"] == {"include_usage": True}


def test_agent_stream_reports_llm_errors_as_events(client, llm):
    llm.script = []  # the fake raises when no step is scripted
    with client.stream("POST", "/agent/stream", json={"prompt": "hi"}) as response:
        events = _sse_events(response.read().decode())
    assert events == [("error", {"error": "Internal server error."})]


def test_mcp_endpoint_lists_and_calls_tools(client, uacapi):
    headers = {"accept": "application/json, text/event-stream", "x-ua-locale": "en-us"}
    rpc = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    listed = client.post("/mcp", json=rpc, headers=headers)
    assert listed.status_code == 200, listed.text
    tools = {t["name"]: t for t in listed.json()["result"]["tools"]}
    assert tools["search_products"]["annotations"]["readOnlyHint"] is True
    assert tools["create_support_ticket"]["annotations"]["readOnlyHint"] is False

    call = {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "search_products", "arguments": {"query": "socks"}}}  # fmt: skip
    result = client.post("/mcp", json=call, headers=headers).json()["result"]
    assert not result.get("isError")
    assert result["structuredContent"]["products"][0]["name"] == "UA HOVR"
    assert uacapi.last("McpSearchProducts")["headers"]["ua-site-code"] == "US"

    bad = {**call, "id": 3, "params": {"name": "search_products", "arguments": {}}}
    assert client.post("/mcp", json=bad, headers=headers).json()["result"]["isError"] is True
