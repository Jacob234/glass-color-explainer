// mie.js — light and small metal spheres in glass: Mie theory from measured optical constants.
// Pure functions only: no DOM. A sphere of radius r and complex refractive index N = n + ik sits in
// glass of index nMed. Mie's 1908 solution expands the scattered field in vector spherical harmonics;
// the coefficients a_n, b_n give the efficiencies Q = cross-section / πr² for extinction, scattering
// and backscatter. The series follows Bohren & Huffman's BHMIE (1983, appendix A): logarithmic
// derivative D_n by downward recurrence, Riccati–Bessel functions by upward recurrence.
//
// Small particles: bulk n, k (Johnson & Christy 1972) assume electrons that rarely hit a wall. In a
// particle a few nm across they hit its surface, so the free-electron (Drude) part of the dielectric
// function is re-damped with γ(r) = γ_bulk + A·v_F / r (Kreibig & Vollmer 1995). A = 1 here; reported
// values run from about 0.1 to 2 depending on the matrix, so the width of small-particle bands is
// the least certain part of the model.
import data from '../data/metals.json' with { type: 'json' };

export const METALS = data.metals;
const HBAR = 0.6582119569; // eV·fs
const EV_NM = 1239.84193; // photon energy (eV) × wavelength (nm)

// Complex numbers as [re, im].
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const scale = (a, s) => [a[0] * s, a[1] * s];
const abs2 = (a) => a[0] * a[0] + a[1] * a[1];
const conj = (a) => [a[0], -a[1]];
function csqrt(z) { // principal root, imaginary part ≥ 0 for an absorbing medium
  const r = Math.hypot(z[0], z[1]), re = Math.sqrt((r + z[0]) / 2), im = Math.sqrt(Math.max(0, (r - z[0]) / 2));
  return [re, z[1] < 0 ? -im : im];
}

