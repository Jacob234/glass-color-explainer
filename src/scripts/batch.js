// batch.js — what each oxide in the batch does, for stage 01. Pure functions only: no DOM.
// A batch is a set of oxide amounts; from it come four properties the page already draws
// elsewhere, each from a published composition model (data/batch.json):
//   viscosity curve  Fluegel (2007) isokoms at 10^1.5, 10^6.6, 10^12 Pa·s, joined by a Fulcher curve,
//                    plus an alumina–magnesia term fitted here to SciGlass melts
//   index, Abbe      Young and Finn (1940) Gladstone–Dale refraction and specific dispersion
//   density          a room-temperature fit to SciGlass, in the same polynomial form
//   expansion        Appen's additive factors
//   iron redox       Sack et al. (1980): how the batch shifts Fe³⁺/Fe²⁺ at a fixed furnace
import data from '../data/batch.json' with { type: 'json' };

export const OXIDES = data.oxides;
const M = Object.fromEntries(OXIDES.map((o) => [o.id, o.M]));
export const IDS = OXIDES.map((o) => o.id);

// Normalize to 100, filling unknown oxides with 0.
const norm = (c) => {
  const out = Object.fromEntries(IDS.map((k) => [k, Math.max(0, c[k] ?? 0)]));
  const s = Object.values(out).reduce((a, b) => a + b, 0) || 1;
  for (const k of IDS) out[k] = (100 * out[k]) / s;
  return out;
};
export const toMol = (wt) => norm(Object.fromEntries(Object.entries(wt).map(([k, v]) => [k, v / M[k]])));
export const toWt = (mol) => norm(Object.fromEntries(Object.entries(mol).map(([k, v]) => [k, v * M[k]])));

export const PRESETS = data.presets.map((p) => {
  const mol = p.mol ? norm(p.mol) : toMol(p.wt);
  return { ...p, mol, wt: toWt(mol) };
});
export const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const BASE = PRESET.float;

// Evaluate a polynomial whose terms are written "A", "A^2", "A*B" or "A*B*C" over amounts C.
function poly(b0, terms, C) {
  let s = b0;
  for (const [k, b] of Object.entries(terms)) {
    const p = k.includes('^') ? (C[k.split('^')[0]] ?? 0) ** Number(k.split('^')[1]) : k.split('*').reduce((a, o) => a * (C[o] ?? 0), 1);
    s += b * p;
  }
  return s;
}

/* ---------- viscosity ---------- */
export const LEVELS = Object.keys(data.viscosity.isokoms).map(Number); // log10 Pa·s
// Fluegel's model as published, and the same with the SciGlass correction added (what the bench draws).
export const fluegelIsokom = (mol, level) => { const m = data.viscosity.isokoms[level.toFixed(1)]; return poly(m.b0, m.terms, mol); };
const COR = data.viscosity.correction;
export const correction = (mol, level) => poly(0, COR.terms[level.toFixed(1)], mol);
export const isokom = (mol, level) => fluegelIsokom(mol, level) + correction(mol, level);
export const isokoms = (mol) => LEVELS.map((L) => [L, isokom(mol, L)]);

// The Fulcher (VFT) curve log10 η = A + B / (T − T0) through three isokoms (°C, Pa·s).
export function fulcher(points) {
  const [[L1, T1], [L2, T2], [L3, T3]] = points;
  const target = (L1 - L2) / (L2 - L3);
  const f = (T0) => (1 / (T1 - T0) - 1 / (T2 - T0)) / (1 / (T2 - T0) - 1 / (T3 - T0)) - target;
  let lo = -2000, hi = T3 - 1e-6; // f falls from (T1−T2)/(T2−T3) − target far below to −target at T3
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const T0 = (lo + hi) / 2, B = (L2 - L3) / (1 / (T2 - T0) - 1 / (T3 - T0)), A = L3 - B / (T3 - T0);
  return { A, B, T0, logEta: (T) => (T > T0 ? A + B / (T - T0) : Infinity), tempAt: (L) => T0 + B / (L - A) };
}
export const viscosity = (mol) => fulcher(isokoms(mol));
export const fluegelViscosity = (mol) => fulcher(LEVELS.map((L) => [L, fluegelIsokom(mol, L)]));

