// fit.js — work backwards from a colour to a recipe. Pure functions only: no DOM.
// Given an sRGB swatch (sampled from a product photo), search Beer–Lambert mixes of the
// colorants in optics.json for the ones whose transmitted colour under daylight comes closest,
// measured by CIEDE2000. A colour is three numbers and a recipe is a whole spectrum, so many
// recipes can match one swatch (metamerism); the fitter returns the runners-up too, and the
// colour each recipe takes under a second lamp, where metamers stop agreeing.
import { GRID, toGrid, colorantDensity, transmission, spectrumColor, encode } from './spectra.js';

// Concentrations are relative to each curve as given (1 = the curve in optics.json). The upper
// bound matches what the mixing lab can express: c ≤ 1 at up to 4× wall thickness.
export const C_MIN = 0.01, C_MAX = 4;
const MAX_PARTS = 3;
// A mix "matches" a swatch within this ΔE00: about two just-noticeable differences, so a
// match would pass for the same colour side by side.
export const MATCH = 2.5;

/* ---------- colour difference ---------- */

const SRGB_TO_XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
const D65 = [0.95047, 1, 1.08883];
const mul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export const hexToLin = (hex) => [1, 3, 5].map((i) => decode(parseInt(hex.slice(i, i + 2), 16) / 255));
export const linToHex = (lin) => '#' + lin.map((c) => Math.round(255 * encode(c)).toString(16).padStart(2, '0')).join('');

// CIELAB (D65) from linear sRGB. Values outside the gamut are clipped first, so a fit is
// judged on the colour the screen can actually show.
export function linToLab(lin) {
  const xyz = mul(SRGB_TO_XYZ, lin.map((c) => Math.min(1, Math.max(0, c))));
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map((v, i) => f(v / D65[i]));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const hexToLab = (hex) => linToLab(hexToLin(hex));

// CIEDE2000 (Sharma, Wu & Dalal 2005). About 1 is a just-noticeable difference side by side.
export function deltaE00([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2) dh = hp2 - hp1 > 180 ? hp2 - hp1 - 360 : hp2 - hp1 < -180 ? hp2 - hp1 + 360 : hp2 - hp1;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);
  const Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2;
  let hm = hp1 + hp2;
  if (Cp1 * Cp2) hm = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
  const RT = -2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/* ---------- a fast forward model ---------- */

// spectrumColor() is linear in the transmission, so fold the illuminant, the observer, the
// adaptation and the sRGB matrix into one 3-vector weight per grid point, once per lamp.
function weights(spd) {
  return GRID.map((_, i) => {
    const pulse = GRID.map((__, j) => (j === i ? 1 : 0));
    return spectrumColor(pulse, spd).lin;
  });
}
function linOf(W, dens, conc) {
  const lin = [0, 0, 0];
  for (let i = 0; i < W.length; i++) {
    let d = 0;
    for (let k = 0; k < conc.length; k++) d += conc[k] * dens[k][i];
    const t = 10 ** -d, w = W[i];
    lin[0] += t * w[0]; lin[1] += t * w[1]; lin[2] += t * w[2];
  }
  return lin;
}

/* ---------- the search ---------- */

// Nelder–Mead on log-concentrations, clamped to [C_MIN, C_MAX]. Small (≤ 3 dimensions) and
// derivative-free, which suits an objective with a gamut clip in it.
function nelderMead(f, x0, { step = 1, iters = 160 } = {}) {
  const n = x0.length;
  let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))].map((x) => ({ x, v: f(x) }));
  const at = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
  for (let it = 0; it < iters; it++) {
    pts.sort((p, q) => p.v - q.v);
    if (pts[n].v - pts[0].v < 1e-4) break;
    const c = pts.slice(0, n).reduce((s, p) => s.map((v, i) => v + p.x[i] / n), new Array(n).fill(0));
    const worst = pts[n], r = at(c, worst.x, -1), fr = f(r);
    if (fr < pts[0].v) {
      const e = at(c, worst.x, -2), fe = f(e);
      pts[n] = fe < fr ? { x: e, v: fe } : { x: r, v: fr };
    } else if (fr < pts[n - 1].v) pts[n] = { x: r, v: fr };
    else {
      const k = at(c, worst.x, fr < worst.v ? -0.5 : 0.5), fk = f(k);
      if (fk < Math.min(fr, worst.v)) pts[n] = { x: k, v: fk };
      else pts = pts.map((p, i) => { if (!i) return p; const x = at(pts[0].x, p.x, 0.5); return { x, v: f(x) }; });
    }
  }
  pts.sort((p, q) => p.v - q.v);
  return pts[0];
}

