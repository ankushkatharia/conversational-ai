"""Product search models: model-facing input and the stable output contract."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field, model_validator

from app.schemas.base import CamelModel

MAX_SEARCH_LIMIT = 100


class SearchProductsInput(CamelModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    query: str | None = Field(
        None, min_length=1, description='Free-text search phrase, e.g. "running shoes".'
    )
    category_id: str | None = Field(None, min_length=1, description='UACAPI category id, e.g. "mens-shoes".')
    limit: int | None = Field(
        None,
        ge=1,
        le=MAX_SEARCH_LIMIT,
        description=f"Max products to return (1-{MAX_SEARCH_LIMIT}, default 20).",
    )
    sort: str | None = Field(
        None,
        min_length=1,
        description=(
            "Sort option id. Omit for relevance (relevance can rank loosely-matching items "
            'first). Common ids: "now-trending", "top-sellers", "top-rated", "newest", '
            '"price-low-high", "price-high-low".'
        ),
    )
    min_price: float | None = Field(
        None, ge=0, description='Minimum sale price (inclusive), e.g. 25 for "over $25".'
    )
    max_price: float | None = Field(
        None, ge=0, description='Maximum sale price (exclusive), e.g. 100 for "under $100".'
    )
    color: str | None = Field(
        None,
        min_length=1,
        description=(
            "Color group filter. One of: Black, Blue, Brown, Gold, Gray, Green, Maroon, Navy, "
            "Orange, Pink, Purple, Red, Silver, White, Yellow, Camo, Assorted."
        ),
    )
    gender: str | None = Field(
        None, min_length=1, description="Gender filter. One of: Mens, Womens, Boys, Girls, Unisex."
    )
    reset: bool | None = Field(
        None,
        description=(
            "Set true only when the user starts a brand-new search for a different product "
            "type; clears previously applied filters. Leave unset when refining."
        ),
    )

    @model_validator(mode="after")
    def _require_query_or_category(self) -> SearchProductsInput:
        if not self.query and not self.category_id:
            raise ValueError('At least one of "query" or "categoryId" must be provided.')
        return self


class PriceBand(CamelModel):
    min: float | None = None
    max: float | None = None


class ProductPrice(CamelModel):
    list_: PriceBand | None = Field(None, alias="list")
    sale: PriceBand | None = None


class ProductColor(CamelModel):
    code: str | None = None
    name: str | None = None
    hex: str | None = None
    orderable: bool | None = None
    image_url: str | None = None


class Product(CamelModel):
    id: str | None = None
    style: str | None = None
    name: str | None = None
    url: str | None = None
    orderable: bool | None = None
    currency: str | None = None
    price: ProductPrice | None = None
    image_url: str | None = None
    colors: list[ProductColor] = Field(default_factory=list)


class RefinementValue(CamelModel):
    label: str
    count: int
    selected: bool
    delta: dict[str, Any] = Field(description="Search arguments to merge when this chip is tapped.")


class RefinementGroup(CamelModel):
    attribute_id: str
    label: str
    field: Literal["color", "gender", "price"]
    values: list[RefinementValue]


class SortSuggestion(CamelModel):
    id: str
    label: str
    selected: bool
    delta: dict[str, Any]


class SearchSuggestions(CamelModel):
    refinements: list[RefinementGroup] = Field(default_factory=list)
    sorts: list[SortSuggestion] = Field(default_factory=list)


class PageInfo(CamelModel):
    has_next_page: bool = False
    has_previous_page: bool = False
    start_cursor: str | None = None
    end_cursor: str | None = None


class SearchProductsResult(CamelModel):
    total_count: int
    count: int
    page_info: PageInfo
    products: list[Product]
    suggestions: SearchSuggestions
