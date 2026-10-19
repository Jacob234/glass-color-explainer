// spectra.js — fine-grid spectral tools for the home page instruments.
// Pure functions only: no DOM. Builds on optics-core's observer and sRGB encoding, but works
// with whole transmission spectra on a 5 nm grid, so instruments can shift, broaden or model
// spectra (a struck gold band, a band-gap edge, a dichroic reflection band) before rendering.
import { cmf, toDensity } from './optics-core.js';
import { BAND_MODELS } from './bands.js';

export const GRID = Array.from({ length: 81 }, (_, i) => 380 + 5 * i); // 380–780 nm
const CMF = GRID.map(cmf);

// Linear interpolation of coarse samples ys (at xs) onto the grid.
export function toGrid(xs, ys) {
  return GRID.map((w) => {
    if (w <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) {
      if (w <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (w - xs[i - 1])) / (xs[i] - xs[i - 1]);
    }
    return ys[ys.length - 1];
  });
}

const D65 = [0.95047, 1, 1.08883];
const BRADFORD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
const BRADFORD_INV = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
const XYZ_TO_SRGB = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
const mul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
export const encode = (c) => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
export const css = (rgb) => `rgb(${rgb.map((v) => Math.round(255 * v)).join(', ')})`;

function integrate(spectrum) {
  const xyz = [0, 0, 0];
  for (let i = 0; i < GRID.length; i++) for (let k = 0; k < 3; k++) xyz[k] += spectrum[i] * CMF[i][k];
  return xyz;
}

// Colour of a transmission (or reflection) spectrum T under illuminant spd, both on GRID,
// as seen by an eye adapted to that illuminant. Returns linear sRGB, encoded sRGB (0..1) and css.
// adapt is the degree of adaptation D: 1 = the eye fully discounts the lamp, so its white renders as
// white; 0 = no adaptation, so the lamp's own colour shows. In between, each cone's von Kries gain is
// raised to the power D (CIECAM02 blends the gains linearly instead, which turns warm lamps pink here).
export function spectrumColor(T, spd, adapt = 1) {
  return radianceColor(spd.map((s, i) => s * T[i]), spd, adapt);
}

// Colour of light L reaching the eye (on GRID, in the lamp's units) under illuminant spd: the same as
// spectrumColor, but L may hold light the glass gives out itself (fluorescence) as well as light it
// passes. scale multiplies the result, for scenes where the eye is set by something other than white.
export function radianceColor(L, spd, adapt = 1, scale = 1) {
  const white = integrate(spd), norm = white[1] / scale;
  const xyz = integrate(L).map((v) => v / norm);
  const src = mul(BRADFORD, white.map((v) => v / white[1])), dst = mul(BRADFORD, D65);
  const gain = dst.map((d, i) => (d / src[i]) ** adapt);
  const lin = mul(XYZ_TO_SRGB, mul(BRADFORD_INV, mul(BRADFORD, xyz).map((v, i) => v * gain[i])));
  const rgb = lin.map(encode);
  return { lin, rgb, css: css(rgb) };
}

// Optical density on the grid for a colorant's coarse absorptance curve.
export const densityOnGrid = (wavelengths, absorbance) => toGrid(wavelengths, absorbance.map(toDensity));

// A colorant's density on the grid: from its band model when it has one (bands.js), since narrow
// bands fall between the 25 nm samples, otherwise from its sampled curve in optics.json.
export const colorantDensity = (colorant, wavelengths) =>
  BAND_MODELS[colorant.id] ? BAND_MODELS[colorant.id](GRID) : densityOnGrid(wavelengths, colorant.absorbance);

// optics.json resampled onto GRID, with band models in place of sampled curves, for the islands
// built on optics-core (whose functions work on any wavelength grid). Absorptance is what
// optics-core expects; it caps density at 3, which only clips the core of neodymium's 585 nm band.
export const fineOptics = (optics) => ({
  ...optics,
  wavelengths: GRID,
  colorants: optics.colorants.map((c) => ({ ...c, absorbance: colorantDensity(c, optics.wavelengths).map((d) => 1 - 10 ** -d) })),
  illuminants: optics.illuminants.map((i) => ({ ...i, spd: toGrid(optics.wavelengths, i.spd) })),
});

// Beer–Lambert on the grid: densities add, scaled by concentration × thickness.
// parts: [[densityGrid, concentration], ...]
export function transmission(parts, thickness = 1) {
  return GRID.map((_, i) => 10 ** -(parts.reduce((d, [dens, c]) => d + c * dens[i], 0) * thickness));
}

