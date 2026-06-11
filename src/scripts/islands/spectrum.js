// SpectrumExplorer: colorant buttons -> absorption curve over a spectrum gradient
// -> transmitted-color swatch. Coarse RGB approximation, documented on-page.

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
// factor (Gaussian centred at 555 nm, sigma=80 nm) so that the human eye's
// sensitivity peak is respected and colours read more true to life.
export function transmittedColor(wavelengths, absorbance, spd) {
  let r = 0, g = 0, b = 0, norm = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    const w = wavelengths[i];
    // Approximate photopic luminosity: Gaussian centred at 555 nm, sigma=100 nm
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

export function initSpectrumExplorer(root, optics) {
  const daylight = optics.illuminants.find((i) => i.id === 'daylight');
  const curve = root.querySelector('.spx-curve');
  const swatch = root.querySelector('.spx-swatch');
  const why = root.querySelector('.spx-why');
  const W = 360, H = 90;

  // Buttons are server-rendered by SpectrumExplorer.astro (so Astro scoped-CSS applies).
  // We attach click listeners and look up colorant data by data-id.
  const buttons = root.querySelectorAll('.spx-buttons button');

  function select(c) {
    const pts = c.absorbance
      .map((a, i) => `${(i / (c.absorbance.length - 1)) * W},${H - a * H}`)
      .join(' ');
    curve.setAttribute('points', pts);
    swatch.style.background = transmittedColor(optics.wavelengths, c.absorbance, daylight.spd);
    why.textContent = c.why;
    for (const b of buttons) b.classList.toggle('active', b.dataset.id === c.id);
  }

  for (const b of buttons) {
    b.addEventListener('click', () => {
      const c = optics.colorants.find((x) => x.id === b.dataset.id);
      if (c) select(c);
    });
  }

  // Auto-select the first button's colorant on init.
  if (buttons.length > 0) {
    const firstId = buttons[0].dataset.id;
    const first = optics.colorants.find((c) => c.id === firstId);
    if (first) select(first);
  }
}