function subsets(ids, max) {
  const out = [];
  const go = (start, cur) => {
    if (cur.length) out.push(cur);
    if (cur.length === max) return;
    for (let i = start; i < ids.length; i++) go(i + 1, [...cur, ids[i]]);
  };
  go(0, []);
  return out;
}

const LOG_MIN = Math.log(C_MIN), LOG_MAX = Math.log(C_MAX);
const clampLog = (x) => Math.min(LOG_MAX, Math.max(LOG_MIN, x));

// makeFitter(optics) → { fit(hex, opts), lin(parts, lamp) }.
// fit returns { target, best, alternatives, matches, tried }: target is the swatch in Lab,
// matches and tried count colorant sets, and each recipe is
// { parts: [[id, c], …], dE, lin, hex, lamp: { lin, hex } } with parts sorted by amount
// (alternatives also carry gap, their daylight ΔE from best, and split, the same under the lamp).
export function makeFitter(optics, { lamp = 'incandescent' } = {}) {
  const spdOf = (id) => toGrid(optics.wavelengths, optics.illuminants.find((x) => x.id === id).spd);
  const W = { day: weights(spdOf('daylight')), lamp: weights(spdOf(lamp)) };
  const ids = optics.colorants.map((c) => c.id);
  const DENS = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
  const lin = (parts, which = 'day') => linOf(W[which], parts.map(([id]) => DENS[id]), parts.map(([, c]) => c));
  const SETS = subsets(ids, MAX_PARTS);

  function fitSet(set, target) {
    const dens = set.map((id) => DENS[id]);
    const err = (x) => deltaE00(target, linToLab(linOf(W.day, dens, x.map((v) => Math.exp(clampLog(v))))));
    let r = nelderMead(err, set.map(() => Math.log(0.3)));
    r = nelderMead(err, r.x, { step: 0.4, iters: 80 }); // restart: Nelder–Mead can stall on a ridge
    const parts = set.map((id, k) => [id, Math.exp(clampLog(r.x[k]))]).sort((a, b) => b[1] - a[1]);
    return { parts, dE: r.v };
  }

  function finish(parts, target) {
    const day = lin(parts), lamped = lin(parts, 'lamp');
    return { parts, dE: deltaE00(target, linToLab(day)), lin: day, hex: linToHex(day), lamp: { lin: lamped, hex: linToHex(lamped) } };
  }

  // Every set of up to three colorants is fitted. The headline recipe is the simplest set that
  // matches (fewest colorants, then the closest); if nothing matches, simply the closest.
  // `matches` counts the sets that match, which is the honest measure of how little one colour
  // pins down a recipe. Alternatives are other matching sets, ranked by how far they part
  // company with the headline recipe under the second lamp.
  function fit(hex, { only } = {}) {
    const target = hexToLab(hex);
    const sets = only ? [only.filter((id) => DENS[id])] : SETS;
    // A colorant pinned at the floor is not really in the recipe: drop it, then re-score.
    const all = sets.filter((s) => s.length).map((s) => {
      const r = fitSet(s, target), kept = r.parts.filter(([, c]) => c > C_MIN * 1.5);
      return finish(kept.length ? kept : r.parts, target);
    });
    const key = (r) => r.parts.map(([id]) => id).sort().join('+');
    const unique = [];
    for (const r of all.sort((a, b) => a.dE - b.dE)) if (!unique.some((u) => key(u) === key(r))) unique.push(r);
    const ok = unique.filter((r) => r.dE <= MATCH);
    const best = ok.length ? [...ok].sort((a, b) => a.parts.length - b.parts.length || a.dE - b.dE)[0] : unique[0];
    const lampLab = linToLab(best.lamp.lin), dayLab = linToLab(best.lin);
    const alternatives = ok.filter((r) => r !== best).map((r) => ({
      ...r, gap: deltaE00(dayLab, linToLab(r.lin)), split: deltaE00(lampLab, linToLab(r.lamp.lin)),
    })).sort((a, b) => b.split - a.split);
    return { target, best, alternatives: alternatives.slice(0, 2), matches: ok.length, tried: unique.length };
  }

  return { fit, lin };
}

// The same forward model through spectra.js directly, for checking the fast path in tests.
export function referenceLin(optics, parts, illuminant = 'daylight') {
  const spd = toGrid(optics.wavelengths, optics.illuminants.find((x) => x.id === illuminant).spd);
  const T = transmission(parts.map(([id, c]) => [colorantDensity(optics.colorants.find((x) => x.id === id), optics.wavelengths), c]));
  return spectrumColor(T, spd).lin;
}
