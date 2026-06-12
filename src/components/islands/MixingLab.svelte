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

  function setC(id, value) {
    const m = melt.find((x) => x.id === id);
    if (m) m.c = value / 100;
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
      <button class="recipe" class:active={activeRecipeId === r.id} aria-pressed={activeRecipeId === r.id} onclick={() => applyRecipe(r)}>
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
    <div class="lab-swatch" role="img" style:background={swatch} aria-label="transmitted color" title="transmitted color"></div>
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