// Linear interpolation of a metal's tabulated n and k at wavelength nm.
function nk(metal, nm) {
  const { nm: xs, n, k } = metal;
  let i = 1;
  while (i < xs.length - 1 && xs[i] < nm) i++;
  const f = (nm - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return [n[i - 1] + f * (n[i] - n[i - 1]), k[i - 1] + f * (k[i] - k[i - 1])];
}

// Dielectric function ε = (n + ik)² of a metal at wavelength nm, for a sphere of radius r nm
// (r = Infinity: bulk). The size term swaps the Drude part's bulk damping for γ(r).
export function epsilon(id, nm, r = Infinity, A = 1) {
  const m = METALS[id], N = nk(m, nm), eps = mul(N, N);
  if (!isFinite(r)) return eps;
  const [wp, gb, vF] = m.drude, w = EV_NM / nm, gr = gb + (A * HBAR * vF) / r;
  const drude = (g) => div([-wp * wp, 0], [w * w, w * g]); // −ωp² / (ω² + iγω)
  return add(sub(eps, drude(gb)), drude(gr));
}

// Mie efficiencies for relative index m (complex, = N_particle / n_medium) and size parameter
// x = 2π n_medium r / λ. Returns { ext, sca, abs, back, g }: back is the radar backscatter
// efficiency, g the asymmetry parameter ⟨cos θ⟩ of the scattered light.
export function mie(m, x) {
  const nstop = Math.round(x + 4 * x ** (1 / 3) + 2), mx = scale(m, x);
  const nmx = Math.round(Math.max(nstop, Math.hypot(mx[0], mx[1]))) + 16;
  const D = new Array(nmx + 1).fill([0, 0]);
  for (let n = nmx; n > 0; n--) { const q = div([n, 0], mx); D[n - 1] = sub(q, div([1, 0], add(D[n], q))); }
  let psi0 = Math.cos(x), psi1 = Math.sin(x), chi0 = -Math.sin(x), chi1 = Math.cos(x);
  let ext = 0, sca = 0, gsum = 0, back = [0, 0], prevA = null, prevB = null;
  for (let n = 1; n <= nstop; n++) {
    const psi = ((2 * n - 1) / x) * psi1 - psi0, chi = ((2 * n - 1) / x) * chi1 - chi0;
    const xi = [psi, -chi], xi1 = [psi1, -chi1];
    const da = add(div(D[n], m), [n / x, 0]), db = add(mul(m, D[n]), [n / x, 0]);
    const an = div(sub(scale(da, psi), [psi1, 0]), sub(mul(da, xi), xi1));
    const bn = div(sub(scale(db, psi), [psi1, 0]), sub(mul(db, xi), xi1));
    ext += (2 * n + 1) * (an[0] + bn[0]);
    sca += (2 * n + 1) * (abs2(an) + abs2(bn));
    back = add(back, scale(sub(an, bn), (2 * n + 1) * (n % 2 ? -1 : 1)));
    if (prevA) {
      const k = n - 1; // ⟨cos θ⟩ terms pairing order k with k + 1, and order k with itself
      gsum += ((k * (k + 2)) / (k + 1)) * (mul(prevA, conj(an))[0] + mul(prevB, conj(bn))[0])
        + ((2 * k + 1) / (k * (k + 1))) * mul(prevA, conj(prevB))[0];
    }
    prevA = an; prevB = bn;
    psi0 = psi1; psi1 = psi; chi0 = chi1; chi1 = chi;
  }
  const k = nstop; // last self term
  gsum += ((2 * k + 1) / (k * (k + 1))) * mul(prevA, conj(prevB))[0];
  const x2 = x * x;
  ext *= 2 / x2; sca *= 2 / x2;
  return { ext, sca, abs: ext - sca, back: abs2(back) / x2, g: sca > 0 ? (4 / x2) * gsum / sca : 0 };
}

// Efficiencies of a metal sphere of radius r nm in glass of index nMed at wavelength nm.
export function sphere(id, r, nm, nMed = 1.5, A = 1) {
  const m = scale(csqrt(epsilon(id, nm, r, A)), 1 / nMed);
  return mie(m, (2 * Math.PI * nMed * r) / nm);
}

// A colloid on a wavelength grid: per unit volume fraction of metal, the extinction and scattering
// coefficients (per mm) and the asymmetry g, averaged over a log-normal spread of radii (median r nm,
// geometric standard deviation sigma; sigma = 1 is one size). N spheres of volume V filling volume
// fraction f have N = f / V, so a coefficient is f · Σ C(r) / Σ V(r) over the spread.
export function colloid(id, grid, { r, sigma = 1.3, nMed = 1.5, A = 1, points = 9 } = {}) {
  const s = Math.log(sigma), radii = [], weights = [];
  for (let i = 0; i < (s > 0 ? points : 1); i++) {
    const z = s > 0 ? -2.5 + (5 * i) / (points - 1) : 0;
    radii.push(r * Math.exp(z * s)); weights.push(Math.exp(-0.5 * z * z));
  }
  const vol = radii.reduce((t, ri, i) => t + weights[i] * (4 / 3) * Math.PI * ri ** 3, 0);
  return grid.map((nm) => {
    let ext = 0, sca = 0, gs = 0;
    radii.forEach((ri, i) => {
      const q = sphere(id, ri, nm, nMed, A), area = weights[i] * Math.PI * ri * ri;
      ext += q.ext * area; sca += q.sca * area; gs += q.g * q.sca * area;
    });
    return { ext: (ext / vol) * 1e6, sca: (sca / vol) * 1e6, g: sca > 0 ? gs / sca : 0 }; // per nm → per mm
  });
}

// Volume fraction of metal for a weight fraction w (ppm by weight) in glass of density rhoGlass.
export const DENSITY = { Au: 19.32, Ag: 10.49, Cu: 8.96, Au30Ag70: 0.3 * 19.32 + 0.7 * 10.49 }; // g/cm³; alloy by weight, approximately
export const volumeFraction = (id, ppm, rhoGlass = 2.5) => (ppm * 1e-6 * rhoGlass) / DENSITY[id];

// What a slab d mm thick does to light, per wavelength, from a colloid's coefficients and f.
// T: light passed straight through (Beer–Lambert on extinction, so scattered light counts as lost).
// R: light scattered back toward a viewer on the lit side, in a single-scattering estimate: the
// backward share of the scattered light, taken as (1 − g)/2, scattered along a path attenuated on
// the way in and out. Multiple scattering and the glass's own surface reflection are left out.
export function slab(coeffs, f, d) {
  const T = [], R = [];
  for (const { ext, sca, g } of coeffs) {
    const e = f * ext, s = f * sca;
    T.push(Math.exp(-e * d));
    R.push(e > 0 ? ((1 - g) / 2) * (s / e) * 0.5 * (1 - Math.exp(-2 * e * d)) : 0);
  }
  return { T, R };
}
