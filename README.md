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
npm run check    # data validator (map.json + optics.json + islands.json referential integrity)
npm test         # fixture tests for the validator
```

## Architecture

- Astro 5, fully static, zero hydration — each interactive island is one plain script
- Concept pages: Astro content collection (`src/content/concepts/`)
- Map data: `src/data/map.json`; island routing: `src/data/islands.json`;
  island science data: `src/data/optics.json` (illustrative absorption curves —
  visually faithful, not measured spectra)

## Provenance

Curated rewrites of notes from a personal knowledge vault (glass-materials
cluster, Phase 11). Drift from the originals is accepted by design.