/* ---------- density, index and dispersion ---------- */
const D = data.density;
export const density = (mol) => poly(D.b0, D.terms, mol); // g/cm³ at room temperature

const O = data.optics;
// Specific refraction (n_D − 1)/ρ and specific dispersion (n_F − n_C)/ρ, from weight fractions.
export function specific(wt) {
  let r = 0, q = 0;
  for (const k of IDS) {
    const p = (wt[k] ?? 0) / 100;
    if (!p) continue;
    r += p * O.r[k];
    const qk = k === 'B2O3' ? 0.2 * (100 + wt.B2O3) : k === 'PbO' && wt.PbO > 60 ? 0.047 * (wt.PbO - 60) ** 2 + 66 : O.q[k] ?? O.q.SiO2;
    q += p * qk * 1e-4;
  }
  return { r, q };
}
export function optics(mol) {
  const wt = toWt(mol), { r, q } = specific(wt), rho = density(mol);
  return { rho, r, q, nd: 1 + rho * r, spread: rho * q, vd: r / q };
}

/* ---------- expansion ---------- */
const E = data.expansion.factors;
export function expansion(mol) {
  const x = (k) => (mol[k] ?? 0) / 100, c = (k) => mol[k] ?? 0;
  const R2O = c('Na2O') + c('K2O');
  const fSi = c('SiO2') >= 67 ? 10.5 - 0.1 * c('SiO2') : 3.8;
  const F = c('B2O3') ? (c('Na2O') + c('K2O') + 0.7 * (c('CaO') + c('PbO')) + 0.3 * c('MgO') - c('Al2O3')) / c('B2O3') : 0;
  const fB = F <= 4 ? -1.25 * Math.max(0, F) : -5;
  const fPb = R2O < 3 ? 13 : 11.5 + 0.5 * R2O;
  const fK = c('Na2O') > 1 ? E.K2O : 42;
  return x('SiO2') * fSi + x('Na2O') * E.Na2O + x('K2O') * fK + x('CaO') * E.CaO + x('MgO') * E.MgO
    + x('Al2O3') * E.Al2O3 + x('Fe2O3') * E.Fe2O3 + x('B2O3') * fB + x('PbO') * fPb; // ppm/K
}

/* ---------- iron ---------- */
const I = data.iron;
// Σ d·X over mole fractions, with the oxides the model lacks counted as silica.
const ironSum = (mol) => {
  let s = 0;
  for (const k of IDS) {
    const d = I.d[k] ?? (I.asSilica.includes(k) ? I.d.SiO2 : 0);
    s += d * (mol[k] ?? 0) / 100;
  }
  return s;
};
// Share of the iron that is Fe²⁺ in this batch, melted in the furnace that leaves float glass at
// I.floatFerrous. Fe³⁺/Fe²⁺ = 2 X_Fe2O3 / X_FeO, so the shift in ln(X_Fe2O3/X_FeO) is the shift in ln(Fe³⁺/Fe²⁺).
export function ferrous(mol, baseFerrous = I.floatFerrous) {
  const ratio0 = (1 - baseFerrous) / baseFerrous;
  const ratio = ratio0 * Math.exp(ironSum(mol) - ironSum(BASE.mol));
  return 1 / (1 + ratio);
}

/* ---------- the whole batch ---------- */
export function properties(mol) {
  const v = viscosity(mol), working = v.tempAt(3), softening = v.tempAt(6.6);
  return {
    viscosity: v,
    melting: v.tempAt(1), working, softening, annealing: v.tempAt(12),
    range: working - softening, // the working range: how long the gather stays workable as it cools ("long" or "short")
    ...optics(mol),
    alpha: expansion(mol),
    ferrous: ferrous(mol),
  };
}

// A batch from weight percents of everything but silica; silica is the balance.
export function fromWt(others) {
  const wt = { ...others };
  wt.SiO2 = Math.max(0, 100 - Object.entries(others).filter(([k]) => k !== 'SiO2').reduce((a, [, v]) => a + v, 0));
  return toMol(wt);
}
