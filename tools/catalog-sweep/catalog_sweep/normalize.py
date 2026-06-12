"""normalize.py — turn raw Shopify products into grouped catalog entries.

A catalog entry is a COLOR, not a SKU. Bullseye's "Opaline" ships as billet + sheet + frit +
powder (4 SKUs) but is one color, identified by its 6-digit code. This module groups raw
products by a supplier-derived identity (``supplier:code``), unions their forms, and infers the
colorant / mechanism / family / opacity once per color. Manual overrides are applied last.
"""

from __future__ import annotations

import re
from collections import OrderedDict

from . import classify, shopify
from .config import SupplierConfig

# Stable order for the form array (matches how a glassworker would list them).
_FORM_ORDER = list(classify.FORMS)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


def _clean_name(title: str, cfg: SupplierConfig) -> str:
    name = (title or "").strip()
    if cfg.name_strategy == "before-comma":
        name = name.split(",")[0].strip()
    elif cfg.name_strategy == "strip-suffix":
        for pat in cfg.title_strip:
            name = re.sub(pat, "", name, flags=re.I).strip()
    return re.sub(r"\s+", " ", name).strip()


def _derive_code(product: dict, cfg: SupplierConfig) -> str | None:
    if cfg.code_strategy == "sku-prefix6":
        sku = shopify.first_sku(product)
        m = re.match(r"(\d{6})", sku)
        return m.group(1) if m else None
    if cfg.code_strategy == "handle":
        return product.get("handle") or None
    # default 'sku'
    sku = shopify.first_sku(product)
    return sku or (product.get("handle") or None)


def _keep(product: dict, cfg: SupplierConfig) -> bool:
    title = (product.get("title") or "").lower()
    vendor = (product.get("vendor") or "").lower()
    tags = " ".join(product.get("tags") or []).lower()
    if cfg.vendor_filter and not any(v.lower() in vendor for v in cfg.vendor_filter):
        return False
    if cfg.title_filter and not any(t.lower() in title for t in cfg.title_filter):
        return False
    if cfg.exclude and any(x.lower() in (title + " " + tags) for x in cfg.exclude):
        return False
    return True


def raw_records(cfg: SupplierConfig, products, vocab: dict) -> list[dict]:
    """One record per kept product (pre-grouping)."""
    groups = vocab["colorant_groups"]
    out = []
    for p in products:
        if not _keep(p, cfg):
            continue
        code = _derive_code(p, cfg)
        if not code:
            continue  # e.g. Bullseye non-color item with no 6-digit SKU
        name = _clean_name(p.get("title", ""), cfg)
        if not name:
            continue
        tags = p.get("tags") or []
        title = p.get("title", "")
        ptype = p.get("product_type", "")
        opacity = classify.classify_opacity(title, ptype, " ".join(tags),
                                             default=cfg.default_opacity)
        forms = classify.classify_form(title, ptype, " ".join(tags),
                                       defaults=cfg.default_form)
        out.append({
            "code": code,
            "name": name,
            "forms": forms,
            "opacity": opacity,
            "tags": tags,
            "url": shopify.product_url(cfg.base, p),
            "imageUrl": shopify.first_image_url(p),
        })
    return out


def _merge_group(code: str, recs: list[dict], cfg: SupplierConfig, vocab: dict) -> dict:
    groups = vocab["colorant_groups"]
    # Representative name = the shortest cleaned name (drops stray form/packaging words).
    name = min((r["name"] for r in recs), key=len)
    tags = sorted({t for r in recs for t in r["tags"]})

    # Union of forms in canonical order.
    form_set = {f for r in recs for f in r["forms"]}
    forms = [f for f in _FORM_ORDER if f in form_set] or list(cfg.default_form) or ["sheet"]

    # Opacity: prefer a confident (non-unknown) value, else unknown.
    opac = next((r["opacity"] for r in recs if r["opacity"] != "unknown"), "unknown")

    family = classify.classify_family(name, tags=tags)
    col = classify.classify_colorant(name, tags=tags, hints=cfg.colorant_hints)
    mechanism = classify.derive_mechanism(col.colorant, opacity=opac, family=family, groups=groups)

    # Representative product page + image (first record carrying each).
    url = recs[0]["url"]
    image = next((r["imageUrl"] for r in recs if r["imageUrl"]), None)

    return {
        "name": name,
        "code": code,
        "supplier": cfg.brand,
        "coe": cfg.coe,
        "form": forms,
        "opacity": opac,
        "family": family,
        "colorant": list(col.colorant),
        "mechanism": mechanism,
        "colorantConfidence": col.confidence,
        "colorantSource": col.source,
        "colorantNote": col.note,
        "swatchHex": None,
        "swatchSource": "none",
        # Opaque (opal) glass has the most stable colour; transparent/unknown is the
        # context-dependent case (thickness, backing) that warrants a caveat.
        "swatchCaveat": opac in ("transparent", "translucent", "streaky", "wispy",
                                 "dichroic", "metallic", "unknown"),
        "url": url,
        "imageUrl": image,
        "sourceRetailer": cfg.source_retailer,
    }


def build_entries(cfg: SupplierConfig, products, vocab: dict, overrides: dict | None = None) -> list[dict]:
    """Full normalize: filter -> group by code -> merge -> apply overrides."""
    recs = raw_records(cfg, products, vocab)
    grouped: "OrderedDict[str, list[dict]]" = OrderedDict()
    for r in recs:
        grouped.setdefault(r["code"], []).append(r)

    entries = [_merge_group(code, rs, cfg, vocab) for code, rs in grouped.items()]

    if overrides:
        for e in entries:
            key = f"{e['supplier']}:{e['code']}"
            ov = overrides.get(key)
            if not isinstance(ov, dict):
                continue
            for field in ("colorant", "colorantConfidence", "colorantNote", "swatchHex",
                          "swatchSource", "family", "opacity"):
                if field in ov:
                    e[field] = ov[field]
            if "colorant" in ov or "opacity" in ov or "family" in ov:
                e["mechanism"] = classify.derive_mechanism(
                    e["colorant"], opacity=e["opacity"], family=e["family"],
                    groups=vocab["colorant_groups"],
                )
            if any(f in ov for f in ("colorant", "swatchHex", "family", "opacity")):
                e["colorantSource"] = ov.get("colorantSource", "manual")
    return entries
