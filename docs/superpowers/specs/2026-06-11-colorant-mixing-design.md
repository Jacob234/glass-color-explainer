# Colorant Mixing Lab — Design Spec

Date: 2026-06-11
Status: approved (brainstorm session, layout option B "palette + crucible")

## Goal

Add a colorant-mixing experience to the site: a sandbox where the reader melts up to four
colorants at adjustable concentrations and watches the absorption curve and transmitted
color respond, with curated recipe presets that set up teachable configurations. This is
also the agreed trigger for the first framework island: the mixing UI is built in Svelte 5,
while the four existing vanilla-JS islands stay untouched.

## Decisions made during brainstorming

| Question | Decision |
| --- | --- |
| Pedagogy | Sandbox with guided moments: free mixing plus curated recipe presets |
| Placement | New standalone page `/mixing-lab/`; existing SpectrumExplorer instances unchanged |
| Mixing math | Multiplicative transmittance (Beer–Lambert in spirit), not clamped additive absorbance |
| Framework | Svelte 5 (runes), hydrated island; science stays in framework-agnostic vanilla JS |
| Layout | Option B "palette + crucible": chip palette → melt panel with sliders → spectrum stage |

## 1. Placement & page structure

- New standalone page `src/pages/mixing-lab.astro` (URL `/mixing-lab/`), using `Base.astro`.
- It is **not** a content-collection concept: the home map and prev/next chain encode the
  mechanism taxonomy, and a lab is not a mechanism. `map.json` is not modified.
- Linked from the home page (small "open the mixing lab ⚗" link directly below the map) and from
  the `transition-metal-colorants` concept page's prose.
- Single `h1` ("Mixing Lab"). As an `.astro` page (not markdown), the heading-anchor
  contract (anchors = exact heading texts via github-slugger) is not at risk. No duplicate
  heading texts on the page.

## 2. Island architecture & the science seam

Three pieces:

1. **`src/scripts/optics-core.js`** (new, framework-agnostic, pure functions):
   - `wavelengthToRgb` and `transmittedColor` move here from
     `src/scripts/islands/spectrum.js`.
   - New: `mixedAbsorbance(melts)` where `melts = [{ colorant, c }]` →
     per wavelength `j`: `A_eff[j] = 1 − Π_i (1 − c_i · A_i[j])`.
   - `spectrum.js` re-imports from core; the vanilla SpectrumExplorer's behavior is
     unchanged. The other three islands are untouched.
2. **`src/components/islands/MixingLab.svelte`** (Svelte 5):
   - UI state — melt contents, concentrations, active recipe — as `$state`.
   - Mix curve and swatch as `$derived` via the core functions.
   - Receives the optics slice (wavelengths, colorants, daylight SPD) and recipes as
     props from the page. No data fetching inside the component.
3. **Astro integration**: add `svelte` + `@astrojs/svelte` to dependencies and
   `astro.config.mjs`; hydrate with `client:load`.

Seam rationale: the science never enters Svelte. Node tests hit `mixedAbsorbance`
directly with no compiler in the loop, and a future re-migration of the island moves
only state/rendering, never physics.

## 3. Data & validation

`src/data/optics.json` gains one new top-level section, `recipes`:

```json
"recipes": [
  {
    "id": "decolorize",
    "label": "Decolorize",
    "story": "Manganese's purple absorbs where iron's green transmits — they cancel toward gray, the old glassmaker's trick.",
    "melt": [
      { "colorant": "iron-ferrous", "c": 0.5 },
      { "colorant": "manganese", "c": 0.35 }
    ]
  }
]
```

Initial presets (concentrations tuned at implementation time against the rendered swatch):

- **Decolorize** — iron-ferrous + manganese
- **Deep teal** — cobalt + chromium
- **Amber-ish** — iron-ferric + manganese
- Stretch (non-blocking): a deliberately muddy 4-colorant mix to teach over-mixing —
  include only if tuning finds a combination whose swatch reads convincingly muddy

