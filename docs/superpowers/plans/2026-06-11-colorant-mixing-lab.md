# Colorant Mixing Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone `/mixing-lab/` page where the reader melts up to four glass colorants at adjustable concentrations and watches the absorption curve and transmitted color respond, with curated recipe presets — built as the site's first Svelte 5 island.

**Architecture:** Science stays in a new framework-agnostic pure-function module `src/scripts/optics-core.js` (extracted from `spectrum.js` plus one new function, `mixedAbsorbance`, implementing multiplicative transmittance). A Svelte 5 component owns only state and rendering. Recipes live in `optics.json` with validator + fixture coverage. The four existing vanilla islands are untouched.

**Tech Stack:** Astro 5 (static), Svelte 5 (runes), vanilla JS science core, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-11-colorant-mixing-design.md`

**Project facts the spec doesn't state** (verified against the codebase):

- Colorant `group` values are `ions`, `colloids`, `bandgap` (12 colorants; `neodymium` is `ions`).
- `optics.wavelengths` has 17 points, 380–780 nm.
- Tests run via `npm test` → `node --test 'test/**/*.test.mjs'` — new files in `test/` are picked up automatically.
- `npm run check` runs `scripts/check_data.mjs` in script mode; `npm run build` = `astro build` (the deploy workflow runs check + test separately; build does NOT call check, so always run all three gates).
- Concept pages live at `/concepts/<slug>/`, so a markdown link to the lab is `../../mixing-lab/`.
- Global CSS vars available everywhere: `--bg --panel --node --node-hi --edge --text --muted --faint --accent`. `.concept` (global.css:111) gives the 72ch centered column.

---

### Task 1: Extract `optics-core.js` from `spectrum.js` (behavior-preserving)

**Files:**
- Create: `src/scripts/optics-core.js`
- Modify: `src/scripts/islands/spectrum.js`
- Test: `test/optics-core.test.mjs` (new)

- [ ] **Step 1: Write the failing smoke tests**

Create `test/optics-core.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/scripts/optics-core.js';
import * as spectrum from '../src/scripts/islands/spectrum.js';

test('wavelengthToRgb: 555 nm is green-dominant', () => {
  const [r, g, b] = core.wavelengthToRgb(555);
  assert.ok(g > r && g > b);
});

test('wavelengthToRgb: 430 nm is blue-dominant', () => {
  const [r, g, b] = core.wavelengthToRgb(430);
  assert.ok(b > r && b > g);
});

test('transmittedColor returns an rgb() string', () => {
  const color = core.transmittedColor([380, 580, 780], [0, 0, 0], [1, 1, 1]);
  assert.match(color, /^rgb\(\d+, \d+, \d+\)$/);
});

