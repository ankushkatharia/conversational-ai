"""`get_orders` and `get_order_detail_by_order_number`: read-only order history and tracking."""

from __future__ import annotations

import logging
from typing import Any

from app.clients.queries import GET_ORDER_DETAIL_QUERY, GET_ORDERS_QUERY
from app.core.errors import BadRequestError
from app.schemas.orders import (
    GetOrderDetailInput,
    GetOrderDetailResult,
    GetOrdersInput,
    GetOrdersResult,
    Order,
    OrderDetail,
    OrderItem,
    OrderShipment,
    OrderTotals,
)
from app.tools.base import ToolContext, ToolSpec
from app.tools.images import pick_image_url

logger = logging.getLogger(__name__)

DEFAULT_ORDERS_LIMIT = 3
# The `orders` resolver cannot filter by order number, so detail lookups scan this window.
ORDER_DETAIL_WINDOW = 50


def _site_and_customer(ctx: ToolContext, what: str) -> tuple[str, str]:
    site = ctx.auth.site_code or ctx.settings.uacapi_site_code
    customer = ctx.auth.customer_no or ctx.settings.uacapi_customer_no
    if not site:
        raise BadRequestError(
            f'Missing site context: a site code (e.g. "US"/"CA") is required to fetch {what}.'
        )
    if not customer:
        raise BadRequestError(f"Missing customer number: cannot fetch {what} without a customerNo.")
    return site.upper(), customer


def _order_fields(node: dict[str, Any], image_size: int) -> dict[str, Any]:
    raw_items = node.get("orderItems") or []
    items: list[OrderItem] = []
    discount = 0.0
    for raw in raw_items:
        product_item = raw.get("productItem") or {}
        product = product_item.get("product") or {}
        prices = product.get("prices") or {}
        sale = prices.get("sale")
        if isinstance(prices.get("discount"), int | float):
            discount += prices["discount"]
        items.append(
            OrderItem(
                name=(product.get("copy") or {}).get("name"),
                sku=product.get("sku"),
                quantity=product_item.get("quantity"),
                price=sale if sale is not None else prices.get("base"),
                fulfillment_status=raw.get("fulfillmentStatus"),
                image_url=pick_image_url((product.get("assets") or {}).get("images"), image_size),
            )
        )
    return {
        "order_no": node.get("orderNo"),
        "creation_date": node.get("creationDate"),
        "status": node.get("status"),
        "order_type": node.get("orderType"),
        "currency": node.get("currency"),
        "totals": OrderTotals(
            subtotal=node.get("productTotal"),
            shipping=node.get("shippingTotal"),
            tax=node.get("taxTotal"),
            grand_total=node.get("orderTotal"),
            discount=discount if items else None,
        ),
        "items": items,
    }


def _shipments(node: dict[str, Any]) -> list[OrderShipment]:
    return [
        OrderShipment(
            tracking_number=shipment.get("trackingNumber"),
            tracking_link=shipment.get("trackingLink"),
            status=group.get("fulfillmentStatus"),
            estimated_delivery=shipment.get("estimatedDelivery"),
            date_shipped=shipment.get("dateShipped"),
            date_delivered=shipment.get("dateDelivered"),
        )
        for group in node.get("fulfillmentGroups") or []
        if (shipment := group.get("shipment"))
    ]


def _edges(data: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    connection = data.get("orders") or {}
    nodes = [edge["node"] for edge in connection.get("edges") or [] if edge and edge.get("node")]
    return connection.get("totalCount") or 0, nodes


async def get_orders(params: GetOrdersInput, ctx: ToolContext) -> GetOrdersResult:
    site, customer = _site_and_customer(ctx, "orders")
    variables = {"first": params.limit or DEFAULT_ORDERS_LIMIT, "siteId": site, "customerNo": customer}
    logger.info("get_orders first=%s siteId=%s", variables["first"], site)
    # `orders` is shield-gated to integration (machine) tokens; shopper tokens are rejected.
    data = await ctx.tokens.request(
        ctx.uacapi, GET_ORDERS_QUERY, variables, context_headers=ctx.auth.context_headers()
    )
    total, nodes = _edges(data)
    size = ctx.settings.uacapi_image_size
    orders = [Order(**_order_fields(node, size)) for node in nodes]
    return GetOrdersResult(total_count=total, count=len(orders), orders=orders)


async def get_order_detail(params: GetOrderDetailInput, ctx: ToolContext) -> GetOrderDetailResult:
    site, customer = _site_and_customer(ctx, "order detail")
    variables = {"first": ORDER_DETAIL_WINDOW, "siteId": site, "customerNo": customer}
    logger.info("get_order_detail siteId=%s window=%s", site, ORDER_DETAIL_WINDOW)
    data = await ctx.tokens.request(
        ctx.uacapi, GET_ORDER_DETAIL_QUERY, variables, context_headers=ctx.auth.context_headers()
    )
    _, nodes = _edges(data)
    node = next((n for n in nodes if n.get("orderNo") == params.order_number), None)
    if node is None:
        return GetOrderDetailResult(order=None)
    size = ctx.settings.uacapi_image_size
    return GetOrderDetailResult(order=OrderDetail(**_order_fields(node, size), shipments=_shipments(node)))


_NO_ITEM_IMAGES = {"items": {"__all__": {"image_url"}}}

GET_ORDERS = ToolSpec(
    name="get_orders",
    title="Get UACAPI orders",
    description=(
        "Read-only order history lookup against UACAPI. Returns the shopper's most recent orders "
        "(default 3) with order number, date, status, totals, and line items. Use this for "
        'requests like "my last 3 orders" or "order history". The shopper identity and site are '
        'injected by the server; only "limit" is model-controlled.'
    ),
    input_model=GetOrdersInput,
    handler=get_orders,
    llm_view=lambda r: r.model_dump(mode="json", exclude={"orders": {"__all__": _NO_ITEM_IMAGES}}),
)

GET_ORDER_DETAIL = ToolSpec(
    name="get_order_detail_by_order_number",
    title="Get UACAPI order detail by order number",
    description=(
        "Read-only order tracking lookup against UACAPI. Given an order number (or RMA number), "
        "returns that single order with status, totals, line items, and per-shipment TRACKING "
        'NUMBERS and TRACKING LINKS. Use this for requests like "track my order", "where is '
        'order <number>", or "tracking for <order number>". The site/locale and auth are '
        'injected by the server; only "orderNumber" is model-controlled.'
    ),
    input_model=GetOrderDetailInput,
    handler=get_order_detail,
    llm_view=lambda r: r.model_dump(mode="json", exclude={"order": _NO_ITEM_IMAGES}),
)
