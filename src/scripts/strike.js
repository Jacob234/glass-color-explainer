// strike.js — what a reheat does to a glass's color, computed from particle size.
// Pure functions only: no DOM. Metal colloids go through mie.js (Mie theory on measured optical
// constants); semiconductor crystals through a band gap that widens as the crystal shrinks.
//
// The striking schedule is a model, not a measurement. A slider position t (0..1) stands for time in
// the reheat on a stretched scale: nothing happens at first (dissolved atoms absorb almost nothing),
// then particles nucleate and grow until all the metal is in them (t ≈ 0.5, radius ~8 nm), then they
// coarsen: big particles grow at the expense of small ones (Ostwald ripening), so the metal stays in
// particles but they get fewer and larger. The radii are chosen to span what Mie theory distinguishes,
// not taken from a study of a particular glass.
import { GRID } from './spectra.js';
import { colloid, slab, volumeFraction } from './mie.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const SCHEDULE = { r0: 2, rStruck: 8, rOver: 50, sigma: 1.3 };

// Median particle radius (nm) and the share of the metal that has come out into particles.
export function particles(t, s = SCHEDULE) {
  const grow = smooth(0.08, 0.55, t), coarsen = smooth(0.55, 1, t);
  const r = coarsen > 0 ? s.rStruck * (s.rOver / s.rStruck) ** coarsen : s.r0 + (s.rStruck - s.r0) * grow;
  return { r, p: smooth(0.08, 0.5, t) };
}

// How much metal and how thick a piece. Amounts are assumptions chosen so the struck color lands
// where these glasses do; published recipes vary, and a share of the metal often stays dissolved.
// Silver stain is a surface layer: 150 ppm through 1 mm is the same metal as a 50 µm layer at 0.3 wt%.
export const RECIPES = {
  Au: { label: 'gold', ppm: 200, mm: 2 }, // 200 ppm as in Haslbeck et al. 2005
  Ag: { label: 'silver', ppm: 150, mm: 1 },
  Cu: { label: 'copper', ppm: 150, mm: 2 },
};

// Mie sums are the slow part; cache them by metal and radius (to 0.1 nm).
const cache = new Map();
function coefficients(id, r, sigma) {
  const key = `${id}:${r.toFixed(1)}:${sigma}`;
  if (!cache.has(key)) cache.set(key, colloid(id, GRID, { r: Number(r.toFixed(1)), sigma }));
  return cache.get(key);
}

// A struck glass at schedule position t: transmission T and front-lit scatter R on GRID, plus the
// particle radius, the share of metal in particles, the wavelength of strongest extinction and the
// share of extinction there that is scattering rather than absorption (peak is null when there is no band).
export function struck(id, t, recipe = RECIPES[id], s = SCHEDULE) {
  const { r, p } = particles(t, s), c = coefficients(id, r, s.sigma);
  const { T, R } = slab(c, volumeFraction(id, recipe.ppm) * p, recipe.mm);
  // The plasmon band: the highest interior maximum of extinction. Small copper spheres have none,
  // because surface damping and copper's own interband absorption of the blue swamp the resonance.
  let k = -1;
  for (let i = 1; i < c.length - 1; i++) if (c[i].ext >= c[i - 1].ext && c[i].ext > c[i + 1].ext && (k < 0 || c[i].ext > c[k].ext)) k = i;
  if (k < 0) k = c.reduce((b, v, i) => (v.ext > c[b].ext ? i : b), 0);
  return { T, R, r, p, peak: k > 0 && k < c.length - 1 ? GRID[k] : null, scatter: c[k].sca / c[k].ext };
}

// Words for where the schedule is.
export const phase = (t) => (t < 0.12 ? 'unstruck' : t < 0.5 ? 'striking' : t < 0.68 ? 'struck' : 'over-struck');

// The Lycurgus Cup: silver-gold alloy particles 50–100 nm across, about 300 ppm silver and 40 ppm
// gold in the glass (Freestone et al. 2007), modeled as 70:30 alloy spheres with Rioux et al.'s
// optical constants. How much of the metal sits in particles, and the wall thickness, are not
// reported there; share and mm are assumptions.
export const LYCURGUS = { id: 'Au30Ag70', ppm: 340, share: 0.06, r: 30, sigma: 1.3, mm: 5 };
export function lycurgus(mm = LYCURGUS.mm, L = LYCURGUS) {
  const c = coefficients(L.id, L.r, L.sigma);
  return slab(c, volumeFraction(L.id, L.ppm) * L.share, mm);
}

// Selenium ruby: CdS–CdSe crystals absorb every photon above their band gap. In a crystal a few nm
// across the electron and hole are squeezed, which raises the gap (Brus 1984, effective-mass model):
//   E(r) = E_bulk + (ħ²π² / 2r²)(1/m_e + 1/m_h) − 1.786 e² / (4πε₀ ε r).
// Masses and ε are CdSe's (textbook values, unverified); the bulk gap 1.95 eV stands for a
// selenium-rich sulfoselenide whose edge gives signal red. The formula overstates the shift for
// the smallest crystals and is only a guide.
export const BRUS = { bulk: 1.95, me: 0.13, mh: 0.45, eps: 9.5, r0: 1.4, r1: 9 };
const HB2M = 0.0380998; // ħ²/2m₀ in eV·nm²
export const brusGap = (r, b = BRUS) =>
  b.bulk + ((HB2M * Math.PI ** 2) / r ** 2) * (1 / b.me + 1 / b.mh) - (1.786 * 1.439964) / (b.eps * r);
export const crystalRadius = (t, b = BRUS) => b.r0 * (b.r1 / b.r0) ** smooth(0.05, 0.9, t);
