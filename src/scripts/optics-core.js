// optics-core.js — framework-agnostic color science shared by islands.
// Pure functions only: no DOM, no framework imports.
//
// Pipeline: absorptance curve -> optical density -> Beer–Lambert transmittance
// -> (illuminant x transmittance) integrated against the CIE 1931 2° observer
// -> XYZ -> Bradford adaptation to D65 -> sRGB.

// Curves in optics.json are sampled coarsely (25 nm); integrate on a 5 nm grid.
const STEP = 5;
const MAX_ABSORPTANCE = 0.999; // caps optical density at 3 so -log10 stays finite

// CIE 1931 2° colour-matching functions, multi-lobe piecewise-Gaussian fit from
// Wyman, Sloan & Shirley, "Simple Analytic Approximations to the CIE XYZ Color
// Matching Functions", JCGT 2(2), 2013. Within ~1% of the tabulated CMFs.
function lobe(w, mu, s1, s2) {
  const t = (w - mu) / (w < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
export function cmf(w) {
  const x = 1.056 * lobe(w, 599.8, 37.9, 31.0) + 0.362 * lobe(w, 442.0, 16.0, 26.7) - 0.065 * lobe(w, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(w, 568.8, 46.9, 40.5) + 0.286 * lobe(w, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(w, 437.0, 11.8, 36.0) + 0.681 * lobe(w, 459.0, 26.0, 13.8);
  return [x, y, z];
}

// Absorptance (fraction absorbed, 0..1) <-> optical density (decadic absorbance).
export function toDensity(a) {
  return -Math.log10(1 - Math.min(Math.max(a, 0), MAX_ABSORPTANCE));
}
const fromDensity = (d) => 1 - 10 ** -d;

// Linear interpolation of samples ys (at xs) onto x.
function lerp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * f;
    }
  }
  return ys[ys.length - 1];
}

const D65_WHITE = [0.95047, 1.0, 1.08883];
const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INV = [
  [0.9869929, -0.1470543, 0.1599627],
  [0.4323053, 0.5183603, 0.0492912],
  [-0.0085287, 0.0400428, 0.9684867],
];
const XYZ_TO_SRGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];
const mul = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

// XYZ of a sample (Y normalized so the illuminant's white has Y = 1), adapted from
// the illuminant's white point to D65 — i.e. as seen by an eye adjusted to that light.
export function transmittedXYZ(wavelengths, absorbance, spd) {
  const xyz = [0, 0, 0], white = [0, 0, 0];
  for (let w = wavelengths[0]; w <= wavelengths[wavelengths.length - 1]; w += STEP) {
    const s = lerp(wavelengths, spd, w);
    const t = 10 ** -lerp(wavelengths, absorbance.map(toDensity), w);
    const [x, y, z] = cmf(w);
    xyz[0] += s * t * x; xyz[1] += s * t * y; xyz[2] += s * t * z;
    white[0] += s * x; white[1] += s * y; white[2] += s * z;
  }
  const norm = white[1];
  const src = mul(BRADFORD, white.map((v) => v / norm));
  const dst = mul(BRADFORD, D65_WHITE);
  const cone = mul(BRADFORD, xyz.map((v) => v / norm)).map((v, i) => (v * dst[i]) / src[i]);
  return mul(BRADFORD_INV, cone);
}

export function xyzToRgb(xyz) {
  const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return mul(XYZ_TO_SRGB, xyz).map((c) => Math.round(255 * encode(Math.min(1, Math.max(0, c)))));
}

export function transmittedColor(wavelengths, absorbance, spd) {
  const [r, g, b] = xyzToRgb(transmittedXYZ(wavelengths, absorbance, spd));
  return `rgb(${r}, ${g}, ${b})`;
}

// Beer–Lambert mixing: optical densities add, scaled by concentration and path length.
// melts: [{ colorant: { absorbance: [...] }, c: relative concentration (1 = the curve as given) }];
// n: number of wavelength points; thickness: relative path length (1 = reference).
// Returns the mixed absorptance curve, in the same units as the inputs.
export function mixedAbsorbance(melts, n, thickness = 1) {
  const out = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let d = 0;
    for (const { colorant, c } of melts) d += c * toDensity(colorant.absorbance[j]);
    out[j] = fromDensity(d * thickness);
  }
  return out;
}
