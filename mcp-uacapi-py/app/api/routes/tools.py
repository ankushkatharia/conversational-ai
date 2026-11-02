"""Direct tool endpoints (no LLM): deterministic, used by the widget for clicks and forms."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.api.deps import AuthDep, ContainerDep
from app.schemas.base import CamelModel
from app.schemas.orders import (
    GetOrderDetailResult,
    GetOrdersResult,
    OrderDetailRequest,
    OrdersRequest,
)
from app.schemas.products import SearchProductsInput, SearchProductsResult
from app.schemas.support import CreateSupportTicketResult, SupportTicketRequest
from app.tools.orders import get_order_detail, get_orders
from app.tools.search_products import search_products
from app.tools.support_ticket import create_support_ticket

router = APIRouter(tags=["tools"])


class ToolInfo(CamelModel):
    name: str
    title: str
    description: str
    read_only: bool
    input_schema: dict[str, Any]


def _site(site_id: str | None) -> str | None:
    return site_id.strip().upper() if site_id and site_id.strip() else None


@router.get("/tools", response_model=list[ToolInfo], summary="List tools (LLM and MCP schemas)")
async def list_tools(c: ContainerDep) -> list[ToolInfo]:
    return [
        ToolInfo(
            name=s.name,
            title=s.title,
            description=s.description,
            read_only=s.read_only,
            input_schema=s.input_schema,
        )
        for s in c.registry
    ]


@router.post("/search", response_model=SearchProductsResult, summary="Search products")
async def search(body: SearchProductsInput, auth: AuthDep, c: ContainerDep) -> SearchProductsResult:
    return await search_products(body, c.tool_context(auth=auth))


@router.post("/orders", response_model=GetOrdersResult, summary="Recent orders for the shopper")
async def orders(auth: AuthDep, c: ContainerDep, body: OrdersRequest | None = None) -> GetOrdersResult:
    body = body or OrdersRequest()
    auth = auth.with_fallbacks(customer_no=body.customer_no, site_code=_site(body.site_id))
    return await get_orders(body, c.tool_context(auth=auth))


@router.post("/order-detail", response_model=GetOrderDetailResult, summary="Order detail with tracking")
async def order_detail(body: OrderDetailRequest, auth: AuthDep, c: ContainerDep) -> GetOrderDetailResult:
    auth = auth.with_fallbacks(site_code=_site(body.site_id))
    return await get_order_detail(body, c.tool_context(auth=auth))


@router.post("/support-ticket", response_model=CreateSupportTicketResult, summary="Create a support ticket")
async def support_ticket(
    body: SupportTicketRequest, auth: AuthDep, c: ContainerDep
) -> CreateSupportTicketResult:
    auth = auth.with_fallbacks(user_email=body.user_email, site_code=_site(body.site_id))
    return await create_support_ticket(body, c.tool_context(auth=auth))
