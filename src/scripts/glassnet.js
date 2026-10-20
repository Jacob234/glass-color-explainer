// glassnet.js — GlassNet's second opinion on the stage 01 bench. Pure functions only: no DOM.
// GlassNet (Cassar 2023) is a neural network trained on SciGlass. It is GPL software and does not
// run here: tools/glassnet/glassnet.py runs it in a GitHub Action and writes public/data/glassnet.json,
// which the page fetches. That file holds GlassNet at each preset and along each slider from each
// preset. For a batch the page starts from the nearest preset and adds each moved slider's change
// along its own sweep: exact for one slider, an approximation for several (`additivity` in the file
// says how far it strays from GlassNet itself).
import { PRESETS } from './batch.js';

export const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // log10 η [Pa·s] of GlassNet's isokoms

// The slider settings of each preset, rounded as the bench rounds them.
const round = (x) => Math.round(x * 10) / 10;
export const presetWt = (data, p) => Object.fromEntries(Object.keys(data.sliders).map((k) => [k, round(p.wt[k] ?? 0)]));

// The preset a batch is read from: `from` (the preset the reader last picked) when given, otherwise
// the one whose slider settings are nearest (sum of |Δ wt%|).
export function anchor(data, wt, from) {
  let best = null, dist = Infinity;
  for (const p of PRESETS) {
    if (!data.named[p.id] || (from && data.named[from] && p.id !== from)) continue;
    const base = presetWt(data, p), d = Object.keys(data.sliders).reduce((s, k) => s + Math.abs((wt[k] ?? 0) - base[k]), 0);
    if (d < dist) { best = p.id; dist = d; }
  }
  return { id: best, moved: Object.keys(data.sliders).filter((k) => Math.abs((wt[k] ?? 0) - presetWt(data, PRESETS.find((p) => p.id === best))[k]) > 1e-9) };
}

// Linear interpolation along one sweep (values at `steps` even points from 0 to max; the list may stop
// short where silica would fall below its floor, in which case the last value is held).
function along(ys, max, steps, x) {
  const h = max / (steps - 1), i = Math.max(0, Math.min(ys.length - 1, x / h));
  const lo = Math.floor(i), hi = Math.min(lo + 1, ys.length - 1);
  return ys[lo] + (ys[hi] - ys[lo]) * (i - lo);
}

// Every property at a batch given by its slider settings (wt%, silica the balance), read from `from`.
export function predict(data, wt, from) {
  const a = anchor(data, wt, from), base = presetWt(data, PRESETS.find((p) => p.id === a.id)), p = { ...data.named[a.id] };
  for (const k of a.moved) {
    const sw = data.sweeps[a.id][k];
    for (const key of Object.keys(p)) p[key] += along(sw[key], data.sliders[k], data.steps, wt[k]) - along(sw[key], data.sliders[k], data.steps, base[k]);
  }
  // GlassNet predicts each isokom separately, so nothing forces them into order; keep the curve monotone.
  // Clamp from the glassy end up: the runniest isokom, T0 (log η = 0, wetter than any melt is worked),
  // is the least reliable and sits below T1 for the lead and borosilicate presets.
  const T = LEVELS.map((n) => p[`T${n}`]);
  for (let i = T.length - 2; i >= 0; i--) T[i] = Math.max(T[i], T[i + 1]);
  return { ...p, isokoms: LEVELS.map((n, i) => [n, T[i]]), anchor: a.id, moved: a.moved, viscosity: curve(T) };
}

// A viscosity curve through the isokoms, straight between them in log η against T.
export function curve(T) {
  const tempAt = (L) => {
    const i = Math.max(0, Math.min(T.length - 2, Math.floor(L)));
    return T[i] + (T[i + 1] - T[i]) * (L - i);
  };
  const logEta = (t) => {
    for (let i = 0; i < T.length - 1; i++) if (t <= T[i] && t >= T[i + 1]) return i + (T[i] - t) / (T[i] - T[i + 1] || 1);
    return t > T[0] ? 0 - (t - T[0]) / (T[0] - T[1]) : 12 + (T[12] - t) / (T[11] - T[12]);
  };
  return { tempAt, logEta };
}

// The devitrification margin: how far above its liquidus a melt is when it is worked (log η = 3).
// Positive means the gather is worked hotter than any crystal can survive; negative means crystals can
// grow while it is being worked.
export const margin = (working, liquidus) => working - liquidus;

// GlassNet's median liquidus miss against SciGlass, °C (scripts/score_glassnet.mjs: 48 °C over 4,506 melts,
// 48 on the 724 it did not train on). Margins smaller than this are within the model's error.
export const LIQUIDUS_MISS = 48;

// Median |GlassNet − measured| and median |bench model − measured| over SciGlass melts, by property,
// from public/data/sciglass/bench.json and glassnet.json. `models` gives the bench's own model for a
// glass: { tempAt(L), nd }. `only` keeps melts by GlassNet split ('t', 'h', 'n').
export function score(sg, gn, models, { only, filter = () => true } = {}) {
  const out = { visc: [[], []], liq: [], nd: [[], []] };
  for (const g of sg.glasses) {
    const r = gn.melts[g.id];
    if (!r || (only && !only.includes(r[0])) || !filter(g)) continue;
    const mine = models(g);
    (g.visc ?? []).forEach(([L, T], i) => {
      if (r[1]?.[i] == null) return;
      out.visc[0].push(Math.abs(r[1][i] - T)); out.visc[1].push(Math.abs(mine.tempAt(L) - T));
    });
    if (g.liq != null && r[2] != null) out.liq.push(r[2] - g.liq);
    if (g.nd != null && r[3] != null) { out.nd[0].push(Math.abs(r[3] - g.nd)); out.nd[1].push(Math.abs(mine.nd - g.nd)); }
  }
  const med = (a) => { const s = a.filter(Number.isFinite).sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  return {
    visc: { n: out.visc[0].length, glassnet: med(out.visc[0]), bench: med(out.visc[1]) },
    liq: { n: out.liq.length, glassnet: med(out.liq.map(Math.abs)), bias: med(out.liq) },
    nd: { n: out.nd[0].length, glassnet: med(out.nd[0]), bench: med(out.nd[1]) },
  };
}
