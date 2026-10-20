// forming.js — a gather on a blowpipe, for the forming lab. Pure functions only: no DOM.
// A reduced model, not a fluid solver. The gather is a hollow sphere of glass (the bubble inside it
// starts as the pipe's pocket of air), stretched into a spheroid when the pipe is swung, and cut
// into thin shells of equal mass. Each shell has its own temperature, so its own viscosity from the
// NBS 710 fit (glass.js). Three flows act on it, each the exact or textbook result for its shape:
//   blowing  — a viscous hollow sphere under internal pressure (radial flow, u = C/r²);
//   sagging  — a viscous cantilever under its own weight (Euler–Bernoulli beam, E → 3η);
//   swinging — uniaxial stretching under the weight along the pipe (Trouton, 3η).
// Heat moves between shells by conduction and leaves (or, in the glory hole, arrives) as radiation
// in three wavelength bands, each from the depth that band can see through the glass.
import F from '../data/forming.json' with { type: 'json' };
import { logEta } from './glass.js';

export const SIGMA = 5.670374e-8; // Stefan–Boltzmann, W/(m²·K⁴)
const G = 9.81, RHO = F.density.value, CP = F.heatCapacity.value, GAMMA = F.surfaceTension.value;
const SURF = F.surface.value, H_AIR = F.convection.value, T_AIR = F.air.value;
export const N = 24; // shells
const K = (t) => t + 273.15;
export const conductivity = (t) => F.conductivity.a + F.conductivity.b * t;
// Viscosity in Pa·s, capped where the fit runs to infinity (the glass is then simply rigid).
export const logEtaAt = (t) => Math.min(15, logEta(t));
export const eta = (t) => 10 ** logEtaAt(t);

// ---- radiation ----
// Fraction of a black body's power at T (K) emitted below λ (µm): the standard series in ζ = c₂/λT.
export function planckFraction(lamUm, TK) {
  const z = 14387.77 / (lamUm * TK);
  let s = 0;
  for (let n = 1; n <= 200; n++) {
    const term = (Math.exp(-n * z) / n) * (z ** 3 + (3 * z ** 2) / n + (6 * z) / n ** 2 + 6 / n ** 3);
    s += term;
    if (term < 1e-12 * s) break;
  }
  return Math.min(1, (15 / Math.PI ** 4) * s);
}
// The three bands' shares of black-body power at T (K): semi-transparent, partly opaque, opaque.
export function bandShares(TK) {
  if (TK <= 0) return [0, 0, 0];
  const f1 = planckFraction(F.absorption.band1Cut, TK), f2 = planckFraction(F.absorption.band2Cut, TK);
  return [f1, f2 - f1, 1 - f2];
}
// Exponential integrals. E₁ by its series below 1 and the Abramowitz–Stegun rational fit 5.1.56
// above (error under 5e-5); E₃(x) = ½[e^(−x)(1 − x) + x² E₁(x)] by the recurrence.
export function E1(x) {
  if (x < 1) {
    let s = -0.5772156649 - Math.log(x), term = 1;
    for (let k = 1; k < 30; k++) { term *= -x / k; s -= term / k; }
    return s;
  }
  return (Math.exp(-x) / x) * (x * x + 2.334733 * x + 0.250621) / (x * x + 3.330657 * x + 1.681534);
}
export const E3 = (x) => (x <= 0 ? 0.5 : 0.5 * (Math.exp(-x) * (1 - x) + x * x * E1(x)));
// Hemispherical emissivity of a non-scattering slab of optical thickness τ, inside the surface:
// 1 − 2E₃(τ). Thin glass is transparent in a band, so it barely emits there (Gardon 1956).
export const slabEmissivity = (tau) => 1 - 2 * E3(tau);

