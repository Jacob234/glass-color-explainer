"""shopify.py — read products from a Shopify store's public products.json feed.

Shopify exposes ``/collections/<handle>/products.json?limit=250&page=N`` with no auth. This is
rung-1 of the ladder (cheapest, richest): we get title, handle, vendor, tags, product_type,
variants (with sku), and images as structured JSON — no HTML scraping needed.
"""

from __future__ import annotations

from collections.abc import Iterator

from .fetch import Fetcher

_PAGE_LIMIT = 250
_MAX_PAGES = 50  # safety backstop (50 * 250 = 12,500 products per collection)


def iter_collection_products(
    fetcher: Fetcher, base: str, handle: str, supplier: str, *, force: bool = False
) -> Iterator[dict]:
    """Yield raw Shopify product dicts from one collection, following pagination to the end."""
    for page in range(1, _MAX_PAGES + 1):
        url = f"{base}/collections/{handle}/products.json?limit={_PAGE_LIMIT}&page={page}"
        data = fetcher.fetch_json(url, supplier, force=force)
        products = data.get("products", [])
        if not products:
            return
        for p in products:
            yield p
        if len(products) < _PAGE_LIMIT:
            return


def product_url(base: str, product: dict) -> str:
    return f"{base}/products/{product.get('handle', '')}"


def first_image_url(product: dict) -> str | None:
    imgs = product.get("images") or []
    return imgs[0].get("src") if imgs else None


def first_sku(product: dict) -> str:
    for v in product.get("variants") or []:
        sku = (v.get("sku") or "").strip()
        if sku:
            return sku
    return ""
