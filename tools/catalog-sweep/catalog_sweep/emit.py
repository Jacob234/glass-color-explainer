"""emit.py — write the committed catalog: src/data/catalog/<id>.json + index.json.

Serialization is canonical and timestamp-free so an unchanged re-sweep produces byte-identical
files (empty git diff): entries are stable-sorted by (code, name), keys emitted in a fixed
order, 2-space indent, trailing newline. Provenance of *when* a page was fetched lives in the
gitignored raw-cache metadata, not in the committed data.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from .config import CATALOG_DIR

CATALOG_VERSION = "0.1.0"

# Fixed key order for every product entry (drives canonical, diff-stable output).
ENTRY_KEYS = [
    "name", "code", "supplier", "coe", "form", "opacity", "family",
    "colorant", "mechanism", "colorantConfidence", "colorantSource", "colorantNote",
    "swatchHex", "swatchSource", "swatchCaveat",
    "url", "imageUrl", "sourceRetailer",
]


def _canonical(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def _ordered(entry: dict) -> dict:
    return {k: entry.get(k) for k in ENTRY_KEYS}


def _sorted_entries(entries: list[dict]) -> list[dict]:
    return [_ordered(e) for e in sorted(entries, key=lambda e: (str(e.get("code")), e.get("name", "")))]


def _supplier_path(supplier_id: str) -> Path:
    return CATALOG_DIR / f"{supplier_id}.json"


def _load_existing(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("products", [])
    except Exception:
        return []


def diff_entries(old: list[dict], new: list[dict]) -> dict:
    old_by = {e["code"]: e for e in old}
    new_by = {e["code"]: e for e in new}
    added = [c for c in new_by if c not in old_by]
    removed = [c for c in old_by if c not in new_by]
    changed = [c for c in new_by if c in old_by and _ordered(old_by[c]) != _ordered(new_by[c])]
    return {"added": added, "removed": removed, "changed": changed}


def emit_supplier(
    supplier_id: str, brand: str, coe, entries: list[dict], *, mode: str = "replace", dry_run: bool = False
) -> dict:
    path = _supplier_path(supplier_id)
    existing = _load_existing(path)

    if mode == "merge":
        # Keep manually-curated existing entries whose code is absent from the new sweep.
        new_codes = {e["code"] for e in entries}
        kept = [e for e in existing if e["code"] not in new_codes and e.get("colorantSource") == "manual"]
        entries = entries + kept

    sorted_entries = _sorted_entries(entries)
    payload = {
        "supplier": brand,
        "coe": coe,
        "productCount": len(sorted_entries),
        "products": sorted_entries,
    }
    d = diff_entries(existing, sorted_entries)

    if not dry_run:
        CATALOG_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(_canonical(payload), encoding="utf-8")

    return {
        "id": supplier_id,
        "file": f"{supplier_id}.json",
        "brand": brand,
        "coe": coe,
        "productCount": len(sorted_entries),
        "swatchSourceCounts": dict(Counter(e["swatchSource"] for e in sorted_entries)),
        "colorantKnown": sum(1 for e in sorted_entries if e["colorant"]),
        "diff": d,
    }


def write_index(summaries: list[dict], vocab: dict, *, dry_run: bool = False) -> dict:
    suppliers = []
    total = 0
    with_colorant = 0
    with_swatch = 0
    for s in summaries:
        suppliers.append({
            "id": s["id"],
            "file": s["file"],
            "supplier": s["brand"],
            "coe": s["coe"],
            "productCount": s["productCount"],
            "swatchSourceCounts": s["swatchSourceCounts"],
            "colorantKnown": s["colorantKnown"],
        })
        total += s["productCount"]
        with_colorant += s["colorantKnown"]
        with_swatch += sum(v for k, v in s["swatchSourceCounts"].items() if k != "none")

    index = {
        "catalogVersion": CATALOG_VERSION,
        "vocabSnapshot": {
            "colorants": sorted(vocab["colorants"]),
            "mechanisms": list(vocab["mechanisms"]),
        },
        "suppliers": sorted(suppliers, key=lambda s: s["id"]),
        "totals": {
            "products": total,
            "withColorant": with_colorant,
            "withSwatch": with_swatch,
        },
    }
    if not dry_run:
        CATALOG_DIR.mkdir(parents=True, exist_ok=True)
        (CATALOG_DIR / "index.json").write_text(_canonical(index), encoding="utf-8")
    return index
