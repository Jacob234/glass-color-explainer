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
  let logThickness = $state(0); // path length is 2^logThickness × the reference sample
  let activeRecipeId = $state(null);

  let thickness = $derived(2 ** logThickness);
  let mixCurve = $derived(
    mixedAbsorbance(melt.map((m) => ({ colorant: byId.get(m.id), c: m.c })), optics.wavelengths.length, thickness)
  );
  let swatch = $derived(transmittedColor(optics.wavelengths, mixCurve, daylight.spd));
  let caption = $derived(
    activeRecipeId ? recipes.find((r) => r.id === activeRecipeId)?.story ?? ''
    : melt.length === 0 ? 'clear glass — add a colorant.'
    : ''
  );

  function toPoints(absorbance) {
    return absorbance
      .map((a, i) => `${(i / (absorbance.length - 1)) * W},${H - a * H}`)
      .join(' ');
  }

  // One colorant's own contribution at its concentration and the current thickness.
  const componentCurve = (m) =>
    mixedAbsorbance([{ colorant: byId.get(m.id), c: m.c }], optics.wavelengths.length, thickness);

  function toggle(id) {
    const i = melt.findIndex((m) => m.id === id);
    if (i >= 0) melt.splice(i, 1);
    else if (melt.length < MAX) melt.push({ id, c: 0.5 });
    activeRecipeId = null;
  }

  function setC(id, value) {
    const m = melt.find((x) => x.id === id);
    if (m) m.c = value / 100;
    activeRecipeId = null; // a recipe is a starting point, not a mode
  }

  function setThickness(value) {
    logThickness = value;
    activeRecipeId = null;
  }

  function applyRecipe(r) {
    melt = r.melt.map((m) => ({ id: m.colorant, c: m.c }));
    logThickness = Math.log2(r.thickness ?? 1);
    activeRecipeId = r.id;
  }
</script>

<figure class="lab instrument">
  <div class="lab-recipes">
    <span class="lab-label">recipes</span>
    {#each recipes as r (r.id)}
      <button class="recipe pill" class:active={activeRecipeId === r.id} aria-pressed={activeRecipeId === r.id} onclick={() => applyRecipe(r)}>
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
              class="chip pill"
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
    {#each melt as m (m.id)}
      {@const c = byId.get(m.id)}
      <div class="row">
        <span class="dot" style:background={chipColor[m.id]}></span>
        <span class="name">{c.label}</span>
        <button class="remove" aria-label={`remove ${c.label}`} onclick={() => toggle(m.id)}>✕</button>
        <input
          type="range" min="0" max="100"
          value={Math.round(m.c * 100)}
          oninput={(e) => setC(m.id, e.currentTarget.valueAsNumber)}
          aria-label={`${c.label} concentration`}
          aria-valuetext={`${Math.round(m.c * 100)} percent`} />
        <span class="pct">{Math.round(m.c * 100)}%</span>
      </div>
    {/each}
    <div class="row thickness">
      <span class="name">thickness</span>
      <input
        type="range" min="-2" max="2" step="0.05"
        value={logThickness}
        oninput={(e) => setThickness(e.currentTarget.valueAsNumber)}
        aria-label="glass thickness"
        aria-valuetext={`${thickness.toFixed(2)} times the reference thickness`} />
      <span class="pct">×{thickness < 1 ? thickness.toFixed(2) : thickness.toFixed(1)}</span>
    </div>
  </div>

  <div class="lab-stage">
    <svg viewBox="0 0 360 90" class="lab-svg spectrum-frame" preserveAspectRatio="none" role="img"
      aria-label="combined absorption curve over the visible spectrum">
      <defs>
        <linearGradient id="vis-mix" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#610061"/><stop offset="12%" stop-color="#3b00b8"/>
          <stop offset="28%" stop-color="#007bff"/><stop offset="44%" stop-color="#00c853"/>
          <stop offset="58%" stop-color="#ffe600"/><stop offset="74%" stop-color="#ff8c00"/>
          <stop offset="100%" stop-color="#c40000"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="360" height="90" fill="url(#vis-mix)"/>
      <polygon fill="#06070a" fill-opacity="0.82" points={`0,${H} ${toPoints(mixCurve)} ${W},${H}`} />
      {#each melt as m (m.id)}
        <polyline fill="none" stroke="#fff" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="3 3"
          vector-effect="non-scaling-stroke" points={toPoints(componentCurve(m))} />
      {/each}
      <polyline fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="1.5" vector-effect="non-scaling-stroke" points={toPoints(mixCurve)} />
    </svg>
    <div class="lab-swatch swatch-pane glass cast" role="img" style:--glass={swatch} aria-label="transmitted color" title="transmitted color"></div>
  </div>

  <figcaption>{caption}</figcaption>
  <p class="island-footnote">
    Curves are illustrative approximations, not measured spectra. The swatch integrates them
    against the CIE 1931 observer under daylight. Mixing follows Beer–Lambert: optical densities
    add, scaled by concentration and thickness. Real melts also involve redox interactions
    between colorants that this model ignores.
  </p>
</figure>

<style>
  .lab { margin-left: 0; margin-right: 0; }
  .lab-recipes { margin-bottom: 1.1rem; }
  .lab-recipes .pills, .lab-recipes { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
  .lab-recipes .lab-label { width: 100%; }
  .recipe { border-style: dashed; }
  .recipe.active { border-style: solid; }

  .lab-palette .group { margin-bottom: 0.8rem; }
  .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.3rem; }
  .chip.active { background: var(--node-hi); color: var(--text); border-color: var(--accent); }
  .dot { width: 0.7rem; height: 0.7rem; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); flex: none;
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.4); }
  .cap-note { font-size: 0.8rem; color: var(--faint); margin: 0.3rem 0 0; font-style: italic; }

  .lab-melt { border: 1px solid var(--edge); border-radius: 12px; padding: 0.8rem 1rem; margin: 1rem 0 1.2rem; background: rgba(0,0,0,0.18); }
  .row { display: flex; align-items: center; gap: 0.6rem; margin: 0.45rem 0; }
  .row .name { font-size: 0.92rem; color: var(--text); width: 10rem; flex: none; display: inline-flex; gap: 0.45rem; align-items: center; }
  .row .remove { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 0.8rem; padding: 0 0.2rem; }
  .row .remove:hover { color: var(--text); }
  .row input[type="range"] { flex: 1; min-width: 0; }
  .row .pct { font-size: 0.75rem; color: var(--muted); width: 3rem; text-align: right; font-family: var(--mono); }
  .row.thickness { border-top: 1px dashed var(--edge); padding-top: 0.6rem; margin-top: 0.7rem; }
  .row.thickness .name { color: var(--muted); font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; }

  .lab-stage { display: flex; gap: 1.2rem; align-items: center; }
  .lab-svg { flex: 1; height: 8rem; }
  .lab-swatch { width: 5rem; height: 6.4rem; }
  figcaption { min-height: 3em; }
  @media (max-width: 640px) {
    .row .name { width: 7.5rem; font-size: 0.85rem; }
    .lab-swatch { width: 3.6rem; height: 4.8rem; }
  }
</style>
