"""Scene7 image URL helpers shared by product and order tools."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_VIEW_PREFERENCE = ("default", "gridTileDesktop", "grid")
# Directives that force a fixed square crop; dropping them lets fit=constrain keep the full image.
_SIZING_PARAMS = {"rp", "scl", "size", "wid", "hei", "fit", "bgc"}


def normalize_image_url(url: str | None, size: int) -> str | None:
    """Rewrites a Scene7 URL so the whole product fits a `size` x `size` white box."""
    if not url:
        return None
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        return url
    params = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in _SIZING_PARAMS]
    params += [("wid", str(size)), ("hei", str(size)), ("fit", "constrain"), ("bgc", "FFFFFF")]
    return urlunsplit(parts._replace(query=urlencode(params)))


def pick_image_url(images: Sequence[dict[str, Any]] | None, size: int) -> str | None:
    """Picks the best display image, preferring the full-product "default" view."""
    if not images:
        return None
    for view_type in _VIEW_PREFERENCE:
        for image in images:
            if image.get("viewType") == view_type and image.get("url"):
                return normalize_image_url(image["url"], size)
    first = next((image["url"] for image in images if image.get("url")), None)
    return normalize_image_url(first, size)