Validator rules added to `scripts/check_data.mjs`:

- every `melt[].colorant` exists in `optics.colorants`
- `c` in (0, 1]
- melt length 1–4
- recipe ids unique; `label` and `story` non-empty

`islands.json` is not touched: its job is mapping concept slugs to island configs, and the
standalone page imports `optics.json` directly.

## 4. UX (layout B — palette + crucible)

- **Palette**: all 12 colorant chips, grouped by the existing `group` field, each with a
  small swatch dot of that colorant alone. Click to add to the melt; chips of melted
  colorants render in the active style; clicking an active chip removes it.
- **Melt panel ("In the melt")**: one row per added colorant — mini swatch, name,
  ✕ remove, range slider 0–100 %, numeric %. Hard cap of 4; at 4 the remaining palette
  chips disable with a note ("real batches stay simple — remove one first"). New
  additions enter at 50 %.
- **Spectrum stage**: same 360×90 SVG and visible-spectrum gradient as the existing
  explorer. Bold black mix curve (effective absorbance) plus each melted colorant's
  individual curve at its current concentration as a thin ~35 %-opacity line.
  Transmitted-color swatch to the right, same styling as the existing explorer.
- **Recipes row**: chips above the palette. Clicking one replaces the melt with the
  recipe's components and shows its `story` in the figcaption slot. Touching any slider
  afterward keeps the melt but clears the active-recipe highlight — a starting point,
  not a mode.
- **Empty state**: flat zero-absorbance curve, near-white swatch, caption
  "clear glass — add a colorant."
- **Honesty footnote** (extends the v1 contract): "Curves are illustrative
  approximations; the swatch is a coarse RGB rendering, not a full CIE pipeline. Mixing
  multiplies per-colorant transmittance with linear concentration scaling — real melts
  involve redox interactions between colorants that this model ignores."
  The redox clause matters: manganese + iron decolorize partly through redox chemistry,
  not just spectral cancellation; the recipe story teaches the spectral part the model
  can show, the footnote owns what it cannot.

## 5. Mixing math

Each colorant at concentration `c` passes fraction `1 − c·A(λ)`; the melt passes the
product:

```
A_eff(λ) = 1 − Π_i (1 − c_i · A_i(λ))
```

The swatch is `transmittedColor(wavelengths, A_eff, daylightSpd)` — the existing
photopic-weighted function, unmodified. Consequences:

- A single-colorant melt at c = 1.0 renders identically to that colorant in the old
  explorer (built-in sanity check, also a unit test).
- Empty melt → `A_eff ≡ 0` (clear glass).
- Stacking strong colorants darkens asymptotically; no clipping to a flat black line.

## 6. Testing & gates

- **Unit tests** (`test/optics-core.test.mjs`, new):
  - `mixedAbsorbance`: empty melt → all zeros; single colorant at c = 1 equals its raw
    curve; commutativity (order-independence); monotonicity in c; output stays in [0, 1].
  - Smoke tests for the moved `wavelengthToRgb` / `transmittedColor` so the extraction
    from `spectrum.js` is provably behavior-preserving.
- **Validator fixtures** (extend `test/check_data.test.mjs`): one good recipe case plus
  one rejection per rule in section 3.
- **Gates unchanged**: `npm run build`, `npm run check`, `npm test` all green; `check`
  remains part of `build`. Svelte compiles inside `astro build`; no new scripts.
- **Not tested**: the Svelte component's DOM. There is no component-test harness in this
  project; the science core carries the logic and the component is thin rendering,
  consistent with how the four vanilla islands are treated.

## Constraints carried over from v1

- The other three islands (StrikingSlider, AlexandriteToggle, LycurgusFlip) and the
  concept-page SpectrumExplorer stay vanilla and untouched.
- Scoped-CSS rule: Svelte's own style scoping applies inside the island; no
  `document.createElement` of styled nodes expecting Astro scoped CSS.
- Honesty footnotes on every new approximation (see section 4).
- Anchors are exact heading texts; no duplicate headings introduced.
