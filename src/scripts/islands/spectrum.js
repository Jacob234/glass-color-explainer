// SpectrumExplorer: colorant buttons -> absorption curve over a spectrum gradient
// -> transmitted-color swatch. Color science lives in ../optics-core.js.
import { wavelengthToRgb, transmittedColor } from '../optics-core.js';
export { wavelengthToRgb, transmittedColor };

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