test('spectrum.js re-exports the core functions (extraction is behavior-preserving)', () => {
  assert.equal(spectrum.wavelengthToRgb, core.wavelengthToRgb);
  assert.equal(spectrum.transmittedColor, core.transmittedColor);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '...optics-core.js'`

- [ ] **Step 3: Create the core module**

Create `src/scripts/optics-core.js`. The two functions move **verbatim** from `src/scripts/islands/spectrum.js:5-37` (lines shown here in full so no cross-referencing is needed):

```js
// optics-core.js — framework-agnostic color science shared by islands.
// Pure functions only: no DOM, no framework imports.

// Wavelength (nm) -> approximate sRGB (0..1), piecewise-linear visible-spectrum map.
export function wavelengthToRgb(w) {
  let r = 0, g = 0, b = 0;
  if (w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (w < 420) f = 0.3 + 0.7 * (w - 380) / 40;
  else if (w > 700) f = 0.3 + 0.7 * (780 - w) / 80;
  return [r * f, g * f, b * f];
}

// Integrate illuminant x transmission x rgb(lambda) over the sample points.
// Each wavelength is additionally weighted by an approximate photopic luminosity
// factor (Gaussian centred at 555 nm, sigma=100 nm) so that the human eye's
// sensitivity peak is respected and colours read more true to life.
export function transmittedColor(wavelengths, absorbance, spd) {
  let r = 0, g = 0, b = 0, norm = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    const w = wavelengths[i];
    const lum = Math.exp(-((w - 555) ** 2) / (2 * 100 ** 2));
    const weight = spd[i] * lum;
    const t = weight * (1 - absorbance[i]);
    const [cr, cg, cb] = wavelengthToRgb(w);
    r += t * cr; g += t * cg; b += t * cb; norm += weight;
  }
  const scale = 255 / (norm * 0.55); // headroom so saturated colors don't clip to white
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * scale)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}
```

- [ ] **Step 4: Rewrite `spectrum.js` to import from core**

In `src/scripts/islands/spectrum.js`, delete the two function definitions (lines 1–37, including their comment blocks) and replace with:

```js
// SpectrumExplorer: colorant buttons -> absorption curve over a spectrum gradient
// -> transmitted-color swatch. Color science lives in ../optics-core.js.
import { wavelengthToRgb, transmittedColor } from '../optics-core.js';
export { wavelengthToRgb, transmittedColor };
```

`initSpectrumExplorer` (the rest of the file) stays exactly as it is — it uses `transmittedColor`, which is now the imported binding.

- [ ] **Step 5: Run all gates**

Run: `npm test && npm run check && npm run build`
Expected: all PASS (4 new tests + 7 existing; build green — `SpectrumExplorer.astro` imports `initSpectrumExplorer`, unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/optics-core.js src/scripts/islands/spectrum.js test/optics-core.test.mjs
git commit -m "refactor: extract framework-agnostic optics-core from spectrum island

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `mixedAbsorbance` — multiplicative transmittance (TDD)

**Files:**
- Modify: `src/scripts/optics-core.js`
- Test: `test/optics-core.test.mjs`

The model: each colorant at concentration `c ∈ [0,1]` passes fraction `1 − c·A(λ)`; the melt passes the product. `A_eff(λ) = 1 − Π_i (1 − c_i · A_i(λ))`.

- [ ] **Step 1: Write the failing tests**

Append to `test/optics-core.test.mjs`:

```js
const co = { absorbance: [0.2, 0.9, 0.05] };
const cr = { absorbance: [0.7, 0.1, 0.8] };

test('mixedAbsorbance: empty melt is clear glass (all zeros)', () => {
  assert.deepEqual(core.mixedAbsorbance([], 3), [0, 0, 0]);
});

test('mixedAbsorbance: single colorant at c=1 equals its raw curve', () => {
  const out = core.mixedAbsorbance([{ colorant: co, c: 1 }], 3);
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(out[j] - co.absorbance[j]) < 1e-12);
});

test('mixedAbsorbance is commutative', () => {
  const ab = core.mixedAbsorbance([{ colorant: co, c: 0.6 }, { colorant: cr, c: 0.3 }], 3);
  const ba = core.mixedAbsorbance([{ colorant: cr, c: 0.3 }, { colorant: co, c: 0.6 }], 3);
  assert.deepEqual(ab, ba);
});

test('mixedAbsorbance is monotone in concentration', () => {
  const lo = core.mixedAbsorbance([{ colorant: co, c: 0.2 }, { colorant: cr, c: 0.5 }], 3);
  const hi = core.mixedAbsorbance([{ colorant: co, c: 0.8 }, { colorant: cr, c: 0.5 }], 3);
  for (let j = 0; j < 3; j++) assert.ok(hi[j] >= lo[j]);
});

