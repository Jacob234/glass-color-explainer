// AlexandriteToggle: flip the illuminant, recompute neodymium's transmitted color,
// and draw both SPDs against Nd's picket-fence absorption.
import { transmittedColor } from './spectrum.js';

export function initAlexandriteToggle(root, optics) {
  const nd = optics.colorants.find((c) => c.id === 'neodymium');
  const swatch = root.querySelector('.alx-swatch');
  const spdLine = root.querySelector('.alx-spd');
  const buttons = root.querySelectorAll('.alx-buttons button');
  const W = 360, H = 90;

  // Nd absorption is drawn once (static polyline).
  const absLine = root.querySelector('.alx-abs');
  absLine.setAttribute(
    'points',
    nd.absorbance.map((a, i) => `${(i / (nd.absorbance.length - 1)) * W},${H - a * H}`).join(' ')
  );

  function select(id) {
    const il = optics.illuminants.find((i) => i.id === id);
    spdLine.setAttribute(
      'points',
      il.spd.map((v, i) => `${(i / (il.spd.length - 1)) * W},${H - v * H}`).join(' ')
    );
    swatch.style.background = transmittedColor(optics.wavelengths, nd.absorbance, il.spd);
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  }
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
  select('daylight');
}
