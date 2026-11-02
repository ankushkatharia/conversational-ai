"""Tool registry."""

from app.tools import orders, search_products, support_ticket, user_input
from app.tools.base import ToolContext, ToolRegistry, ToolSpec

__all__ = ["ToolContext", "ToolRegistry", "ToolSpec", "build_registry"]


def build_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            search_products.SPEC,
            orders.GET_ORDERS,
            orders.GET_ORDER_DETAIL,
            support_ticket.SPEC,
            user_input.SPEC,
        ]
    )
