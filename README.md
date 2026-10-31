# How Glass Works

An explorable explainer on glass, physics first. One piece of glass is followed through
the studio, from batch and melt to the glory hole, the lehr, the cold shop and the
showroom, and each stage computes what it shows from measured data or a model it names:
the silicate network and the glass transition, viscosity and fragility, chemical
durability, annealing stress, refraction and dispersion, and color. Color, the strand
the site started from, is computed from absorption spectra through the CIE observer.
Lab pages open the instruments up: Light Lab (spectral ray tracing), Forming Lab
(a gather on a blowpipe), Structure Lab (2D molecular dynamics), Network lab (3D
silicate glass from LAMMPS runs) and Mixing Lab (colorants).

**Live site:** https://howglassworks.fyi/
(The repository and URL keep the original name, from when the site covered color only.)

## Development

```sh
npm install
npm run dev      # http://localhost:4321/
```

## Quality gates

```sh
npm run build    # static build; unresolved slugs/anchors fail it
npm run check    # data validators (map/optics/islands + catalog referential integrity)
npm test         # unit tests, including the color engine against colour-science (test/oracle.test.mjs; regenerate with scripts/build_oracle.py)
```

## Architecture

- Astro 5, fully static; each interactive island is one plain script, except the Svelte mixing lab
- Home stages: `src/components/` (Home, WhatGlassIs, Fragility, Dispersion, Observers),
  instruments in `src/scripts/` (batch, glass, fragility, stress, prism, strike, …)
- Concept pages (the long read on color): Astro content collection (`src/content/concepts/`)
- Sources: every citation has an entry in `src/data/library.json`, shown at /library/
- Map data: `src/data/map.json`; island routing: `src/data/islands.json`;
  island science data: `src/data/optics.json` (illustrative absorption curves —
  visually faithful, not measured spectra)
- Color science: `src/scripts/optics-core.js` — Beer–Lambert mixing (optical densities add,
  scaled by concentration and thickness), integrated against the CIE 1931 2° observer
  (Wyman–Sloan–Shirley analytic fit), Bradford-adapted to D65, encoded as sRGB

## Color catalog (reference dataset)

`src/data/catalog/` is a standalone, versioned sweep of real glass-art supplier colors
(Bullseye, Effetre, Glass Alchemy…), each linking back to the `optics.json` colorant that
explains it. It feeds the rack (stage 08) on the home page. The sweeper lives in
[`tools/catalog-sweep/`](tools/catalog-sweep/) (Python, kept out of `package.json`); colorant
mappings and swatch hexes are honest approximations (inferred from names, sampled from photos),
validated by `scripts/check_catalog.mjs`.

## Provenance

Curated rewrites of notes from a personal knowledge vault (glass-materials
cluster, Phase 11). Drift from the originals is accepted by design.
