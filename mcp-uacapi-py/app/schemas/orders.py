"""Order history and order tracking models."""

from __future__ import annotations

from pydantic import ConfigDict, Field

from app.schemas.base import CamelModel

MAX_ORDERS_LIMIT = 50


class GetOrdersInput(CamelModel):
    limit: int | None = Field(
        None,
        ge=1,
        le=MAX_ORDERS_LIMIT,
        description=f"Number of most recent orders to return (1-{MAX_ORDERS_LIMIT}, default 3).",
    )


class GetOrderDetailInput(CamelModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    order_number: str = Field(
        min_length=1,
        description='The order number (or RMA number) to look up, e.g. "US-DEVNA04-00392564".',
    )


class OrderTotals(CamelModel):
    subtotal: float | None = None
    shipping: float | None = None
    tax: float | None = None
    grand_total: float | None = None
    discount: float | None = None


class OrderItem(CamelModel):
    name: str | None = None
    sku: str | None = None
    quantity: int | None = None
    price: float | None = None
    fulfillment_status: str | None = None
    image_url: str | None = None


class Order(CamelModel):
    order_no: str | None = None
    creation_date: str | None = None
    status: str | None = None
    order_type: str | None = None
    currency: str | None = None
    totals: OrderTotals | None = None
    items: list[OrderItem] = Field(default_factory=list)


class OrderAddress(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    address1: str | None = None
    city: str | None = None
    state_code: str | None = None
    postal_code: str | None = None
    country_code: str | None = None


class OrderShipment(CamelModel):
    tracking_number: str | None = None
    tracking_link: str | None = None
    status: str | None = None
    estimated_delivery: str | None = None
    date_shipped: str | None = None
    date_delivered: str | None = None


class OrderDetail(Order):
    shipping_address: OrderAddress | None = None
    billing_address: OrderAddress | None = None
    shipments: list[OrderShipment] = Field(default_factory=list)


class GetOrdersResult(CamelModel):
    total_count: int
    count: int
    orders: list[Order]


class GetOrderDetailResult(CamelModel):
    order: OrderDetail | None = None


class OrdersRequest(GetOrdersInput):
    """`POST /orders` body. Headers (`x-ua-customer-no`, `x-ua-locale`) take precedence."""

    customer_no: str | None = None
    site_id: str | None = None


class OrderDetailRequest(GetOrderDetailInput):
    """`POST /order-detail` body. Site comes from headers; `siteId` is a fallback."""

    site_id: str | None = None