// ---- geometry ----
// A gather: inner radius a and outer radius b (m) of the equal-volume hollow sphere; aspect, its
// length over its width once swung; drop, the far end's offset from the pipe axis in the plane
// across the pipe ([sideways, down], m, in the shop's frame); spin, the pipe's angle (rad).
export function newGather({ radius = F.gather.radius, bore = F.gather.bore, T = 1150, kappa1 = F.absorption.band1.clear } = {}) {
  const V = (4 / 3) * Math.PI * (radius ** 3 - bore ** 3);
  return { V, a: bore, b: radius, aspect: 1, drop: [0, 0], spin: 0, T: Array(N).fill(T), kappa1, t: 0, status: null, heatIn: 0 };
}
export const outerRadius = (g, a = g.a) => Math.cbrt(a ** 3 + (3 * g.V) / (4 * Math.PI));
// Shell edges r₀ = a … r_N = b, equal mass between each pair.
export function edges(g) {
  const a3 = g.a ** 3, b3 = g.b ** 3;
  return Array.from({ length: N + 1 }, (_, j) => Math.cbrt(a3 + (j / N) * (b3 - a3)));
}
export const wall = (g) => g.b - g.a;
// Semi-axes of the spheroid for a sphere of radius r: along the pipe, and across it.
export const along = (g, r) => r * g.aspect ** (2 / 3);
export const across = (g, r) => r * g.aspect ** (-1 / 3);
// Surface area of the prolate (or oblate) spheroid over that of the equal-volume sphere.
export function areaFactor(s) {
  if (Math.abs(s - 1) < 1e-6) return 1;
  const c = s ** (2 / 3), e = s ** (-1 / 3); // semi-axes for unit volume-radius
  if (s > 1) { const ecc = Math.sqrt(1 - (e * e) / (c * c)); return (2 * e * e + (2 * e * c * Math.asin(ecc)) / ecc) / 4; }
  const ecc = Math.sqrt(1 - (c * c) / (e * e));
  return (2 * e * e + ((c * c) / ecc) * Math.log((1 + ecc) / (1 - ecc))) / 4;
}

// ---- flows ----
// Blowing. For incompressible radial flow u = C/r² through a shell whose viscosity varies with r,
// the pressure needed is Δp = ∫ 12 η(r) C / r⁴ dr: exact, whatever the temperature profile, because
// incompressibility fixes the flow. The 1/r⁴ weight means that in a thick gather the glass next to the
// bubble does nearly all the stretching, so the hot core, not the skin, sets how easily it blows; only
// once the wall is thin does every shell count alike. Surface tension on both faces pulls back by 2γ/r each.
export function blowResistance(g, r = edges(g)) {
  let R = 0;
  for (let i = 0; i < N; i++) R += 4 * eta(g.T[i]) * (r[i] ** -3 - r[i + 1] ** -3);
  return R; // Pa·s/m³: Δp = R · C, with C = a²·da/dt
}
// A blower cannot exhale faster than FLOW (assumed), so once the bubble runs away the breath, not the
// glass, sets how fast it grows.
export const FLOW = F.breath.flow * 1e-3; // m³/s
export function inflationRate(g, dp, r = edges(g)) {
  const push = dp - 2 * GAMMA * (1 / g.a + 1 / g.b);
  const rate = push / (g.a ** 2 * blowResistance(g, r)); // da/dt, m/s
  return Math.min(rate, FLOW / (4 * Math.PI * g.a ** 2));
}
// The single viscosity a uniform shell would need to resist blowing the same way.
export const blowViscosity = (g, r = edges(g)) => blowResistance(g, r) / (4 * (g.a ** -3 - g.b ** -3));

// Sagging. The part of the gather beyond the pipe's tip (taken as its far half, length along(b)) is a
// viscous cantilever: by the correspondence principle the elastic tip deflection wL⁴/8EI becomes a
// deflection rate, with E·I replaced by ∫ 3η(r) y² dA across the section. That weight is r³, the
// opposite of blowing's: the skin carries the bending, so a chilled skin holds a gather straight while
// a hot core still blows. Its weight per length w is
// the section's area times ρg, with only the component across the pipe bending it.
export function sagRate(g, tilt = 0, r = edges(g)) {
  let S = 0;
  const k = g.aspect ** (-4 / 3);
  for (let i = 0; i < N; i++) S += (3 * eta(g.T[i]) * Math.PI * (r[i + 1] ** 4 - r[i] ** 4) * k) / 4;
  const w = RHO * G * Math.cos(tilt) * Math.PI * (g.b ** 2 - g.a ** 2) * g.aspect ** (-2 / 3);
  return (w * along(g, g.b) ** 4) / (8 * S); // m/s, downward
}
// Turning the pipe at ω carries the sag round with the glass. In the shop frame d' = ω × d + v ĝ: the
// far end circles a point v/ω off to one side (not below), with radius v/ω, so it is never more than
// 2v/ω off the axis. Turning does not stop the flow; it keeps reversing it.
export const steadyDrop = (v, omega) => (omega > 0 ? v / omega : Infinity);