test('mixedAbsorbance stays in [0,1] when stacking strong colorants', () => {
  const strong = { absorbance: [0.95, 0.98, 0.99] };
  const melts = Array.from({ length: 4 }, () => ({ colorant: strong, c: 1 }));
  const out = core.mixedAbsorbance(melts, 3);
  for (const v of out) assert.ok(v >= 0 && v <= 1);
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: FAIL — `core.mixedAbsorbance is not a function`

- [ ] **Step 3: Implement**

Append to `src/scripts/optics-core.js`:

```js
// Multiplicative-transmittance mixing (Beer–Lambert in spirit, linearized in c).
// melts: [{ colorant: { absorbance: [...] }, c: 0..1 }]; n: number of wavelength points.
// Per point j: A_eff[j] = 1 - product_i(1 - c_i * A_i[j]).
export function mixedAbsorbance(melts, n) {
  const out = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let t = 1;
    for (const { colorant, c } of melts) t *= 1 - c * colorant.absorbance[j];
    out[j] = 1 - t;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (9 optics-core tests + 7 validator tests).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/optics-core.js test/optics-core.test.mjs
git commit -m "feat: mixedAbsorbance — multiplicative transmittance mixing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Recipes in `optics.json` + validator rules (TDD)

**Files:**
- Modify: `scripts/check_data.mjs`
- Modify: `src/data/optics.json`
- Test: `test/check_data.test.mjs`

- [ ] **Step 1: Write the failing fixture tests**

Append to `test/check_data.test.mjs` (note: `goodOptics` in this file has a single colorant, `cobalt` — recipes in fixtures must reference it):

```js
const goodRecipe = {
  id: 'r1', label: 'L', story: 'S',
  melt: [{ colorant: 'cobalt', c: 0.5 }],
};

function opticsWithRecipes(recipes) {
  return { ...structuredClone(goodOptics), recipes };
}

test('valid recipes produce no errors', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const { errors } = validate(goodMap, opticsWithRecipes([goodRecipe]), dir);
  assert.deepEqual(errors, []);
});

test('recipe referencing unknown colorant is an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const r = structuredClone(goodRecipe);
  r.melt[0].colorant = 'unobtainium';
  const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
  assert.ok(errors.some((e) => e.includes('unobtainium')));
});

test('recipe concentration must be in (0,1]', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  for (const bad of [0, -0.1, 1.5]) {
    const r = structuredClone(goodRecipe);
    r.melt[0].c = bad;
    const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
    assert.ok(errors.some((e) => e.includes('r1')), `c=${bad} should be rejected`);
  }
});

test('recipe melt must contain 1-4 components', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const empty = structuredClone(goodRecipe);
  empty.melt = [];
  const five = structuredClone(goodRecipe);
  five.melt = Array.from({ length: 5 }, () => ({ colorant: 'cobalt', c: 0.5 }));
  for (const r of [empty, five]) {
    const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
    assert.ok(errors.some((e) => e.includes('1-4')));
  }
});

test('duplicate recipe ids are an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const { errors } = validate(goodMap, opticsWithRecipes([goodRecipe, structuredClone(goodRecipe)]), dir);
  assert.ok(errors.some((e) => e.includes('duplicate')));
});

