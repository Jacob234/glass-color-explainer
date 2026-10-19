// uranium.js — uranium glass, the one glass on the page that gives light out as well as taking it away.
// Pure functions only: no DOM. Absorption works as everywhere else (Beer–Lambert on optical density),
// but every photon the uranyl ion absorbs has a chance of coming back out as green fluorescence.
// The ultraviolet matters here, so this module adds a UV grid (300–375 nm) below spectra.js's GRID.
import { GRID } from './spectra.js';

export const UV = Array.from({ length: 16 }, (_, i) => 300 + 5 * i); // 300–375 nm, then GRID from 380
export const EXT = [...UV, ...GRID];

const gauss = (x, c, fwhm) => Math.exp(-4 * Math.LN2 * ((x - c) / fwhm) ** 2);

// Absorption of the uranyl ion (UO₂²⁺) in a soda-lime glass at about 2% uranium, as optical density
// for a 5 mm piece. A strong charge-transfer edge in the near ultraviolet, whose tail and a weak
// series of bands reach into the violet and blue: that is all the yellow in "canary" glass. Shapes
// and strengths are illustrative, drawn to the published outline rather than fitted to a measurement.
export const BANDS = [[418, 16, 0.4], [434, 16, 0.36], [452, 18, 0.28], [472, 18, 0.12]]; // [nm, FWHM, density]
export const density = (w) => 3 / (1 + Math.exp((w - 398) / 11)) + BANDS.reduce((d, [c, f, k]) => d + k * gauss(w, c, f), 0);

// Emission: uranyl's vibronic comb. One electronic transition, repeated at steps of the O=U=O
// symmetric stretch (about 830 cm⁻¹), so the peaks are evenly spaced in energy, not wavelength.
// The strongest sits near 527 nm, where a uranium-glass marble under a 445 nm laser peaks
// (ledmuseum.candlepower.us, spectrum 1001); the others follow from the spacing. Glass broadens each.
const PEAK = 1e7 / 527, STRETCH = 830, LINEWIDTH = 700; // cm⁻¹
export const COMB = [1, 0, -1, -2, -3].map((n, i) => [PEAK + n * STRETCH, [0.45, 1, 0.78, 0.38, 0.12][i]]);
// Emission shape on GRID as photons per sample, summing to 1.
export const EMISSION = (() => {
  const p = GRID.map((w) => COMB.reduce((s, [nu, a]) => s + a * gauss(1e7 / w, nu, LINEWIDTH), 0) / w ** 2); // per nm, from per cm⁻¹
  const sum = p.reduce((a, b) => a + b, 0);
  return p.map((v) => v / sum);
})();

// Fraction of absorbed photons re-emitted (quantum yield) times the share of that light that leaves
// the face you are looking at. Both are illustrative.
export const YIELD = 0.5, TOWARD_EYE = 0.5;

// Light given out (energy per GRID sample) when a lamp shines on the glass. lampExt is the lamp on EXT
// (energy per sample); thickness scales the density as usual. Photons absorbed are counted as
// energy × λ, re-emitted with the comb's shape, and turned back into energy (÷ λ).
export function fluorescence(lampExt, thickness = 1) {
  let photons = 0;
  EXT.forEach((w, i) => { photons += lampExt[i] * (1 - 10 ** -(density(w) * thickness)) * w; });
  return GRID.map((w, i) => (YIELD * TOWARD_EYE * photons * EMISSION[i]) / w);
}

// Transmission on GRID, for the color the glass takes away.
export const transmissionOnGrid = (thickness = 1) => GRID.map((w) => 10 ** -(density(w) * thickness));
