// optics-core.js — framework-agnostic color science shared by islands.
// Pure functions only: no DOM, no framework imports.

// Wavelength (nm) -> approximate sRGB (0..1), piecewise-linear visible-spectrum map.
export function wavelengthToRgb(w) {
  let r = 0, g = 0, b = 0;
  if (w < 440) { r = -(w - 440) / 60; b = 1; }
  else if (w < 490) { g = (w - 440) / 50; b = 1; }
  else if (w < 510) { g = 1; b = -(w - 510) / 20; }
  else if (w < 580) { r = (w - 510) / 70; g = 1; }
  else if (w < 645) { r = 1; g = -(w - 645) / 65; }
  else { r = 1; }
  let f = 1;
  if (w < 420) f = 0.3 + 0.7 * (w - 380) / 40;
  else if (w > 700) f = 0.3 + 0.7 * (780 - w) / 80;
  return [r * f, g * f, b * f];
}

// Integrate illuminant x transmission x rgb(lambda) over the sample points.
// Each wavelength is additionally weighted by an approximate photopic luminosity
// factor (Gaussian centred at 555 nm, sigma=100 nm) so that the human eye's
// sensitivity peak is respected and colours read more true to life.
export function transmittedColor(wavelengths, absorbance, spd) {
  let r = 0, g = 0, b = 0, norm = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    const w = wavelengths[i];
    const lum = Math.exp(-((w - 555) ** 2) / (2 * 100 ** 2));
    const weight = spd[i] * lum;
    const t = weight * (1 - absorbance[i]);
    const [cr, cg, cb] = wavelengthToRgb(w);
    r += t * cr; g += t * cg; b += t * cb; norm += weight;
  }
  const scale = 255 / (norm * 0.55); // headroom so saturated colors don't clip to white
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * scale)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

// Multiplicative-transmittance mixing (Beer–Lambert in spirit, linearized in c).
// melts: [{ colorant: { absorbance: [...] }, c: 0..1 }]; n: number of wavelength points.
// Per point j: A_eff[j] = 1 - product_i(1 - c_i * A_i[j]).
export function mixedAbsorbance(melts, n) {
  const out = new Array(n).fill(0);
  for (let j = 0; j < n; j++) {
    let t = 1;
    for (const { colorant, c } of melts) t *= 1 - c * colorant.absorbance[j];
    out[j] = 1 - t;
  }
  return out;
}
