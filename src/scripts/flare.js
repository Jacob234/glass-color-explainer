// flare.js — the sodium flare and the lenses that remove it, on a 1 nm grid.
// Pure functions only: no DOM. The 5 nm grid in spectra.js is fine for broad absorbers, but the
// sodium D lines are 0.6 nm apart and didymium's yellow notch is ~15 nm wide, so this module
// works at 1 nm and reaches into the near infrared (to 1400 nm), where the eye's own lens is at risk.
import { cmf } from './optics-core.js';

export const STEP = 1; // nm
export const FINE = Array.from({ length: 1021 }, (_, i) => 380 + i); // 380–1400 nm
export const VIS_END = FINE.indexOf(780); // last visible sample
const CMF = FINE.map((w) => (w <= 780 ? cmf(w) : [0, 0, 0]));

// Absorption bands of the two "twins" in didymium glass, as Gaussians in decadic density.
// Centres follow the didymium wavelength-reference peaks (Starna RM-DG: 431, 473, 513, 529, 573,
// 585, 685, 741, 749, 807, 879 nm) plus the Pr³⁺ bands in silicate glass (444, 469, 482, 590 nm).
// Widths and strengths are approximate, scaled so a 3 mm working lens passes about 1% at 589 nm.
// [centre nm, FWHM nm, peak density]
export const ND_BANDS = [
  [431, 6, 0.10], [473, 8, 0.06], [513, 8, 0.18], [529, 11, 0.42],
  [573, 7, 0.6], [585, 12, 1.6], [685, 7, 0.08], [741, 7, 0.40],
  [749, 7, 0.38], [807, 13, 0.55], [879, 13, 0.30],
];
export const PR_BANDS = [[444, 9, 0.45], [469, 8, 0.22], [482, 6, 0.20], [590, 10, 0.8]];

// Ferrous iron, the absorber in old "heat-absorbing" sage-green glass: one broad band centred in the
// near infrared whose tail reaches the red. A band this broad is Gaussian in energy, not wavelength,
// so it is given in wavenumbers. Peak density set so the near infrared drops to ~5%, in line with
// Coblentz & Emerson's (1917) measurements of ferrous glasses against furnace radiation.
// [centre cm⁻¹, FWHM cm⁻¹, peak density]
export const FE_BAND = [9100, 6500, 1.6];

const gauss = (x, c, fwhm) => Math.exp(-4 * Math.LN2 * ((x - c) / fwhm) ** 2);
export const bandDensity = (bands) => FINE.map((w) => bands.reduce((d, [c, fwhm, k]) => d + k * gauss(w, c, fwhm), 0));
const energyBand = ([c, fwhm, k]) => FINE.map((w) => k * gauss(1e7 / w, c, fwhm));

const FRESNEL = 0.92; // two glass–air surfaces at normal incidence, ~4% each
const ND = bandDensity(ND_BANDS), PR = bandDensity(PR_BANDS), FE = energyBand(FE_BAND);

// Lens transmission on FINE. Densities add (Beer–Lambert) across the absorbers in a stack.
export const LENSES = {
  none: { label: 'bare eyes', T: FINE.map(() => 1) },
  didymium: { label: 'didymium', T: FINE.map((_, i) => FRESNEL * 10 ** -(ND[i] + PR[i])) },
  shade: { label: 'didymium + IR glass', T: FINE.map((_, i) => FRESNEL * FRESNEL * 10 ** -(ND[i] + PR[i] + FE[i])) },
};
export const DENSITY = { nd: ND, pr: PR, fe: FE };

// The sodium D doublet (D2 588.995 nm, D1 589.592 nm, intensity about 2 : 1 in a flame), spread onto
// the 1 nm grid so each line's energy is split between its two neighbouring samples.
export const SODIUM_D = [[588.995, 2 / 3], [589.592, 1 / 3]];
export function lineSpectrum(lines = SODIUM_D) {
  const out = FINE.map(() => 0);
  for (const [w, a] of lines) {
    const i = Math.floor(w - FINE[0]), f = w - FINE[i];
    out[i] += (a * (1 - f)) / STEP; out[i + 1] += (a * f) / STEP;
  }
  return out;
}

// Black-body emission (Planck's law, relative units) at T kelvin on FINE.
const C2 = 1.4388e7; // nm·K
export const planck = (T) => FINE.map((w) => w ** -5 / (Math.exp(C2 / (w * T)) - 1));

// Tristimulus XYZ of an emission spectrum seen through transmission T (visible part only).
export function xyz(spd, T = LENSES.none.T) {
  const out = [0, 0, 0];
  for (let i = 0; i <= VIS_END; i++) for (let k = 0; k < 3; k++) out[k] += spd[i] * T[i] * CMF[i][k] * STEP;
  return out;
}
// Radiant power between a and b nm, through T.
export function power(spd, T = LENSES.none.T, a = 780, b = 1400) {
  let p = 0;
  for (let i = FINE.indexOf(a); i <= FINE.indexOf(b); i++) p += spd[i] * T[i] * STEP;
  return p;
}

// Luminous transmission of a lens for a source (Y through the lens over Y without it).
export const luminousT = (lensT, spd) => xyz(spd, lensT)[1] / xyz(spd)[1];

// The sodium flare as a source, scaled so its luminance is `ratio` times that of a black body at T.
export function flareSpectrum(T, ratio) {
  const line = lineSpectrum(), k = (ratio * xyz(planck(T))[1]) / xyz(line)[1];
  return line.map((v) => v * k);
}

const XYZ_TO_SRGB = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
// Chromaticity of a light as displayable sRGB (0..1), normalised so the brightest channel is 1.
// Out-of-gamut colours (a pure spectral line) are clipped toward the nearest displayable one.
export function lightColor(v) {
  const lin = XYZ_TO_SRGB.map((r) => Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]));
  const peak = Math.max(...lin, 1e-12);
  return lin.map((c) => encode(c / peak));
}
