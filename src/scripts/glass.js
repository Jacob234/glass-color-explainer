// glass.js — what glass is, for stage 00. Pure functions only: no DOM.
// Viscosity: the Fulcher fit to NBS Standard Glass No. 710 (data/viscosity.json).
// Glass transition: Maxwell relaxation τ = η / G∞ on that fit, falling out of equilibrium
// where the melt can no longer relax as fast as it is cooled.
// Network: a 2D continuous random network, triangles standing in for SiO₄ tetrahedra.
import vis from '../data/viscosity.json' with { type: 'json' };

const { A, B, T0, fitMin, fitMax } = vis.fulcher;
export const T_DIVERGE = T0;
export const FIT = [fitMin, fitMax];
export const G_INF = vis.maxwell.Ginf;

// log10 viscosity in Pa·s at T (°C). The fit is in poise; 1 Pa·s = 10 P. Infinite at and below T0.
export const logEta = (T) => (T > T0 ? A - 1 + B / (T - T0) : Infinity);
// Temperature (°C) at which the fit reaches log10 η (Pa·s).
export const tempAt = (logPas) => T0 + B / (logPas + 1 - A);
export const inFit = (T) => T >= fitMin && T <= fitMax;

// Maxwell relaxation time (s): how long the melt takes to forget a stress or a change of shape.
export const tau = (T) => 10 ** logEta(T) / G_INF;

// The glass transition for a cooling rate q (K/s). The melt keeps up with cooling while it can
// relax within the time it takes to cool through the interval over which τ changes e-fold:
// q · τ · |d ln τ / dT| = 1. Below that temperature the structure is frozen in.
export function glassTransition(q) {
  const dlnTau = (T) => (Math.LN10 * B) / (T - T0) ** 2;
  const f = (T) => Math.log10(q * tau(T) * dlnTau(T)); // decreases with T
  let lo = T0 + 1, hi = 1600;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const T = (lo + hi) / 2;
  return { T, logEta: logEta(T), tau: tau(T) };
}

// Time (s) for a gather of radius R (m) to sag about its own radius under gravity: η / (ρ g R).
// Order of magnitude only; real sag depends on shape, and blowers keep turning the pipe.
export const RHO = 2500;
export const sagTime = (T, R = 0.05) => 10 ** logEta(T) / (RHO * 9.81 * R);

// Composition: weight percent to mole fractions, and non-bridging oxygens per tetrahedron.
// Every Na₂O, K₂O, CaO or MgO brings one oxygen that breaks one Si–O–Si bridge into two
// non-bridging oxygens (NBO), so NBO/T = 2 · (modifier moles) / (SiO₂ moles). Al₂O₃ and minor
// oxides are ignored.
const MW = { SiO2: 60.08, Na2O: 61.98, K2O: 94.2, CaO: 56.08, MgO: 40.3 };
export const MODIFIERS = ['Na2O', 'K2O', 'CaO', 'MgO'];
export function moles(wt) {
  const n = Object.fromEntries(Object.keys(MW).filter((k) => wt[k]).map((k) => [k, wt[k] / MW[k]]));
  const sum = Object.values(n).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v / sum]));
}
export const nboPerT = (x) => (2 * x) / (1 - x); // x: mole fraction of modifier oxide, rest SiO₂
export function modifierFraction(wt) {
  const m = moles(wt);
  return MODIFIERS.reduce((a, k) => a + (m[k] ?? 0), 0);
}
export const STANDARD = vis.compositionWt;

// ---- the network ----
// A seeded generator so the drawing is the same on every load.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A honeycomb of Si atoms (the 2D crystal: every Si bonded to three others through an oxygen),
// nx × ny nodes in brick-wall indexing, bond length 1.
export function honeycomb(nx, ny) {
  const nodes = [], id = (i, j) => j * nx + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) nodes.push({ x: (i * Math.sqrt(3)) / 2, y: j * 1.5 + ((i + j) % 2 ? 0.5 : 0) });
  const bonds = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i + 1 < nx) bonds.push([id(i, j), id(i + 1, j)]);
    if ((i + j) % 2 === 1 && j + 1 < ny) bonds.push([id(i, j), id(i, j + 1)]);
  }
  return { nodes, bonds };
}

const neighbors = (net) => {
  const nb = net.nodes.map(() => []);
  for (const [a, b] of net.bonds) { nb[a].push(b); nb[b].push(a); }
  return nb;
};

