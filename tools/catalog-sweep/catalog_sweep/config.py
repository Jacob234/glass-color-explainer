"""config.py — repo paths, supplier config (suppliers.toml), and the canonical science vocab.

The vocabulary (valid colorant ids + mechanisms) is read straight from the live
``src/data/optics.json`` / ``src/data/map.json`` so there is a single source of truth and no
snapshot can drift. We also assert that classify.py's embedded group map matches the live file.
"""

from __future__ import annotations

import json
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from . import classify

# tools/catalog-sweep/catalog_sweep/config.py -> repo root is parents[3]
REPO_ROOT = Path(__file__).resolve().parents[3]
SWEEP_ROOT = Path(__file__).resolve().parents[1]
OPTICS_PATH = REPO_ROOT / "src" / "data" / "optics.json"
MAP_PATH = REPO_ROOT / "src" / "data" / "map.json"
CATALOG_DIR = REPO_ROOT / "src" / "data" / "catalog"
RAW_DIR = SWEEP_ROOT / "raw"
NORMALIZED_DIR = SWEEP_ROOT / "normalized"
SUPPLIERS_TOML = SWEEP_ROOT / "config" / "suppliers.toml"
OVERRIDES_JSON = SWEEP_ROOT / "config" / "overrides.json"

USER_AGENT = (
    "glass-color-explainer-catalog/0.1 "
    "(+https://github.com/Jacob234/glass-color-explainer; jacobbenkell@gmail.com)"
)


def load_vocab() -> dict:
    """Return {'colorant_groups': {id: group}, 'mechanisms': [...], 'colorants': [...]}.

    Source of truth = the live optics.json + map.json. Also verifies classify.OPTICS_GROUPS
    matches, so the embedded map used for fast unit tests can never silently drift.
    """
    optics = json.loads(OPTICS_PATH.read_text(encoding="utf-8"))
    mapd = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    groups = {c["id"]: c["group"] for c in optics["colorants"]}
    mechanisms = [m["id"] for m in mapd["mechanisms"]]
    if groups != classify.OPTICS_GROUPS:
        missing = set(groups) ^ set(classify.OPTICS_GROUPS)
        raise SystemExit(
            "classify.OPTICS_GROUPS is out of sync with src/data/optics.json "
            f"(symmetric diff of ids: {sorted(missing) or 'group values differ'}). "
            "Update classify.OPTICS_GROUPS."
        )
    return {
        "colorant_groups": groups,
        "mechanisms": mechanisms,
        "colorants": list(groups.keys()),
    }


@dataclass(frozen=True)
class SupplierConfig:
    id: str
    brand: str
    base: str
    method: str = "shopify-collections"
    coe: int | None = None
    collections: tuple[str, ...] = ()
    vendor_filter: tuple[str, ...] = ()   # keep only products whose vendor matches one of these
    title_filter: tuple[str, ...] = ()    # keep only products whose title matches one of these
    exclude: tuple[str, ...] = ()         # drop products whose title/tags match any of these
    code_strategy: str = "sku"            # 'sku' | 'sku-prefix6' | 'handle'
    name_strategy: str = "as-is"          # 'as-is' | 'before-comma' | 'strip-suffix'
    title_strip: tuple[str, ...] = ()     # regexes removed from the display name (strip-suffix)
    source_retailer: str | None = None
    default_form: tuple[str, ...] = ()
    default_opacity: str = "unknown"
    colorant_hints: dict = field(default_factory=dict)
    crawl_delay_s: float = 3.0
    firecrawl_budget: int = 0


def load_suppliers(path: Path | None = None) -> dict[str, SupplierConfig]:
    raw = tomllib.loads((path or SUPPLIERS_TOML).read_text(encoding="utf-8"))
    out: dict[str, SupplierConfig] = {}
    for sid, body in raw.items():
        out[sid] = SupplierConfig(
            id=sid,
            brand=body["brand"],
            base=body["base"].rstrip("/"),
            method=body.get("method", "shopify-collections"),
            coe=body.get("coe"),
            collections=tuple(body.get("collections", [])),
            vendor_filter=tuple(body.get("vendor_filter", [])),
            title_filter=tuple(body.get("title_filter", [])),
            exclude=tuple(body.get("exclude", [])),
            code_strategy=body.get("code_strategy", "sku"),
            name_strategy=body.get("name_strategy", "as-is"),
            title_strip=tuple(body.get("title_strip", [])),
            source_retailer=body.get("source_retailer"),
            default_form=tuple(body.get("default_form", [])),
            default_opacity=body.get("default_opacity", "unknown"),
            colorant_hints=dict(body.get("colorant_hints", {})),
            crawl_delay_s=float(body.get("crawl_delay_s", 3.0)),
            firecrawl_budget=int(body.get("firecrawl_budget", 0)),
        )
    return out


def load_overrides(path: Path | None = None) -> dict:
    p = path or OVERRIDES_JSON
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8") or "{}")