// Swinging. With the pipe pointed down at angle tilt, the weight along it stretches the gather
// (Trouton's extensional viscosity, 3η, with η averaged over the section). σ ≈ ρ g sin(tilt) · length.
export function stretchRate(g, tilt, r = edges(g)) {
  let num = 0;
  for (let i = 0; i < N; i++) num += eta(g.T[i]) * (r[i + 1] ** 2 - r[i] ** 2);
  const etaA = num / (g.b ** 2 - g.a ** 2), sigma = RHO * G * Math.sin(tilt) * along(g, g.b);
  return sigma / (3 * etaA); // axial strain rate, 1/s
}

// ---- heat ----
// Where each band's radiation leaves from. A slab emits into the hemisphere outside it with kernel
// 2κE₂(κd) at depth d, so shell i gets 2[E₃(κd_in) − E₃(κd_out)]; these sum to the slab's emissivity.
// The opaque band (beyond 5 µm) leaves from the outermost shell alone. Radiation the wall trades with
// itself, and the bubble's own exchange, are left out, and the sphere is treated as a slab.
export function bandWeights(kappa, r) {
  const b = r[N];
  return Array.from({ length: N }, (_, i) => 2 * (E3(kappa * (b - r[i + 1])) - E3(kappa * (b - r[i]))));
}
// Power (W) into each shell from radiation, given the surroundings at Tenv (°C).
export function radiation(g, Tenv, r = edges(g)) {
  const area = 4 * Math.PI * g.b ** 2 * areaFactor(g.aspect);
  const w1 = bandWeights(g.kappa1, r), w2 = bandWeights(F.absorption.band2, r);
  const env = K(Tenv), envShares = bandShares(env), envPow = SIGMA * env ** 4;
  return g.T.map((t, i) => {
    const TK = K(t), sh = bandShares(TK), own = SIGMA * TK ** 4;
    const wOpaque = i === N - 1 ? 1 : 0;
    const out = own * (sh[0] * w1[i] + sh[1] * w2[i] + sh[2] * wOpaque);
    const into = envPow * (envShares[0] * w1[i] + envShares[1] * w2[i] + envShares[2] * wOpaque);
    return area * SURF * (into - out);
  });
}
// Total emissivity of the wall as it is now shaped: its radiation out, were every shell at the mean
// temperature, over a black body's at that temperature. (Against the skin's temperature alone a gather
// with a hot core can exceed 1, because the transparent band brings out light from inside.)
export function totalEmissivity(g, r = edges(g)) {
  const mean = g.T.reduce((s, t) => s + t, 0) / N, flat = { ...g, T: g.T.map(() => mean) };
  const q = radiation(flat, -273.15, r).reduce((s, v) => s - v, 0);
  const area = 4 * Math.PI * g.b ** 2 * areaFactor(g.aspect);
  return q / (area * SIGMA * K(mean) ** 4);
}