test('recipe label and story must be non-empty', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const noLabel = structuredClone(goodRecipe);
  noLabel.label = '';
  const noStory = structuredClone(goodRecipe);
  noStory.story = '';
  for (const r of [noLabel, noStory]) {
    const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
    assert.ok(errors.some((e) => e.includes('r1')));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the five new rejection tests FAIL (validator currently ignores `recipes`); the "valid recipes" test passes vacuously.

- [ ] **Step 3: Implement the validator rules**

In `scripts/check_data.mjs`, insert after the striking-sequence loop (after line 57, before the `// --- islands.json` block):

```js
  // --- recipes (optional) ---
  const recipeColorantIds = new Set(optics.colorants.map((c) => c.id));
  const recipeIds = new Set();
  for (const r of optics.recipes || []) {
    if (recipeIds.has(r.id)) errors.push(`recipe ${r.id}: duplicate id`);
    recipeIds.add(r.id);
    if (!r.label) errors.push(`recipe ${r.id}: label must be non-empty`);
    if (!r.story) errors.push(`recipe ${r.id}: story must be non-empty`);
    if (!Array.isArray(r.melt) || r.melt.length < 1 || r.melt.length > 4) {
      errors.push(`recipe ${r.id}: melt must contain 1-4 components`);
    } else {
      for (const m of r.melt) {
        if (!recipeColorantIds.has(m.colorant)) {
          errors.push(`recipe ${r.id}: colorant "${m.colorant}" not found in optics.colorants`);
        }
        if (!(m.c > 0 && m.c <= 1)) {
          errors.push(`recipe ${r.id}: c must be in (0,1], got ${m.c}`);
        }
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (13 validator tests + 9 optics-core tests).

- [ ] **Step 5: Add the real recipes to `optics.json`**

In `src/data/optics.json`, add a top-level `"recipes"` key after `"striking"` (keep it last; concentrations are starting points, tuned visually in Task 8):

```json
"recipes": [
  {
    "id": "decolorize",
    "label": "Decolorize",
    "story": "Manganese's purple absorbs where iron's green transmits — they cancel toward gray, the old glassmaker's trick. (The real trick also involves redox chemistry this model can't show.)",
    "melt": [
      { "colorant": "iron-ferrous", "c": 0.5 },
      { "colorant": "manganese", "c": 0.35 }
    ]
  },
  {
    "id": "deep-teal",
    "label": "Deep teal",
    "story": "Cobalt devours the orange and red; chromium devours the violet and red — stack them and only a blue-green window survives.",
    "melt": [
      { "colorant": "cobalt", "c": 0.4 },
      { "colorant": "chromium", "c": 0.5 }
    ]
  },
  {
    "id": "amber-ish",
    "label": "Amber-ish",
    "story": "Ferric iron's violet edge plus manganese's green dip leave a warm straw-amber. Real beer-bottle amber needs the ferri-sulfide chromophore — this is only the spectral half of the story.",
    "melt": [
      { "colorant": "iron-ferric", "c": 0.8 },
      { "colorant": "manganese", "c": 0.3 }
    ]
  }
]
```

- [ ] **Step 6: Run the validator against real data**

Run: `npm run check`
Expected: `check_data: OK`

- [ ] **Step 7: Commit**

```bash
git add scripts/check_data.mjs src/data/optics.json test/check_data.test.mjs
git commit -m "feat: recipe presets in optics.json with validator coverage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Svelte 5 integration

**Files:**
- Modify: `astro.config.mjs`, `package.json` (+ lockfile; possibly a generated `svelte.config.js`)

- [ ] **Step 1: Add the integration**

Run: `npx astro add svelte --yes`
Expected: installs `svelte` + `@astrojs/svelte`, updates `astro.config.mjs`. If the command fails, do it manually: `npm install svelte @astrojs/svelte` and set `astro.config.mjs` to:

```js
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://jacob234.github.io',
  base: '/glass-color-explainer',
  integrations: [svelte()],
});
```

- [ ] **Step 2: Verify all gates still pass**

Run: `npm run build && npm test && npm run check`
Expected: all green (no Svelte components exist yet; this proves the integration alone breaks nothing).

- [ ] **Step 3: Commit**

```bash
git add astro.config.mjs package.json package-lock.json
git add svelte.config.js 2>/dev/null || true   # astro add may or may not generate one
git commit -m "chore: add Svelte 5 integration for the mixing-lab island

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `MixingLab.svelte` component

**Files:**
- Create: `src/components/islands/MixingLab.svelte`

No automated DOM tests (no component harness in this project; the logic lives in tested `optics-core.js`). Manual verification happens in Task 8.

- [ ] **Step 1: Create the component**

Create `src/components/islands/MixingLab.svelte` with exactly this content:

```svelte
<script>
  import { mixedAbsorbance, transmittedColor } from '../../scripts/optics-core.js';

  let { optics, recipes = [] } = $props();

  const MAX = 4;
  const W = 360, H = 90;
  const daylight = optics.illuminants.find((i) => i.id === 'daylight');
  const byId = new Map(optics.colorants.map((c) => [c.id, c]));
  const groups = [
    { id: 'ions', label: 'dissolved ions' },
    { id: 'colloids', label: 'metal colloids' },
    { id: 'bandgap', label: 'band-gap crystals' },
  ];
  // Each chip carries a dot of that colorant alone at full strength.
  const chipColor = Object.fromEntries(
    optics.colorants.map((c) => [c.id, transmittedColor(optics.wavelengths, c.absorbance, daylight.spd)])
  );

  let melt = $state([]); // [{ id, c }]
  let activeRecipeId = $state(null);

  let mixCurve = $derived(
    mixedAbsorbance(melt.map((m) => ({ colorant: byId.get(m.id), c: m.c })), optics.wavelengths.length)
  );
  let swatch = $derived(transmittedColor(optics.wavelengths, mixCurve, daylight.spd));
  let caption = $derived(
    activeRecipeId ? recipes.find((r) => r.id === activeRecipeId)?.story ?? ''
    : melt.length === 0 ? 'clear glass — add a colorant.'
    : ''
  );

  function toPoints(absorbance, scale = 1) {
    return absorbance
      .map((a, i) => `${(i / (absorbance.length - 1)) * W},${H - a * scale * H}`)
      .join(' ');
  }

  function toggle(id) {
    const i = melt.findIndex((m) => m.id === id);
    if (i >= 0) melt.splice(i, 1);
    else if (melt.length < MAX) melt.push({ id, c: 0.5 });
    activeRecipeId = null;
  }

  function setC(i, value) {
    melt[i].c = value / 100;
    activeRecipeId = null; // a recipe is a starting point, not a mode
  }

  function applyRecipe(r) {
    melt = r.melt.map((m) => ({ id: m.colorant, c: m.c }));
    activeRecipeId = r.id;
  }
</script>

<figure class="lab">
  <div class="lab-recipes">
    <span class="lab-label">recipes</span>
    {#each recipes as r (r.id)}
      <button class="recipe" class:active={activeRecipeId === r.id} onclick={() => applyRecipe(r)}>
        ⚗ {r.label}
      </button>
    {/each}
  </div>

  <div class="lab-palette">
    {#each groups as g (g.id)}
      <div class="group">
        <span class="lab-label">{g.label}</span>
        <div class="chips">
          {#each optics.colorants.filter((c) => c.group === g.id) as c (c.id)}
            {@const inMelt = melt.some((m) => m.id === c.id)}
            <button
              class="chip"
              class:active={inMelt}
              disabled={!inMelt && melt.length >= MAX}
              aria-pressed={inMelt}
              onclick={() => toggle(c.id)}>
              <span class="dot" style:background={chipColor[c.id]}></span>{c.label}
            </button>
          {/each}
        </div>
      </div>
    {/each}
    {#if melt.length >= MAX}
      <p class="cap-note">real batches stay simple — remove one first</p>
    {/if}
  </div>

  <div class="lab-melt">
    <span class="lab-label">in the melt</span>
    {#each melt as m, i (m.id)}
      {@const c = byId.get(m.id)}
      <div class="row">
        <span class="dot" style:background={chipColor[m.id]}></span>
        <span class="name">{c.label}</span>
        <button class="remove" aria-label={`remove ${c.label}`} onclick={() => toggle(m.id)}>✕</button>
        <input
          type="range" min="0" max="100"
          value={Math.round(m.c * 100)}
          oninput={(e) => setC(i, e.currentTarget.valueAsNumber)}
          aria-label={`${c.label} concentration`}
          aria-valuetext={`${Math.round(m.c * 100)} percent`} />
        <span class="pct">{Math.round(m.c * 100)}%</span>
      </div>
    {/each}
  </div>

  <div class="lab-stage">
    <svg viewBox="0 0 360 90" class="lab-svg" role="img"
      aria-label="combined absorption curve over the visible spectrum">
      <defs>
        <linearGradient id="vis-mix" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#610061"/><stop offset="12%" stop-color="#3b00b8"/>
          <stop offset="28%" stop-color="#007bff"/><stop offset="44%" stop-color="#00c853"/>
          <stop offset="58%" stop-color="#ffe600"/><stop offset="74%" stop-color="#ff8c00"/>
          <stop offset="100%" stop-color="#c40000"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="360" height="90" fill="url(#vis-mix)" opacity="0.85"/>
      {#each melt as m (m.id)}
        <polyline fill="none" stroke="#111" stroke-width="1" opacity="0.35"
          points={toPoints(byId.get(m.id).absorbance, m.c)} />
      {/each}
      <polyline fill="none" stroke="#111" stroke-width="2.5" points={toPoints(mixCurve)} />
    </svg>
    <div class="lab-swatch" style:background={swatch} title="transmitted color"></div>
  </div>

  <figcaption>{caption}</figcaption>
  <p class="island-footnote">
    Curves are illustrative approximations; the swatch is a coarse RGB rendering, not a full
    CIE pipeline. Mixing multiplies per-colorant transmittance with linear concentration
    scaling — real melts involve redox interactions between colorants that this model ignores.
  </p>
</figure>

<style>
  .lab { border: 1px solid var(--edge); border-radius: 12px; padding: 1rem; margin: 1.5rem 0; background: var(--panel); }
  .lab-label { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); margin-bottom: 0.3rem; }

  .lab-recipes { margin-bottom: 0.9rem; }
  .recipe { font-size: 0.78rem; padding: 0.25rem 0.6rem; margin: 0 0.3rem 0.3rem 0; border-radius: 6px;
    border: 1px dashed var(--faint); background: var(--node); color: var(--muted); cursor: pointer;
    transition: color .15s, border-color .15s, background .15s; }
  .recipe:hover { color: var(--text); border-color: var(--accent); }
  .recipe.active { background: var(--accent); color: var(--bg); border-color: var(--accent); border-style: solid; }

  .lab-palette .group { margin-bottom: 0.6rem; }
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem;
    padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--edge);
    background: var(--node); color: var(--muted); cursor: pointer;
    transition: color .15s, border-color .15s, background .15s; }
  .chip:hover:not(:disabled) { color: var(--text); border-color: var(--faint); }
  .chip.active { background: var(--node-hi); color: var(--text); border-color: var(--accent); }
  .chip:disabled { opacity: 0.35; cursor: not-allowed; }
  .dot { width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid var(--edge); flex: none; }
  .cap-note { font-size: 0.72rem; color: var(--faint); margin: 0.3rem 0 0; font-style: italic; }

  .lab-melt { border: 1px solid var(--edge); border-radius: 8px; padding: 0.6rem 0.8rem; margin: 0.9rem 0; }
  .row { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0; }
  .row .name { font-size: 0.82rem; color: var(--text); width: 9.5rem; flex: none; }
  .row .remove { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 0.8rem; padding: 0 0.2rem; }
  .row .remove:hover { color: var(--text); }
  .row input[type="range"] { flex: 1; accent-color: var(--accent); }
  .row .pct { font-size: 0.78rem; color: var(--muted); width: 2.6rem; text-align: right; font-family: var(--mono); }

  .lab-stage { display: flex; gap: 0.8rem; align-items: center; }
  .lab-svg { flex: 1; border-radius: 8px; }
  .lab-swatch { width: 3.4rem; height: 3.4rem; border-radius: 10px; border: 2px solid var(--edge);
    box-shadow: inset 0 0 12px rgba(255,255,255,0.35); flex: none; }

  figcaption { margin-top: 0.5rem; font-size: 0.88rem; color: var(--muted); min-height: 1.3em; }
  .island-footnote { font-size: 0.72rem; color: var(--faint); margin: 0.5rem 0 0; }
</style>
```

Notes for the implementer:

- Svelte scopes the `<style>` block itself — this is why the v1 "no JS-created styled nodes" rule (an Astro scoped-CSS pitfall) doesn't apply here.
- The gradient id is `vis-mix`, not `vis`, to avoid any collision with the existing explorer's gradient if both ever share a page.
- Faint per-colorant curves use scaled absorbance `c·A(λ)` — for a single colorant that's exactly its contribution under the multiplicative model.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: PASS. (The component isn't used by any page yet; Astro only compiles it once imported — so if build doesn't touch it, that's fine; final compile-proof comes in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/MixingLab.svelte
git commit -m "feat: MixingLab Svelte island — palette + crucible mixing UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: The `/mixing-lab/` page

**Files:**
- Create: `src/pages/mixing-lab.astro`

- [ ] **Step 1: Create the page**

Create `src/pages/mixing-lab.astro`:

```astro
---
import Base from '../layouts/Base.astro';
import MixingLab from '../components/islands/MixingLab.svelte';
import optics from '../data/optics.json';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
---
<Base title="Mixing Lab" description="Melt up to four glass colorants at adjustable concentrations and watch the absorption curve and transmitted color respond.">
  <article class="concept">
    <h1>Mixing Lab</h1>
    <p class="summary">
      Every concept page shows one colorant at a time. Real glass is a melt: pick up to four
      colorants, set their concentrations, and watch the combined absorption curve and the
      transmitted color respond. The recipes set up classic combinations worth understanding.
    </p>
    <MixingLab client:load optics={optics} recipes={optics.recipes} />
    <p class="back"><a href={`${base}/`}>← back to the map</a></p>
  </article>
</Base>
```

(`article.concept` reuses the global 72ch column from `global.css:111`. Single `h1`, no duplicate headings — the anchor contract is safe.)

- [ ] **Step 2: Build and verify the page exists**

Run: `npm run build && ls dist/mixing-lab/index.html`
Expected: build PASS; the file exists. This is also the first real Svelte compile.

- [ ] **Step 3: Commit**

```bash
git add src/pages/mixing-lab.astro
git commit -m "feat: standalone /mixing-lab/ page hosting the Svelte island

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Links from the home page and the transition-metals page

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/content/concepts/transition-metal-colorants.md`

- [ ] **Step 1: Add the home-page link directly below the map**

`src/pages/index.astro` becomes:

```astro
---
import Base from '../layouts/Base.astro';
import GlassMap from '../components/GlassMap.astro';
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
---
<Base title="the four mechanisms" description="The four physical mechanisms that color glass — dissolved ions, metal colloids, band-gap crystals, and structure — with the real objects they explain.">
  <GlassMap />
  <p class="map-footnote">Every swatch is a real object. Click it to find out why it's that color.</p>
  <p class="lab-link"><a href={`${base}/mixing-lab/`}>open the mixing lab ⚗</a></p>
</Base>
<style>
  .map-footnote { text-align: center; font-size: 0.85rem; opacity: 0.7; margin-top: 1rem; }
  .lab-link { text-align: center; font-size: 0.85rem; margin-top: 0.4rem; }
</style>
```

- [ ] **Step 2: Add the prose link on the transition-metals page**

In `src/content/concepts/transition-metal-colorants.md`, append this paragraph at the very end of the file (after the "Wine-bottle green" section's last paragraph; it is a paragraph, **not** a heading, so the anchor contract is untouched):

```markdown
Want to see what these ions do together? Open the [mixing lab](../../mixing-lab/) and melt them in combination — cobalt plus chromium, or the old iron-and-manganese decolorizing trick.
```

- [ ] **Step 3: Run all gates**

Run: `npm run check && npm test && npm run build`
Expected: all PASS (the validator only inspects frontmatter ids and headings, so the new paragraph is inert to it).

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro src/content/concepts/transition-metal-colorants.md
git commit -m "feat: link mixing lab from home map and transition-metals page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Manual verification + recipe tuning

**Files:**
- Possibly modify: `src/data/optics.json` (recipe concentrations only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) and open `http://localhost:4321/glass-color-explainer/mixing-lab/`.

- [ ] **Step 2: Walk the checklist**

- Empty state: flat curve along the bottom, near-white swatch, caption "clear glass — add a colorant."
- Click Cobalt: chip activates, melt row appears at 50%, faint cobalt curve + bold mix curve render, swatch turns blue. Drag the slider to 100%: swatch should match the cobalt swatch on `/concepts/transition-metal-colorants/` (the c=1 identity).
- Add three more colorants: at 4, remaining chips disable and the cap note appears. Remove one (✕ or chip): chips re-enable.
- Click each recipe: melt is replaced, recipe chip highlights, story text appears in the caption. Decolorize should read grayish, Deep teal blue-green, Amber-ish warm straw. Touch any slider: recipe highlight and story clear, melt stays.
- Keyboard: tab to chips/sliders, space toggles chips, arrows move sliders.
- Existing pages regression: `/concepts/transition-metal-colorants/` spectrum explorer still works (single-select, unchanged), as do striking/alexandrite/lycurgus pages.

- [ ] **Step 3: Tune recipe concentrations if needed**

If a recipe's swatch doesn't read as its story claims (gray / teal / straw-amber), adjust only the `c` values in `src/data/optics.json` and re-check in the browser. Keep every `c` in (0,1].

- [ ] **Step 4: Final gates**

Run: `npm run check && npm test && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit (if tuning changed anything)**

```bash
git add src/data/optics.json
git commit -m "tune: recipe concentrations against rendered swatches

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Explicitly out of scope (per spec)

- The "muddy 4-colorant" stretch recipe — only if tuning stumbles on a convincing one.
- Migrating the concept-page SpectrumExplorer or any other island to Svelte.
- Component-level DOM tests, CIE pipeline, `islands.json` changes, nav-bar changes.
