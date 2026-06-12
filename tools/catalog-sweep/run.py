#!/usr/bin/env python3
"""run.py — orchestrate the glass-art color catalog sweep.

Examples (from tools/catalog-sweep/):
    python run.py --list
    python run.py --supplier glass-alchemy --no-swatch
    python run.py --all
    python run.py --all --dry-run            # show diffs, write nothing
    python run.py --all --force-fetch        # bypass the raw cache

The network stage is cached under raw/ (gitignored); re-running without --force-fetch is free
and offline. Only src/data/catalog/*.json is written into the repo.
"""

from __future__ import annotations

import argparse
import sys

from catalog_sweep import emit, normalize, shopify
from catalog_sweep.config import load_overrides, load_suppliers, load_vocab
from catalog_sweep.fetch import Fetcher, RobotsDisallowed
from catalog_sweep.politeness import Politeness
from catalog_sweep.swatch import enrich_swatches


def log(msg: str) -> None:
    print(msg, flush=True)


def collect_products(fetcher: Fetcher, cfg, *, force: bool) -> list[dict]:
    """Pull every product across the supplier's configured collections (deduped by product id)."""
    seen: set = set()
    out: list[dict] = []
    for handle in cfg.collections:
        try:
            for p in shopify.iter_collection_products(fetcher, cfg.base, handle, cfg.id, force=force):
                pid = p.get("id")
                if pid in seen:
                    continue
                seen.add(pid)
                out.append(p)
        except RobotsDisallowed as e:
            log(f"  ! robots.txt blocked collection '{handle}': {e}")
    return out


def sweep_supplier(cfg, vocab, overrides, fetcher, *, do_swatch: bool, mode: str, dry_run: bool) -> dict:
    log(f"\n== {cfg.id} ({cfg.brand}, COE {cfg.coe}) ==")
    products = collect_products(fetcher, cfg, force=fetcher.force_fetch)
    log(f"  fetched {len(products)} raw products from {len(cfg.collections)} collection(s)")

    entries = normalize.build_entries(cfg, products, vocab, overrides)
    log(f"  normalized -> {len(entries)} distinct colors")

    if do_swatch:
        stats = enrich_swatches(entries, cfg.id, fetcher)
        log(f"  swatches: {stats['sampled']} sampled, {stats['none']} none")

    summary = emit.emit_supplier(cfg.id, cfg.brand, cfg.coe, entries, mode=mode, dry_run=dry_run)
    d = summary["diff"]
    log(f"  emit{' (dry-run)' if dry_run else ''}: {summary['productCount']} colors "
        f"(+{len(d['added'])} -{len(d['removed'])} ~{len(d['changed'])}); "
        f"colorant known for {summary['colorantKnown']}")
    return summary


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Sweep glass-art supplier color catalogs.")
    ap.add_argument("--supplier", action="append", default=[], help="supplier id (repeatable)")
    ap.add_argument("--all", action="store_true", help="sweep every configured supplier")
    ap.add_argument("--list", action="store_true", help="list configured suppliers and exit")
    ap.add_argument("--no-swatch", action="store_true", help="skip image swatch sampling")
    ap.add_argument("--force-fetch", action="store_true", help="bypass the raw cache")
    ap.add_argument("--dry-run", action="store_true", help="compute + diff, but write no files")
    ap.add_argument("--mode", choices=["replace", "merge"], default="replace")
    ap.add_argument("--max-age-days", type=float, default=30.0)
    args = ap.parse_args(argv)

    suppliers = load_suppliers()
    if args.list:
        for sid, cfg in suppliers.items():
            log(f"  {sid:14s} {cfg.brand} (COE {cfg.coe}) — {len(cfg.collections)} collection(s)")
        return 0

    ids = list(suppliers) if args.all else args.supplier
    if not ids:
        ap.error("specify --all or one or more --supplier <id> (or --list)")
    unknown = [i for i in ids if i not in suppliers]
    if unknown:
        ap.error(f"unknown supplier id(s): {unknown}. Known: {list(suppliers)}")

    vocab = load_vocab()
    overrides = load_overrides()
    politeness = Politeness()
    fetcher = Fetcher(politeness, max_age_days=args.max_age_days)
    fetcher.force_fetch = args.force_fetch  # read by collect_products

    summaries = []
    try:
        for sid in ids:
            summaries.append(sweep_supplier(
                suppliers[sid], vocab, overrides, fetcher,
                do_swatch=not args.no_swatch, mode=args.mode, dry_run=args.dry_run,
            ))
    finally:
        fetcher.close()

    # Rewrite the index over whatever supplier files now exist (so partial sweeps stay consistent).
    existing_summaries = _merge_with_existing(summaries, suppliers)
    index = emit.write_index(existing_summaries, vocab, dry_run=args.dry_run)
    log(f"\nindex{' (dry-run)' if args.dry_run else ''}: {index['totals']['products']} colors across "
        f"{len(index['suppliers'])} suppliers; "
        f"{index['totals']['withColorant']} with colorant, {index['totals']['withSwatch']} with swatch")
    log(f"net fetches: {fetcher.net_hits}, cache hits: {fetcher.cache_hits}")
    return 0


def _merge_with_existing(summaries: list[dict], suppliers) -> list[dict]:
    """Index should reflect all supplier files present, not just the ones swept this run."""
    import json
    from catalog_sweep.config import CATALOG_DIR

    by_id = {s["id"]: s for s in summaries}
    for sid, cfg in suppliers.items():
        if sid in by_id:
            continue
        path = CATALOG_DIR / f"{sid}.json"
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            prods = data.get("products", [])
            from collections import Counter
            by_id[sid] = {
                "id": sid, "file": f"{sid}.json", "brand": data.get("supplier", cfg.brand),
                "coe": data.get("coe", cfg.coe), "productCount": len(prods),
                "swatchSourceCounts": dict(Counter(p.get("swatchSource", "none") for p in prods)),
                "colorantKnown": sum(1 for p in prods if p.get("colorant")),
            }
        except Exception:
            pass
    return list(by_id.values())


if __name__ == "__main__":
    sys.exit(main())