// Disorder it the way Wooten, Winer and Weaire built amorphous silicon (1985): Stone–Wales bond
// switches, each turning four rings by ±1 (two shrink, two grow) while every atom keeps three
// neighbors, with the positions relaxed by springs as it goes. A switch that would leave a ring
// smaller than five is undone. WWW accept or reject each switch by its strain energy; here the
// order is random and the only test is ring size, so this is a sketch of their method.
export function disorder(net, { fraction = 1, seed = 7, relax = 800 } = {}) {
  const nodes = net.nodes.map((p) => ({ ...p })), bonds = net.bonds.map((b) => [...b]);
  const out = { nodes, bonds };
  const rand = rng(seed);
  let nb = neighbors(out);
  const near = (starts, d) => { // nodes within graph distance d
    let front = [...starts]; const seen = new Set(front);
    for (let k = 0; k < d; k++) { const next = []; for (const n of front) for (const m of nb[n]) if (!seen.has(m)) { seen.add(m); next.push(m); } front = next; }
    return seen;
  };
  const target = Math.round((fraction * bonds.length) / 6);
  let done = 0;
  for (let tries = 0; tries < bonds.length * 6 && done < target; tries++) {
    const bi = Math.floor(rand() * bonds.length), [a, b] = bonds[bi];
    const zone = near([a, b], 3);
    if ([...zone].some((n) => nb[n].length !== 3)) continue; // keep clear of the patch edge
    const P = nodes[a], Q = nodes[b];
    const side = (n) => (Q.x - P.x) * (nodes[n].y - P.y) - (Q.y - P.y) * (nodes[n].x - P.x);
    const a1 = nb[a].find((n) => n !== b && side(n) > 0), b2 = nb[b].find((n) => n !== a && side(n) < 0);
    if (a1 == null || b2 == null) continue;
    const i1 = bonds.findIndex(([u, v]) => (u === a && v === a1) || (u === a1 && v === a));
    const i2 = bonds.findIndex(([u, v]) => (u === b && v === b2) || (u === b2 && v === b));
    const saved = [bonds[i1], bonds[i2], { ...P }, { ...Q }];
    bonds[i1] = [b, a1]; bonds[i2] = [a, b2]; // a–a1 and b–b2 become b–a1 and a–b2
    const mx = (P.x + Q.x) / 2, my = (P.y + Q.y) / 2; // turn the bond a quarter turn to start close
    for (const p of [P, Q]) { const dx = p.x - mx, dy = p.y - my; p.x = mx - dy; p.y = my + dx; }
    nb = neighbors(out);
    const local = near([a, b], 2), rings = ringSizes(out, 9, (u, v) => local.has(u) && local.has(v));
    if (rings.some((r) => r != null && r < 5)) {
      [bonds[i1], bonds[i2]] = saved; Object.assign(P, saved[2]); Object.assign(Q, saved[3]);
      nb = neighbors(out); continue;
    }
    if (++done % 4 === 0) relaxNet(out, 30);
  }
  relaxNet(out, relax);
  out.switches = done;
  return out;
}

// Springs: bonds to length 1, second neighbors to √3 (the 120° of an ideal triangle network).
export function relaxNet(net, steps = 400) {
  const nb = neighbors(net), { nodes } = net, pairs = [];
  for (const [a, b] of net.bonds) pairs.push([a, b, 1, 1]);
  nodes.forEach((_, c) => { const n = nb[c]; for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) pairs.push([n[i], n[j], Math.sqrt(3), 0.8]); });
  for (let s = 0; s < steps; s++) {
    const f = nodes.map(() => [0, 0]);
    for (const [a, b, L, k] of pairs) {
      const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y, d = Math.hypot(dx, dy) || 1e-9, e = (k * (d - L)) / d;
      f[a][0] += e * dx; f[a][1] += e * dy; f[b][0] -= e * dx; f[b][1] -= e * dy;
    }
    nodes.forEach((p, i) => { p.x += 0.12 * f[i][0]; p.y += 0.12 * f[i][1]; });
  }
  return net;
}

// Rings: the smallest ring through each bond, by breadth-first search with that bond removed.
// Used by the tests and the readout; edge bonds that close no ring inside the patch give null.
export function ringSizes(net, maxLen = 10, only = null) {
  const nb = neighbors(net);
  return net.bonds.map(([a, b]) => {
    if (only && !only(a, b)) return null;
    const dist = new Map([[a, 0]]); let front = [a];
    while (front.length) {
      const next = [];
      for (const n of front) for (const m of nb[n]) {
        if ((n === a && m === b) || (n === b && m === a) || dist.has(m)) continue;
        dist.set(m, dist.get(n) + 1); next.push(m);
      }
      if (dist.has(b)) return dist.get(b) + 1;
      if (dist.get(front[0]) + 1 >= maxLen) return null;
      front = next;
    }
    return null;
  });
}