// One implicit (backward-Euler) conduction step with explicit sources, across the shells.
function conduct(g, dt, Q, r) {
  const m = (RHO * g.V) / N, C = m * CP;
  const Gk = []; // conductance between shell centers i and i+1, W/K
  const rc = Array.from({ length: N }, (_, i) => Math.cbrt((r[i] ** 3 + r[i + 1] ** 3) / 2));
  for (let i = 0; i < N - 1; i++) {
    const k = conductivity((g.T[i] + g.T[i + 1]) / 2);
    Gk.push((4 * Math.PI * k * rc[i] * rc[i + 1]) / (rc[i + 1] - rc[i]));
  }
  // tridiagonal: -G_{i-1} T_{i-1} + (C/dt + G_{i-1} + G_i) T_i - G_i T_{i+1} = C/dt T_i + Q_i
  const lo = [], di = [], up = [], rhs = [];
  for (let i = 0; i < N; i++) {
    const gl = i > 0 ? Gk[i - 1] : 0, gu = i < N - 1 ? Gk[i] : 0;
    lo.push(-gl); up.push(-gu); di.push(C / dt + gl + gu); rhs.push((C / dt) * g.T[i] + Q[i]);
  }
  for (let i = 1; i < N; i++) { const f = lo[i] / di[i - 1]; di[i] -= f * up[i - 1]; rhs[i] -= f * rhs[i - 1]; }
  const T = Array(N);
  T[N - 1] = rhs[N - 1] / di[N - 1];
  for (let i = N - 2; i >= 0; i--) T[i] = (rhs[i] - up[i] * T[i + 1]) / di[i];
  g.T = T;
}

// ---- time ----
// Advance the gather by dt seconds. where: 'air' (the bench) or 'glory' (the glory hole at Tglory).
// omega: pipe speed (rad/s); tilt: pipe angle below horizontal (rad); dp: breath pressure (Pa).
export function step(g, dt, { where = 'air', Tglory = 1100, omega = 2 * Math.PI, tilt = 0, dp = 0 } = {}) {
  let left = dt;
  while (left > 1e-9 && !g.status) {
    let r = edges(g);
    const da = dp > 0 || g.a > F.gather.bore ? inflationRate(g, dp, r) : 0;
    const v = sagRate(g, tilt, r), ex = stretchRate(g, tilt, r);
    // keep each sub-step small against every rate: 2% of the bubble, 1 mm of sag, 2% of stretch
    let h = Math.min(left, 0.05, 0.02 * g.a / (Math.abs(da) + 1e-12), 1e-3 / (v + 1e-12), 0.02 / (Math.abs(ex) + 1e-12));
    if (omega > 0) h = Math.min(h, 0.2 / omega);
    h = Math.max(h, 1e-5);
    // flows
    g.a = Math.max(F.gather.bore, g.a + da * h);
    g.b = outerRadius(g);
    g.aspect = Math.min(2.5, Math.max(0.5, g.aspect * (1 + 1.5 * ex * h)));
    const c = Math.cos(omega * h), s = Math.sin(omega * h), [x, y] = g.drop;
    g.drop = [c * x - s * y, s * x + c * y + v * h];
    g.spin = (g.spin + omega * h) % (2 * Math.PI);
    // heat
    r = edges(g);
    const Q = radiation(g, where === 'glory' ? Tglory : T_AIR, r);
    if (where === 'air') Q[N - 1] -= H_AIR * 4 * Math.PI * g.b ** 2 * areaFactor(g.aspect) * (g.T[N - 1] - T_AIR);
    g.heatIn = Q.reduce((p, q) => p + q, 0);
    conduct(g, h, Q, r);
    g.t += h; left -= h;
    if (wall(g) < 3e-4) g.status = 'burst';
    else if (Math.hypot(...g.drop) > 1.5 * across(g, g.b)) g.status = 'dropped';
  }
  return g;
}

// Readings for the page: skin and inner-wall temperatures, viscosities, the sag, the bubble.
export function readings(g, tilt = 0, omega = 2 * Math.PI) {
  const r = edges(g), v = sagRate(g, tilt, r);
  return {
    skin: g.T[N - 1], inner: g.T[0], mean: g.T.reduce((s, t) => s + t, 0) / N,
    logBlow: Math.log10(blowViscosity(g, r)), logSkin: Math.min(15, logEta(g.T[N - 1])), logInner: Math.min(15, logEta(g.T[0])),
    wall: wall(g), diameter: 2 * across(g, g.b), length: 2 * along(g, g.b), drop: Math.hypot(...g.drop),
    sagRate: v, steady: steadyDrop(v, omega), emissivity: totalEmissivity(g, r), power: g.heatIn,
  };
}