// Black-body emission (Planck's law, relative units) at temperature T in kelvin.
const C2 = 1.4388e7; // second radiation constant, nm·K
export const planck = (T) => GRID.map((w) => w ** -5 / (Math.exp(C2 / (w * T)) - 1));

// The colour and relative luminance of a glowing body at T kelvin. The colour is normalised so
// its brightest channel is 1; luminance is relative to a body at Tref (1150 °C furnace glass).
export function glow(T, Tref = 1423) {
  const xyz = integrate(planck(T)), lin = mul(XYZ_TO_SRGB, xyz), peak = Math.max(...lin);
  return { rgb: lin.map((v) => encode(Math.max(0, v) / peak)), luminance: xyz[1] / integrate(planck(Tref))[1] };
}

// Perceived glow strength 0..1 from relative luminance, on a log scale (the eye is roughly
// logarithmic, and luminance falls about five orders of magnitude from 1150 °C to the Draper point).
export const glowStrength = (luminance) => Math.min(1, Math.max(0, (Math.log10(luminance) + 5.2) / 5.2));

// Monochromatic colours for drawing spectra, at a brightness that follows the eye's sensitivity.
// The hue is held fixed beyond 420–675 nm, where the analytic observer fit is least reliable.
export const SPECTRAL = GRID.map((w, i) => {
  const lin = mul(XYZ_TO_SRGB, cmf(Math.min(675, Math.max(420, w)))).map((v) => Math.max(0, v));
  const peak = Math.max(...lin, 1e-6), k = Math.min(1, (CMF[i][1] / 0.35) ** 0.45);
  return lin.map((v) => (v / peak) * k);
});

// An idealised semiconductor absorption edge: photons above the band gap (eV) are absorbed.
export const bandEdge = (eV, width = 8) => {
  const edge = 1240 / eV;
  return GRID.map((w) => 1 - 0.97 / (1 + Math.exp((w - edge) / width)));
};

// A thin-film reflection band that blue-shifts with angle: λc = λ0 √(1 − sin²θ / n²).
export function dichroicBand(degrees, { lambda0 = 640, n = 1.8, sigma = 34, peak = 0.9 } = {}) {
  const th = (degrees * Math.PI) / 180, center = lambda0 * Math.sqrt(1 - (Math.sin(th) / n) ** 2);
  return { center, R: GRID.map((w) => peak * Math.exp(-0.5 * ((w - center) / sigma) ** 2)) };
}

// A smooth transmission spectrum that reproduces an sRGB colour under illuminant spd, for colours
// that come from photos rather than spectra. Jakob & Hanika's sigmoid-polynomial form ("A
// Low-Dimensional Function Space for Efficient Spectral Upsampling", Eurographics 2019):
// T(λ) = S(c₀x² + c₁x + c₂), with S a sigmoid, so T stays in 0..1 and is as smooth as a real
// absorber's broad bands. The three coefficients are fitted by damped Gauss–Newton. Many spectra
// give the same colour (metamers); this picks the smoothest family, so treat it as an estimate.
const sigmoid = (z) => 0.5 + z / (2 * Math.sqrt(1 + z * z));
export const sigmoidSpectrum = (c) => GRID.map((w) => { const x = (w - 580) / 200; return sigmoid(c[0] * x * x + c[1] * x + c[2]); });
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function solve3(A, b) { // Cramer's rule
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  return [0, 1, 2].map((k) => det(A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / d);
}
export function upsample(rgb, spd, iterations = 40) {
  const target = rgb.map(toLinear), h = 1e-4;
  const residual = (c) => spectrumColor(sigmoidSpectrum(c), spd).lin.map((v, i) => v - target[i]);
  let c = [0, 0, 0], r = residual(c), err = r.reduce((s, v) => s + v * v, 0), damp = 1e-3;
  for (let it = 0; it < iterations && err > 1e-10; it++) {
    const J = [0, 1, 2].map((k) => { const cc = c.slice(); cc[k] += h; return residual(cc).map((v, i) => (v - r[i]) / h); }); // J[k][i]
    const A = [0, 1, 2].map((a) => [0, 1, 2].map((b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0) + (a === b ? damp : 0)));
    const g = [0, 1, 2].map((a) => -J[a].reduce((s, v, i) => s + v * r[i], 0));
    const next = c.map((v, k) => v + solve3(A, g)[k]), rn = residual(next), en = rn.reduce((s, v) => s + v * v, 0);
    if (en < err) { c = next; r = rn; err = en; damp = Math.max(1e-7, damp / 10); } else damp *= 10;
  }
  return sigmoidSpectrum(c);
}
