"""`search_products`: read-only catalog search against UACAPI."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.clients.queries import SEARCH_PRODUCTS_QUERY
from app.schemas.products import (
    PageInfo,
    PriceBand,
    Product,
    ProductColor,
    ProductPrice,
    RefinementGroup,
    RefinementValue,
    SearchProductsInput,
    SearchProductsResult,
    SearchSuggestions,
    SortSuggestion,
)
from app.tools.base import ToolContext, ToolSpec
from app.tools.images import pick_image_url

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 20
PRICE_RANGE_MAX = 9999
MAX_CHIPS_PER_GROUP = 6
COLOR_ATTRIBUTE = "c_colorgroup"
GENDER_ATTRIBUTE = "c_gender"
PRICE_ATTRIBUTE = "price"
ORDERABLE_ONLY_ATTRIBUTE = "orderable_only"
FIELD_BY_ATTRIBUTE = {COLOR_ATTRIBUTE: "color", GENDER_ATTRIBUTE: "gender", PRICE_ATTRIBUTE: "price"}
COLOR_GROUPS = (
    "Black", "Blue", "Brown", "Gold", "Gray", "Green", "Maroon", "Navy", "Orange",
    "Pink", "Purple", "Red", "Silver", "White", "Yellow", "Camo", "Assorted",
)  # fmt: skip
GENDERS = ("Mens", "Womens", "Boys", "Girls", "Unisex")


def _canonical(value: str, allowed: tuple[str, ...]) -> str:
    """Maps a value to its canonical casing; unknown values pass through for UACAPI to try."""
    return next((a for a in allowed if a.lower() == value.lower()), value)


def _number(value: float) -> int | float:
    return int(value) if float(value).is_integer() else value


def build_variables(params: SearchProductsInput) -> dict[str, Any]:
    """Mirrors the UA web frontend defaults: product-level hits and orderable products only."""
    custom = [{"attributeId": ORDERABLE_ONLY_ATTRIBUTE, "values": ["true"]}]
    if params.color:
        custom.append({"attributeId": COLOR_ATTRIBUTE, "values": [_canonical(params.color, COLOR_GROUPS)]})
    if params.gender:
        custom.append({"attributeId": GENDER_ATTRIBUTE, "values": [_canonical(params.gender, GENDERS)]})

    refinement: dict[str, Any] = {"hitType": ["MASTER", "SLICING"]}
    if params.category_id:
        refinement["category"] = params.category_id
    if params.min_price is not None or params.max_price is not None:
        refinement["price"] = {
            "from": _number(params.min_price if params.min_price is not None else 0),
            "to": _number(params.max_price if params.max_price is not None else PRICE_RANGE_MAX),
        }
    refinement["customRefinements"] = custom
    return {
        "q": params.query,
        "first": params.limit or DEFAULT_LIMIT,
        "refinement": refinement,
        "sort": params.sort,
    }


def parse_price_label(label: str) -> dict[str, int | float] | None:
    """Turns a facet label ("Under $25", "$25 - $50", "$200 +") into a price delta."""
    nums = [_number(float(n)) for n in re.findall(r"\d+(?:\.\d+)?", label)]
    if not nums:
        return None
    if len(nums) >= 2:
        return {"minPrice": nums[0], "maxPrice": nums[1]}
    lower = label.lower()
    if re.search(r"under|below|less|up to|<", lower):
        return {"maxPrice": nums[0]}
    if re.search(r"\+|over|above|more|and up|>", lower):
        return {"minPrice": nums[0]}
    return {"maxPrice": nums[0]}


def _band(raw: dict[str, Any] | None) -> PriceBand | None:
    return PriceBand(min=raw.get("min"), max=raw.get("max")) if raw else None


def _map_product(node: dict[str, Any], image_size: int) -> Product:
    colors = [
        ProductColor(
            code=c.get("color"),
            name=c.get("name"),
            hex=c.get("hex"),
            orderable=c.get("orderable"),
            image_url=pick_image_url((c.get("assets") or {}).get("images"), image_size),
        )
        for c in node.get("colors") or []
    ]
    prices = node.get("prices")
    return Product(
        id=node.get("id"),
        style=node.get("style") or node.get("slicedProductId"),
        name=node.get("productName"),
        url=node.get("url"),
        orderable=node.get("orderable"),
        currency=node.get("currency"),
        price=ProductPrice(list_=_band(prices.get("list")), sale=_band(prices.get("sale")))
        if prices
        else None,
        image_url=next((c.image_url for c in colors if c.image_url), None),
        colors=colors,
    )


def _delta(field: str, label: str) -> dict[str, Any] | None:
    if field == "price":
        return parse_price_label(label)
    return {field: label}


def _build_suggestions(connection: dict[str, Any]) -> SearchSuggestions:
    refinements: list[RefinementGroup] = []
    for attr in connection.get("refinementAttributes") or []:
        field = FIELD_BY_ATTRIBUTE.get(attr.get("attributeId"))
        if not field:
            continue
        values = []
        for value in attr.get("values") or []:
            label = value.get("label") or ""
            if delta := _delta(field, label):
                values.append(
                    RefinementValue(
                        label=label,
                        count=value.get("hitCount") or 0,
                        selected=bool(value.get("selected")),
                        delta=delta,
                    )
                )
        if values:
            values.sort(key=lambda v: v.count, reverse=True)
            refinements.append(
                RefinementGroup(
                    attribute_id=attr["attributeId"],
                    label=attr.get("label") or "",
                    field=field,
                    values=values[:MAX_CHIPS_PER_GROUP],
                )
            )
    sorts = [
        SortSuggestion(
            id=s["id"], label=s.get("label") or "", selected=bool(s.get("selected")), delta={"sort": s["id"]}
        )
        for s in connection.get("sortingOptions") or []
        if s.get("id")
    ]
    return SearchSuggestions(refinements=refinements, sorts=sorts)


async def search_products(params: SearchProductsInput, ctx: ToolContext) -> SearchProductsResult:
    variables = build_variables(params)
    logger.info("search_products variables=%s", json.dumps(variables))
    data = await ctx.uacapi.request(
        SEARCH_PRODUCTS_QUERY,
        variables,
        bearer_token=ctx.auth.bearer_token,
        context_headers=ctx.auth.context_headers(),
    )
    connection = data.get("search") or {}
    page = connection.get("pageInfo") or {}
    size = ctx.settings.uacapi_image_size
    return SearchProductsResult(
        total_count=connection.get("totalCount") or 0,
        count=connection.get("count") or 0,
        page_info=PageInfo(
            has_next_page=bool(page.get("hasNextPage")),
            has_previous_page=bool(page.get("hasPreviousPage")),
            start_cursor=page.get("startCursor"),
            end_cursor=page.get("endCursor"),
        ),
        products=[
            _map_product(edge["node"], size)
            for edge in connection.get("edges") or []
            if edge and edge.get("node")
        ],
        suggestions=_build_suggestions(connection),
    )


def _llm_view(result: SearchProductsResult) -> dict[str, Any]:
    def price(p: Product) -> dict[str, Any] | None:
        band = p.price and (p.price.sale or p.price.list_)
        return band.model_dump(mode="json") if band else None

    return {
        "totalCount": result.total_count,
        "count": result.count,
        "products": [
            {
                "name": p.name,
                "style": p.style,
                "price": price(p),
                "colors": [c.name for c in p.colors if c.name][:8],
            }
            for p in result.products
        ],
        "refinements": {g.label: [v.label for v in g.values] for g in result.suggestions.refinements},
    }


SPEC = ToolSpec(
    name="search_products",
    title="Search UACAPI products",
    description=(
        'Read-only product search against UACAPI. Provide a free-text "query", a "categoryId", '
        'or both (at least one is required). Optional structured filters: "minPrice"/"maxPrice" '
        '(sale price range), "color" (color group e.g. Black), "gender" '
        '(Mens/Womens/Boys/Girls/Unisex), plus "sort" and "limit". Returns a stable, mapped list '
        "of products with pricing, color variations, and image URLs."
    ),
    input_model=SearchProductsInput,
    handler=search_products,
    llm_view=_llm_view,
)
