// fragility.js — long and short glasses, for stage 02′. Pure functions only: no DOM.
// A viscosity curve here is MYEGA (Mauro et al. 2009), with T in K and η in Pa·s:
//   log10 η = A + (12 − A) (Tg/T) exp[(m/(12 − A) − 1)(Tg/T − 1)]
// A is log10 η∞, the high-temperature limit; Tg is where η = 10^12 Pa·s; m, the fragility, is the
// slope d log10 η / d(Tg/T) at Tg. The parameters come precomputed from ViscNet
// (public/data/viscnet.json) or from fits to SciGlass melts (public/data/sciglass/fragility.json).

export const K = 273.15;
// Zheng et al. (2011): silicate liquids share log10 η∞ ≈ −2.93 Pa·s.
export const A_UNIVERSAL = -2.93;
export const WORKING = 3, SOFTENING = 6.6; // log10 Pa·s, the bench's working and softening points

// log10 η at x = Tg/T, the Angell plot's own axis.
export const angell = (x, { A, m }) => A + (12 - A) * x * Math.exp((m / (12 - A) - 1) * (x - 1));
// log10 η at T °C.
export const logEta = (T, p) => angell((p.Tg + K) / (T + K), p);
// The steepest a MYEGA curve can be at its low end is a straight line in Tg/T: an Arrhenius liquid,
// m = 12 − A. Nothing is less fragile than that under this equation.
export const strongest = (A = A_UNIVERSAL) => 12 - A;

// x = Tg/T where the curve reaches log10 η = L. log10 η rises with x, so bisect on x.
export function xAt(L, p) {
  let lo = 1e-6, hi = 1.5;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (angell(mid, p) < L) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
export const tempAt = (L, p) => (p.Tg + K) / xAt(L, p) - K;
// °C between the working point (10^3 Pa·s) and the softening point (10^6.6 Pa·s): how long a gather
// stays workable as it cools, in the bench's terms.
export const workingRange = (p) => tempAt(WORKING, p) - tempAt(SOFTENING, p);

// Fragility of a Fulcher curve log10 η = A + B/(T − T0) (°C) at its own Tg: m = B Tg / (Tg − T0)², Tg in K.
export function fulcherFragility(v) {
  const Tg = v.tempAt(12);
  return { Tg, m: (v.B * (Tg + K)) / (Tg - v.T0) ** 2 };
}

// ViscNet rows are stored as arrays; give them names.
export const params = ([m, Tg, A, lo, hi]) => ({ m, Tg, A, band: [lo, hi] });
export const fitParams = (g) => ({ m: g.fit.m, Tg: g.fit.Tg, A: g.fit.logEtaInf });

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

// Each measured melt's ViscNet m against its fitted m: the pairs, the median miss in m and its sign,
// and the median miss of ViscNet's curve at the measured points, in decades of viscosity.
export function compare(frag, net) {
  const pairs = frag.glasses.filter((g) => net.melts[g.id]).map((g) => ({ g, fit: g.fit.m, net: net.melts[g.id][0] }));
  const curve = pairs.flatMap(({ g }) => { const p = params(net.melts[g.id]); return g.visc.map(([L, T]) => Math.abs(logEta(T, p) - L)); });
  return { pairs, medianMiss: median(pairs.map((p) => Math.abs(p.net - p.fit))), bias: median(pairs.map((p) => p.net - p.fit)), curveMiss: median(curve) };
}
