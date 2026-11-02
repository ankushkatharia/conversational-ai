"""Deterministic search-filter accumulation across conversation turns."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

FILTER_KEYS = ("query", "categoryId", "minPrice", "maxPrice", "color", "gender", "sort", "limit")


def merge_filters(base: Mapping[str, Any], delta: Mapping[str, Any]) -> dict[str, Any]:
    """Overlays the non-empty filter keys from `delta` on `base`; everything else persists."""
    merged = dict(base)
    for key in FILTER_KEYS:
        value = delta.get(key)
        if value is None or (isinstance(value, str) and not value.strip()):
            continue
        merged[key] = value
    return merged
