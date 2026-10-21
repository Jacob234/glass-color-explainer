// qn.js — network structure from composition: the Qⁿ distribution, the share of silicons with n of
// their four oxygens bridging to another network former. Pure functions only: no DOM.
// Each oxygen a modifier brings cuts one bridge into two non-bridging oxygens (NBO). Which silicon
// it cuts is the question, and three answers are drawn:
//   random      every bridge is equally likely to go: Qⁿ is binomial in NBO/4 per silicon
//   binary      Q⁴ all become Q³ before any Q³ becomes Q², and so on
//   statistical Mauro's (2013) model as fitted by Bødker et al. (2019): the modifier picks species i
//   mechanics   with a weight (share of i) · exp(−H_i / R T_f), so a high enthalpy H holds a species
//               back and a hot, fast-frozen glass is more random. Mixed modifiers average their
//               draws by amount (Bødker et al. 2022, eq 3). Data in data/qn.json.
import data from '../data/qn.json' with { type: 'json' };
import * as b from './batch.js';

const R = 0.008314; // kJ/(mol·K)
export const H = data.enthalpies;
export const NMR = data.nmr;
export const SPECIES = ['Q⁴', 'Q³', 'Q²', 'Q¹', 'Q⁰'];

// Qⁿ for q non-bridging oxygens per silicon, as [Q⁴, Q³, Q², Q¹, Q⁰] fractions.
// mix: share of the modifier by enthalpy set, e.g. { Na: 0.7, K: 0.3 }. Tf in kelvin.
export const speciate = (q, mix, Tf, step = data.step) => trajectory(q, mix, Tf, Infinity, step).at(-1).Q;

// The same, recording { x: NBO per silicon, Q } every `every` along the way to qMax (and at qMax).
export function trajectory(qMax, mix, Tf, every = 0.05, step = data.step) {
  let Q = [1, 0, 0, 0, 0], done = 0, next = every;
  const rows = [{ x: 0, Q }], end = Math.min(4, Math.max(0, qMax));
  const sets = Object.entries(mix).filter(([, a]) => a > 0).map(([m, a]) => [a, H[m].map((h) => Math.exp(-h / (R * Tf)))]);
  while (end - done > 1e-12) {
    const d = Math.min(step, end - done), p = [0, 0, 0, 0];
    for (const [a, w] of sets) {
      const s = w.reduce((t, wi, i) => t + Q[i] * wi, 0);
      if (s > 0) for (let i = 0; i < 4; i++) p[i] += (a * Q[i] * w[i]) / s;
    }
    const n = Q.slice();
    for (let i = 0; i < 4; i++) { const moved = Math.min(n[i], p[i] * d); n[i] -= moved; n[i + 1] += moved; }
    Q = n; done += d;
    if (done >= next - 1e-9 || end - done <= 1e-12) { rows.push({ x: done, Q }); while (next <= done + 1e-9) next += every; }
  }
  return rows;
}

export function random(q) {
  const p = Math.min(1, Math.max(0, q) / 4), c = [1, 4, 6, 4, 1];
  return [4, 3, 2, 1, 0].map((n, i) => c[i] * (1 - p) ** n * p ** (4 - n));
}

export function binary(q) {
  const x = Math.min(4, Math.max(0, q)), k = Math.min(3, Math.floor(x)), f = x - k, Q = [0, 0, 0, 0, 0];
  Q[k] = 1 - f; Q[k + 1] += f;
  return Q;
}

// Mean bridging oxygens per silicon, Σ n·Qⁿ.
export const bridges = (Q) => Q.reduce((s, v, i) => s + (4 - i) * v, 0);

// Where a batch's modifiers go (mol%). Alumina first: each Al₂O₃ takes one modifier oxide to charge-
// balance its two AlO₄ tetrahedra, alkali before alkaline earth. Boron next, up to Dell and Bray's
// R = 0.5 + K/16 per B₂O₃. What is left breaks the silicate network: NBO/Si = 2·(left)/SiO₂.
export function network(mol, Tf) {
  const c = (k) => mol[k] ?? 0;
  const alk = { Na2O: c('Na2O'), K2O: c('K2O') }, ae = { CaO: c('CaO'), MgO: c('MgO'), PbO: c('PbO') };
  const sum = (o) => Object.values(o).reduce((a, v) => a + v, 0);
  // take t from a group of oxides in proportion to their amounts
  const take = (g, t) => { const s = sum(g), f = s > 0 ? Math.max(0, 1 - t / s) : 0; for (const k in g) g[k] *= f; return Math.min(t, s); };
  const takeBoth = (t) => { const a = take(alk, t); return a + take(ae, t - a); };
  const toAl = takeBoth(c('Al2O3'));
  const B = c('B2O3'), K = B > 0 ? c('SiO2') / B : Infinity, Rmax = 0.5 + K / 16;
  const toB = B > 0 ? takeBoth(Rmax * B) : 0;
  const left = sum(alk) + sum(ae), si = c('SiO2');
  const q = si > 0 ? Math.min(4, (2 * left) / si) : 0;
  const assumed = left > 0 ? sum(ae) / left : 0;
  const mix = left > 0 ? { Na: (alk.Na2O + sum(ae)) / left, K: alk.K2O / left } : { Na: 1 };
  const Q = speciate(q, mix, Tf);
  return { q, Q, mix, assumed, Tf, toAl, toB, N4: B > 0 ? toB / B : null, Rmax: B > 0 ? Rmax : null, bridges: bridges(Q) };
}

// A batch's network at its own fictive temperature, taken as the bench's annealing point (10¹² Pa·s).
export const batchNetwork = (mol) => network(mol, b.isokom(mol, 12) + 273.15);

// Binary M₂O–SiO₂ glasses from 0 to xMax mol%, each at the bench's own Tg for that glass.
export function binarySeries(oxide, xMax = 60, dx = 0.5) {
  const m = oxide === 'K2O' ? 'K' : 'Na', out = [];
  for (let x = 0; x <= xMax + 1e-9; x += dx) {
    const mol = { SiO2: 100 - x, [oxide]: x }, q = (2 * x) / (100 - x), Tf = b.isokom(mol, 12) + 273.15;
    out.push({ x, q, Tf, sm: speciate(q, { [m]: 1 }, Tf), random: random(q), binary: binary(q) });
  }
  return out;
}

// Root-mean-square miss, in percentage points, of a model against the NMR rows for one oxide.
export function nmrMiss(oxide, model = 'sm') {
  const m = oxide === 'K2O' ? 'K' : 'Na';
  let se = 0, n = 0;
  for (const [x, ...pct] of NMR[oxide]) {
    const mol = { SiO2: 100 - x, [oxide]: x }, q = (2 * x) / (100 - x);
    const Q = model === 'random' ? random(q) : model === 'binary' ? binary(q) : speciate(q, { [m]: 1 }, b.isokom(mol, 12) + 273.15);
    for (let i = 0; i < 5; i++) { se += (100 * Q[i] - pct[i]) ** 2; n++; }
  }
  return Math.sqrt(se / n);
}
