// Gather: a gather of colored glass on a blowpipe, pulled out of the glory hole and cooled.
// While hot, its incandescent glow swamps the colorant; below the Draper point the glow is
// too faint to see and the colorant's transmitted color is all that is left.
import { glow } from '../optics-core.js';

const HOT = 1150; // °C, soda-lime furnace
const STAGES = [
  [1050, 'In the glory hole. The gather glows brighter than any color it carries.'],
  [850, 'Working heat. Still glowing orange: at this point you are reading heat, not color.'],
  [650, 'Cooling through the softening range. The glow dims to cherry red and the color starts to show through.'],
  [450, 'Below the Draper point (about 525 °C) the glow is too faint to see. What is left is the colorant.'],
  [-Infinity, null], // room temperature: the colorant's own story
];

const parse = (s) => s.match(/\d+/g).map(Number);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

// Perceived glow strength 0..1 from relative luminance (a log scale: the eye is log-ish,
// and the luminance spans six orders of magnitude between 1150 °C and 525 °C).
const strength = (luminance) => Math.min(1, Math.max(0, (Math.log10(luminance) + 5.2) / 5.2));

export function gatherColor(bodyRgb, celsius) {
  const g = glow(celsius + 273.15);
  const a = strength(g.luminance);
  const hot = mix(g.rgb, [255, 210, 110], a ** 3 * 0.45); // the hottest glass reads yellow-orange
  return { color: mix(bodyRgb, hot, a), glow: a, glowRgb: g.rgb };
}

export function initGather(root) {
  const slider = root.querySelector('.g-temp');
  const readout = root.querySelector('.g-readout');
  const stage = root.querySelector('.g-stage');
  const rig = root.querySelector('.g-rig');
  const buttons = root.querySelectorAll('.g-colorants button');
  let body = parse(buttons[0].dataset.color);
  let why = buttons[0].dataset.why;
  let raf = 0;

  function render(t) {
    const { color, glow: a, glowRgb } = gatherColor(body, t);
    root.style.setProperty('--gather', css(color));
    root.style.setProperty('--glow', String(a));
    root.style.setProperty('--glow-rgb', css(glowRgb));
    // pull the pipe out of the furnace as it cools: 0 = in the glory hole, 1 = on the bench
    rig.style.transform = `translateX(${-(1 - t / HOT) * 34}%)`;
    readout.textContent = `${Math.round(t)} °C`;
    stage.textContent = STAGES.find(([min]) => t > min)[1] ?? why;
    slider.setAttribute('aria-valuetext', `${Math.round(t)} degrees Celsius`);
  }

  function stopAuto() { cancelAnimationFrame(raf); raf = 0; }

  slider.addEventListener('input', () => { stopAuto(); render(slider.valueAsNumber); });
  for (const b of buttons) {
    b.addEventListener('click', () => {
      body = parse(b.dataset.color);
      why = b.dataset.why;
      for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
      render(slider.valueAsNumber);
    });
  }
  buttons[0].setAttribute('aria-pressed', 'true');

  // Play the cool-down once on load, unless the reader prefers reduced motion.
  slider.value = String(HOT);
  render(HOT);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // hold in the glory hole, then cool: slow at first, like a gather leaving the heat
    const start = performance.now() + 1800, dur = 8000;
    const tick = (now) => {
      const f = Math.min(1, Math.max(0, (now - start) / dur));
      const t = HOT - (HOT - 20) * (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2);
      slider.value = String(t);
      render(t);
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
}
