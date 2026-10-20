// flare.js — the sodium flare and the lenses that remove it, on a 1 nm grid.
// Pure functions only: no DOM. The 5 nm grid in spectra.js is fine for broad absorbers, but the
// sodium D lines are 0.6 nm apart and didymium's yellow notch is ~15 nm wide, so this module
// works at 1 nm and reaches into the near infrared (to 1400 nm), where the eye's own lens is at risk.
import { cmf } from './optics-core.js';
import { ND_BANDS, PR_BANDS, wavelengthBands, energyBands } from './bands.js';

export const STEP = 1; // nm
export const FINE = Array.from({ length: 1021 }, (_, i) => 380 + i); // 380–1400 nm
export const VIS_END = FINE.indexOf(780); // last visible sample
const CMF = FINE.map((w) => (w <= 780 ? cmf(w) : [0, 0, 0]));

// Absorption bands of the two "twins" in didymium glass live in bands.js, shared with the color engine.
export { ND_BANDS, PR_BANDS };

// Ferrous iron, the absorber in old "heat-absorbing" sage-green glass: one broad band centered in the
// near infrared whose tail reaches the red. A band this broad is Gaussian in energy, not wavelength,
// so it is given in wavenumbers. Peak density set so the near infrared drops to ~5%, in line with
// Coblentz & Emerson's (1917) measurements of ferrous glasses against furnace radiation.
// [center cm⁻¹, FWHM cm⁻¹, peak density]
export const FE_BAND = [9100, 6500, 1.6];

export const bandDensity = (bands) => wavelengthBands(bands, FINE);

// Two glass–air surfaces at normal incidence, ~4% each for n ≈ 1.5: R = ((n − 1)/(n + 1))², and the
// reflection factor (1 − R)² ≈ 0.92 that turns internal into external transmittance (SCHOTT TIE-35,
// Transmittance of optical glass). Multiple reflections between the faces are ignored.
const FRESNEL = 0.92;
const ND = bandDensity(ND_BANDS), PR = bandDensity(PR_BANDS), FE = energyBands([FE_BAND], FINE);

// Lens transmission on FINE. Densities add (Beer–Lambert) across the absorbers in a stack.
export const LENSES = {
  none: { label: 'bare eyes', T: FINE.map(() => 1) },
  didymium: { label: 'didymium', T: FINE.map((_, i) => FRESNEL * 10 ** -(ND[i] + PR[i])) },
  shade: { label: 'didymium + IR glass', T: FINE.map((_, i) => FRESNEL * FRESNEL * 10 ** -(ND[i] + PR[i] + FE[i])) },
};
export const DENSITY = { nd: ND, pr: PR, fe: FE };

// The sodium D doublet (D2 588.995 nm, D1 589.592 nm in air: NIST Atomic Spectra Database v5.12,
// doi:10.18434/T4W30F; intensity about 2 : 1 in a flame), spread onto
// the 1 nm grid so each line's energy is split between its two neighboring samples.
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
// Chromaticity of a light as displayable sRGB (0..1), normalized so the brightest channel is 1.
// Out-of-gamut colors (a pure spectral line) are clipped toward the nearest displayable one.
export function lightColor(v) {
  const lin = XYZ_TO_SRGB.map((r) => Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]));
  const peak = Math.max(...lin, 1e-12);
  return lin.map((c) => encode(c / peak));
}
