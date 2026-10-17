// bands.js — colorants modelled as absorption bands rather than sampled curves.
// Pure functions only: no DOM. The coarse curves in optics.json are sampled every 25 nm, which is
// fine for broad absorbers but loses narrow ones: neodymium's 585 nm band falls between the 580 and
// 605 nm samples. A band model can be evaluated on any grid, so the 5 nm colour engine (spectra.js)
// and the 1 nm flare model (flare.js) see the same physics.

const gauss = (x, c, fwhm) => Math.exp(-4 * Math.LN2 * ((x - c) / fwhm) ** 2);

// Narrow bands, Gaussian in wavelength: [centre nm, FWHM nm, peak decadic density].
export const wavelengthBands = (bands, grid) => grid.map((w) => bands.reduce((d, [c, fwhm, k]) => d + k * gauss(w, c, fwhm), 0));
// Broad bands, Gaussian in energy: [centre cm⁻¹, FWHM cm⁻¹, peak decadic density].
export const energyBands = (bands, grid) => grid.map((w) => bands.reduce((d, [c, fwhm, k]) => d + k * gauss(1e7 / w, c, fwhm), 0));

// Absorption bands of the two "twins" in didymium glass.
// Centres follow the didymium wavelength-reference peaks (Starna RM-DG: 431, 473, 513, 529, 573,
// 585, 685, 741, 749, 807, 879 nm) plus the Pr³⁺ bands in silicate glass (444, 469, 482, 590 nm).
// Widths and strengths are approximate, scaled so a 3 mm working lens passes about 1% at 589 nm.
export const ND_BANDS = [
  [431, 6, 0.10], [473, 8, 0.06], [513, 8, 0.18], [529, 11, 0.42],
  [573, 7, 0.6], [585, 12, 1.6], [685, 7, 0.08], [741, 7, 0.40],
  [749, 7, 0.38], [807, 13, 0.55], [879, 13, 0.30],
];
export const PR_BANDS = [[444, 9, 0.45], [469, 8, 0.22], [482, 6, 0.20], [590, 10, 0.8]];

// Tetrahedral Co²⁺, the ion in cobalt blue: the spin-allowed ⁴A₂ → ⁴T₁(P) transition, a band spanning
// about 15,000–19,000 cm⁻¹ and split into a triplet (Taran et al., Am. Mineral. 94, 2009, measured in
// spinel; the centres used here, near 535, 580 and 630 nm, are approximate values for silicate glass).
// Above ~680 nm the glass is clear again until the ⁴T₁(F) band near 1500 nm, so cobalt glass passes
// deep red: the red leak is real, but it sits where the eye is nearly blind, so the glass reads blue
// rather than violet. Peak density matches the old sampled curve
// (1.3), so concentrations on the page keep their meaning; relative strengths are approximate.
export const CO_BANDS = [[15900, 1800, 0.95], [17200, 1800, 0.90], [18700, 1800, 0.66]];

// Decadic density on a wavelength grid, for each colorant that has a band model, at the page's
// reference amount (c = 1). For neodymium that is an art glass with three times the working lens's
// density (illustrative): narrow bands take little light, so a lens-strength piece is barely lilac.
export const BAND_MODELS = {
  neodymium: (grid) => wavelengthBands(ND_BANDS, grid).map((d) => 3 * d),
  cobalt: (grid) => energyBands(CO_BANDS, grid),
};
