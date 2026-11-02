from __future__ import annotations

import copy
import json
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.container import Container
from app.core.config import Settings
from app.llm import StaticModelProvider
from app.llm.openai_chat import OpenAIChatModel
from app.main import create_app

SEARCH_RESPONSE = {
    "data": {
        "search": {
            "totalCount": 1,
            "count": 1,
            "pageInfo": {"hasNextPage": False, "hasPreviousPage": False, "endCursor": "c1"},
            "refinementAttributes": [
                {
                    "attributeId": "c_colorgroup",
                    "label": "Color",
                    "values": [
                        {"label": "Black", "hitCount": 5, "selected": False},
                        {"label": "Blue", "hitCount": 9, "selected": False},
                    ],
                },
                {
                    "attributeId": "price",
                    "label": "Price",
                    "values": [
                        {"label": "Under $25", "hitCount": 3, "selected": False},
                        {"label": "$25 - $50", "hitCount": 4, "selected": False},
                    ],
                },
                {
                    "attributeId": "c_size",
                    "label": "Size",
                    "values": [{"label": "M", "hitCount": 2, "selected": False}],
                },
            ],
            "sortingOptions": [{"id": "top-sellers", "label": "Top Sellers", "selected": True}],
            "edges": [
                {
                    "node": {
                        "id": "p1",
                        "slicedProductId": "3026",
                        "productName": "UA HOVR",
                        "url": "/p/1",
                        "orderable": True,
                        "currency": "USD",
                        "prices": {"list": {"min": 120, "max": 120}, "sale": {"min": 90, "max": 100}},
                        "colors": [
                            {
                                "color": "001",
                                "name": "Black",
                                "hex": "#000",
                                "orderable": True,
                                "assets": {
                                    "images": [
                                        {
                                            "url": "https://img.test/a.jpg?rp=x&scl=1&fmt=jpg",
                                            "viewType": "grid",
                                        },
                                        {"url": "https://img.test/b.jpg?scl=1", "viewType": "default"},
                                    ]
                                },
                            }
                        ],
                    }
                }
            ],
        }
    }
}

ORDER_NODE = {
    "orderNo": "US-1",
    "creationDate": "2026-10-01",
    "status": "Fulfilled",
    "orderType": "WEB",
    "currency": "USD",
    "productTotal": 100,
    "shippingTotal": 5,
    "taxTotal": 8,
    "orderTotal": 113,
    "orderItems": [
        {
            "fulfillmentStatus": "Shipped",
            "productItem": {
                "quantity": 1,
                "product": {
                    "sku": "sku1",
                    "copy": {"name": "Tee"},
                    "prices": {"sale": 40, "base": 50, "discount": 10, "total": 40},
                    "assets": {"images": [{"url": "https://img.test/t.jpg", "viewType": "default"}]},
                },
            },
        }
    ],
    "fulfillmentGroups": [
        {
            "type": "SHIP",
            "fulfillmentStatus": "Fulfilled",
            "shipment": {
                "shipmentId": "s1",
                "trackingNumber": "1Z",
                "trackingLink": "https://track.test/1Z",
                "estimatedDelivery": "2026-10-05",
                "dateShipped": "2026-10-02",
                "dateDelivered": None,
            },
        },
        {"type": "PICKUP", "fulfillmentStatus": "Open", "shipment": None},
    ],
}


class FakeUacapi:
    """MockTransport handler: records GraphQL calls and answers by operation name."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.calls.append(
            {"query": body["query"], "variables": body["variables"], "headers": dict(request.headers)}
        )
        query = body["query"]
        if "McpSearchProducts" in query:
            return httpx.Response(200, json=SEARCH_RESPONSE)
        if "McpGetOrderDetail" in query or "McpGetOrders" in query:
            return httpx.Response(
                200, json={"data": {"orders": {"totalCount": 1, "edges": [{"node": ORDER_NODE}]}}}
            )
        return httpx.Response(200, json={"errors": [{"message": "unknown operation"}]})

    def last(self, operation: str) -> dict[str, Any]:
        return [c for c in self.calls if operation in c["query"]][-1]


def _ns(**kwargs: Any) -> SimpleNamespace:
    return SimpleNamespace(**kwargs)


class FakeLLM:
    """Scripted OpenAI-compatible client. Each step: {"content": str, "tool_calls": [(name, args)]}."""

    # Every scripted call reports 1000 prompt tokens, 800 of them served from the prompt cache.
    USAGE = _ns(
        prompt_tokens=1000,
        completion_tokens=20,
        prompt_tokens_details=_ns(cached_tokens=800, cache_write_tokens=None),
    )

    def __init__(self) -> None:
        self.script: list[dict[str, Any]] = []
        self.requests: list[dict[str, Any]] = []
        self.chat = _ns(completions=_ns(create=self._create))

    async def _create(self, **kwargs: Any) -> Any:
        self.requests.append(copy.deepcopy({k: v for k, v in kwargs.items() if k != "tools"}))
        step = self.script.pop(0)
        calls = [
            _ns(id=f"call_{i}", type="function", function=_ns(name=name, arguments=json.dumps(args)))
            for i, (name, args) in enumerate(step.get("tool_calls", []))
        ]
        if kwargs.get("stream"):
            return self._stream(step.get("content", ""), calls)
        message = _ns(content=step.get("content"), tool_calls=calls or None)
        return _ns(choices=[_ns(message=message)], usage=self.USAGE)

    @classmethod
    async def _stream(cls, content: str, calls: list[SimpleNamespace]):
        for word in content.split(" ") if content else []:
            yield _ns(choices=[_ns(delta=_ns(content=word + " ", tool_calls=None))])
        for i, call in enumerate(calls):
            delta = _ns(index=i, id=call.id, function=call.function)
            yield _ns(choices=[_ns(delta=_ns(content=None, tool_calls=[delta]))])
        yield _ns(choices=[], usage=cls.USAGE)  # include_usage: totals arrive in a final empty chunk


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        uacapi_endpoint="https://uacapi.test/graphql",
        openai_api_key="test-key",
        openai_base_url="https://llm.test/v1",
        uacapi_integration_token="static-integration-token",
        log_level="WARNING",
    )


@pytest.fixture
def uacapi() -> FakeUacapi:
    return FakeUacapi()


@pytest.fixture
def llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(settings: Settings, uacapi: FakeUacapi, llm: FakeLLM) -> Iterator[TestClient]:
    http = httpx.AsyncClient(transport=httpx.MockTransport(uacapi))
    model = OpenAIChatModel(settings, client=llm)
    container = Container.build(settings, http=http, llm=StaticModelProvider(model))
    with TestClient(create_app(settings, container=container)) as test_client:
        yield test_client
