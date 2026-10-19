// stress.js — frozen-in stress in a cooled piece and how it looks between polarizers, for stage 06
// (the lehr). Pure functions only: no DOM. Lengths in mm, stress in MPa (positive = tension),
// temperatures in °C, retardation in nm.
//
// Glass under stress is birefringent: light polarized along the two principal stresses travels at
// slightly different speeds, and after crossing a path d the two fall out of step by a retardation
// Γ = C · (σ₁ − σ₂) · d (Brewster's law, with C the stress-optic coefficient). Between polarizers that
// retardation becomes colour, because each wavelength is a different fraction of a cycle out of step.
import { GRID } from './spectra.js';
import { chord } from './vessel.js';

// Soda-lime-silica glass. Elastic, thermal and optical figures are for float glass from Pilkington,
// "Properties of Soda-Lime Silica Float Glass", technical bulletin ATS-129 (2013). C is its
// stress-optical rule, σ(psi) = 2.18 Γ(nm) / d(in), converted: 1 / (2.18 × 0.006895 MPa × 25.4 mm)
// = 2.62 nm per mm per MPa (2.62 brewsters). The reference points are the measured averages for NBS
// standard soda-lime glass No. 710 (Napolitano and Hawkins, J. Res. NBS 68A, 439, 1964, Table 10),
// shared with the page's other stages so the temperatures agree everywhere.
export const GLASS = {
  E: 72000, // Young's modulus, MPa
  nu: 0.23, // Poisson's ratio
  alpha: 8.3e-6, // linear expansion, per °C
  k: 0.937, rho: 2500, c: 880, // conductivity W/m·K, density kg/m³, specific heat J/kg·K
  C: 2.62, // stress-optic coefficient, nm per mm of path per MPa
  strain: 504, anneal: 546, soften: 724, // reference points, °C (viscosity 10^13.5, 10^12, 10^6.6 Pa·s)
};
export const DIFFUSIVITY = (GLASS.k / (GLASS.rho * GLASS.c)) * 1e6; // mm²/s, about 0.43

// The foot of the stage 03 bowl, as a free disc.
export const FOOT = { R: 32, d: 8 };

// Model: a plate cooled at a steady rate q from both faces carries a parabolic temperature profile,
// core hotter than faces by ΔT = q d² / 8D. "Instant freezing": the glass behaves as a liquid above
// the annealing range and as an elastic solid below it, so the difference present as it passes
// through that range is locked in, and what was the hot core ends up in tension once all is cold.
export const frozenDifference = (ratePerMin, d) => ((ratePerMin / 60) * d * d) / (8 * DIFFUSIVITY);

// Residual stress through the thickness, z from the mid-plane (−d/2..d/2): the same in every
// direction in the plane of the plate. Compression at the faces is twice the tension in the core,
// and the two balance, so the plate carries no net force.
export function faceStress(z, d, dT) {
  const K = (GLASS.E * GLASS.alpha * dT) / (1 - GLASS.nu), s = (2 * z) / d;
  return K * (1 / 3 - s * s);
}
export const surfaceStress = (d, dT) => faceStress(d / 2, d, dT);
export const coreStress = (d, dT) => faceStress(0, d, dT);

// Seen face on, the profile above is invisible: it is equal in every direction in the plane, so
// σ₁ − σ₂ = 0. What shows is the in-plane pattern of a disc whose rim set before its centre.
// Model: a parabolic difference share·ΔT between centre and rim is frozen in (Timoshenko and Goodier's
// thin-disc solution, with the sign reversed for a residual stress). The centre is in equal tension
// both ways; toward the rim the hoop stress turns compressive and σθ − σr = −(EαΔT/2)(r/R)².
// share, the rim-to-centre fraction of the face-to-core difference, is a guess at shape.
export function planRetardation(r, R, d, dT, share = 1) {
  const u = r / R;
  return -GLASS.C * d * ((GLASS.E * GLASS.alpha * share * dT) / 2) * u * u;
}

// Seen through its edge, a ray at offset x from the centre and height z crosses the chord at that
// height. The in-plane pattern adds nothing there: a free disc carries no net force across any cut,
// so it integrates to zero along every full chord. What remains is the face-to-core profile.
export const edgeRetardation = (x, z, R, d, dT) => GLASS.C * chord(R, x) * faceStress(z, d, dT);

/* ---------- polariscopes (Jones calculus) ---------- */
// Light enters through a polarizer at 0°, crosses the elements in order, and leaves through an
// analyzer at 90°. Each element is a linear retarder: an axis angle and a retardation in nm.
// Retardations are taken as the same at every wavelength (no dispersion of C or of the plates).
const QUARTER = 'quarter'; // an ideal quarter-wave plate: a quarter cycle at every wavelength
const TINT = 550; // a first-order ("sensitive tint", full-wave) plate

// Field reaching the analyzer, as [re, im] pairs for x and y, for retarder elements in order.
function through(elements, lambda) {
  let ex = [1, 0], ey = [0, 0];
  for (const [theta, ret] of elements) {
    const delta = ret === QUARTER ? Math.PI / 2 : (2 * Math.PI * ret) / lambda;
    const c = Math.cos(theta), s = Math.sin(theta);
    // rotate into the element's axes, delay the slow component, rotate back
    const a = [c * ex[0] + s * ey[0], c * ex[1] + s * ey[1]], b = [-s * ex[0] + c * ey[0], -s * ex[1] + c * ey[1]];
    const cd = Math.cos(delta / 2), sd = Math.sin(delta / 2);
    const a2 = [a[0] * cd + a[1] * sd, a[1] * cd - a[0] * sd]; // × e^(−iδ/2)
    const b2 = [b[0] * cd - b[1] * sd, b[1] * cd + b[0] * sd]; // × e^(+iδ/2)
    ex = [c * a2[0] - s * b2[0], c * a2[1] - s * b2[1]];
    ey = [s * a2[0] + c * b2[0], s * a2[1] + c * b2[1]];
  }
  return [ex, ey];
}

// The viewers. A sample is a retarder with axis phi (radians from the polarizer) and retardation G.
export const VIEWERS = {
  plane: (phi, G) => [[phi, G]],
  circular: (phi, G) => [[Math.PI / 4, QUARTER], [phi, G], [-Math.PI / 4, QUARTER]],
  tint: (phi, G) => [[phi, G], [Math.PI / 4, TINT]],
};

// Fraction of the light reaching the eye at each GRID wavelength (ideal polarizers, so a field with
// no analyzer is 1 everywhere).
export function polariscope(viewer, phi, G) {
  const els = VIEWERS[viewer](phi, G);
  return GRID.map((w) => { const [, ey] = through(els, w); return ey[0] * ey[0] + ey[1] * ey[1]; });
}
