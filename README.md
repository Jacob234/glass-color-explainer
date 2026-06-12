# Why Glass Has Color

An explorable explainer for the four physical mechanisms that color glass —
dissolved ions, metal colloids, semiconductor band-gap crystals, and structure —
anchored by the real objects they explain (Chartres blue, gold-ruby cranberry
glass, the traffic light, the Lycurgus Cup).

**Live site:** https://jacob234.github.io/glass-color-explainer/

## Development

```sh
npm install
npm run dev      # http://localhost:4321/glass-color-explainer/
```

## Quality gates

```sh
npm run build    # static build; unresolved slugs/anchors fail it
npm run check    # data validators (map/optics/islands + catalog referential integrity)
npm test         # fixture tests for both validators
```

## Architecture

- Astro 5, fully static, zero hydration — each interactive island is one plain script
- Concept pages: Astro content collection (`src/content/concepts/`)
- Map data: `src/data/map.json`; island routing: `src/data/islands.json`;
  island science data: `src/data/optics.json` (illustrative absorption curves —
  visually faithful, not measured spectra)

## Color catalog (reference dataset)

`src/data/catalog/` is a standalone, versioned sweep of real glass-art supplier colors
(Bullseye, Effetre, Glass Alchemy…), each linking back to the `optics.json` colorant that
explains it. It is **decoupled from the live site** — a reference dataset for future features,
not yet wired into the explainer. The sweeper lives in
[`tools/catalog-sweep/`](tools/catalog-sweep/) (Python, kept out of `package.json`); colorant
mappings and swatch hexes are honest approximations (inferred from names, sampled from photos),
validated by `scripts/check_catalog.mjs`.

## Provenance

Curated rewrites of notes from a personal knowledge vault (glass-materials
cluster, Phase 11). Drift from the originals is accepted by design.
