# catalog-sweep

A polite, free-first sweep of **glass-art supplier color catalogs** into a standalone, versioned
dataset under [`src/data/catalog/`](../../src/data/catalog/). Each entry is a *color* that links
back to the explainer's science by the colorant ids in `src/data/optics.json`.

This toolchain is **decoupled from the Astro site**: it is Python, it never enters
`package.json`, and the site never imports it. Only the curated JSON it emits is committed.

## Quick start

```bash
cd tools/catalog-sweep
python3 run.py --list                       # show configured suppliers
python3 run.py --supplier glass-alchemy     # sweep one supplier (fetch + classify + swatch + emit)
python3 run.py --all                        # sweep every configured supplier
python3 run.py --all --no-swatch            # skip image sampling (fast)
python3 run.py --all --dry-run              # compute + show diffs, write nothing
python3 run.py --all --force-fetch          # bypass the raw cache (re-hit the sites)
python3 -m unittest discover -s tests       # classifier unit tests
```

Dependencies are `httpx` + `Pillow` (both already present in most Python 3.11 envs; `tomllib`
is stdlib). Install if needed: `pip install -e .`

Validate the emitted catalog from the repo root with the same gate the science data uses:

```bash
npm run check          # runs check_data.mjs AND check_catalog.mjs
npm run check:catalog  # catalog only
```

## How it works

**Free-first ladder, per supplier** (stop at the first rung that yields clean structured rows):

0. **robots.txt** — honoured for our descriptive UA, with `Crawl-delay` respected.
1. **Structured feed** — Shopify `/collections/<handle>/products.json` (all phase-1 suppliers).
2. **crawl4ai** schema extraction — *not yet needed*; added later for non-Shopify manufacturers.
3. **crawl4ai + JS** — lazy/paginated grids.
4. **firecrawl** (paid) — fallback only, per-supplier budget `0` unless explicitly authorized.

**Network is separated from transforms by the `raw/` cache** (gitignored): every fetched body
and image is cached, so re-running classification/swatch/emit is free and offline. Re-fetch with
`--force-fetch` or `--max-age-days`.

**A catalog entry is a color, not a SKU.** Bullseye's "Cobalt Blue" ships as billet + sheet +
frit + powder (multiple SKUs) but is one color, collapsed by its identity key `supplier:code`
(6-digit code for Bullseye, catalog number for rods), with `form` unioned into an array.

**Per-supplier config lives in [`config/suppliers.toml`](config/suppliers.toml)** — which
collections hold the colors, how to derive the code, how to clean the name, COE, and defaults.
Most suppliers are pure config; a hand-written `adapters/<id>.py` is only needed for irregular
non-Shopify sources (Wissmach PDF charts, etc.).

## Honesty (this project's ethos, carried into the data)

- **Colorant is inferred, never scraped.** Suppliers don't publish chemistry, so the link to
  `optics.json` comes from a deterministic, first-match-wins name ruleset
  ([`classify.py`](catalog_sweep/classify.py)). If nothing matches, `colorant: []` /
  `colorantConfidence: "unknown"` — **we never guess**. Striking / silver-glass / reactive
  formulations are forced to unknown even when an incidental colour word appears. `mechanism`
  is *derived* from `colorant` and validated, so it can never drift from the science.
- **swatchHex is a coarse approximation.** Glass suppliers publish photos, not hex codes, so
  the swatch is the dominant non-background colour sampled from a thumbnail. A transparent rod
  on a white lightbox can sample the background, so a near-white/black-only image yields `null`
  rather than a lie, and `swatchSource` records provenance. `swatchCaveat` flags the
  context-dependent cases (transparent / unknown opacity).
- **Manual corrections** go in [`config/overrides.json`](config/overrides.json), keyed by
  `supplier:code`. They are applied last and survive re-sweeps — fix a low-confidence inference
  without re-scraping.

## Supplier roster

| Group | COE | Suppliers | Phase |
|---|---|---|---|
| Fusing sheet & frit | 90 / 96 | **Bullseye**, Oceanside/System 96, Wissmach, Youghiogheny, Uroboros | Bullseye ✅ |
| Lampwork soft-glass rod | 104 | **Effetre** (via Frantz), Reichenbach, CiM, Vetrofond, Kugler | Effetre ✅ |
| Borosilicate rod | 33 | **Glass Alchemy**, Northstar, TAG, Momka | Glass Alchemy ✅ |
| Specialty | — | Double Helix (silver-glass), Reusche / Thompson (enamels) | later |

**Phase 1** (shipped): Bullseye, Glass Alchemy, Effetre — proves the pipeline, schema, and
validator end-to-end. **Expansion** is one `suppliers.toml` entry at a time; non-Shopify
manufacturers add a small adapter and (only if blocked) the crawl4ai/firecrawl rungs.

## Layout

```
config/suppliers.toml     per-supplier adapter config
config/overrides.json     manual colorant/swatch corrections (survive re-sweeps)
catalog_sweep/            classify · fetch · politeness · shopify · swatch · normalize · emit · config
run.py                    orchestrator CLI
raw/                      gitignored HTTP + image cache (the network/transform boundary)
tests/                    classifier unit tests
→ src/data/catalog/*.json the committed output (+ index.json manifest)
→ scripts/check_catalog.mjs the validator (npm run check)
```
