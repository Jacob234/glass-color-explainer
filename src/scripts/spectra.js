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
export function spectrumColor(T, spd) {
  const white = integrate(spd), norm = white[1];
  const xyz = integrate(spd.map((s, i) => s * T[i])).map((v) => v / norm);
  const src = mul(BRADFORD, white.map((v) => v / norm)), dst = mul(BRADFORD, D65);
  const lin = mul(XYZ_TO_SRGB, mul(BRADFORD_INV, mul(BRADFORD, xyz).map((v, i) => (v * dst[i]) / src[i])));
  const rgb = lin.map(encode);
  return { lin, rgb, css: css(rgb) };
}

// Optical density on the grid for a colorant's coarse absorptance curve.
export const densityOnGrid = (wavelengths, absorbance) => toGrid(wavelengths, absorbance.map(toDensity));

// A colorant's density on the grid: from its band model when it has one (bands.js), since narrow
// bands fall between the 25 nm samples, otherwise from its sampled curve in optics.json.
export const colorantDensity = (colorant, wavelengths) =>
  BAND_MODELS[colorant.id] ? BAND_MODELS[colorant.id](GRID) : densityOnGrid(wavelengths, colorant.absorbance);

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
