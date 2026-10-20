// LycurgusFlip: front-lit (light the particles scatter back) vs back-lit (light that gets through).
// Both colors come from one Mie calculation for 70:30 silver-gold spheres (strike.js LYCURGUS):
// R is the scattered light seen from the lamp's side, T the transmitted light. The cup's shading
// uses thinner and thicker paths through the same glass, so it is computed too.
import { LAMP, underLamp } from '../lamps.js';
import { lycurgus, LYCURGUS } from '../strike.js';

const day = (S) => underLamp(S, LAMP.daylight).css;

export function lycurgusColors(mm = LYCURGUS.mm) {
  const thin = lycurgus(mm * 0.5), mid = lycurgus(mm), thick = lycurgus(mm * 1.8);
  const lift = (R) => R.map((v) => Math.min(1, v * 2.5)); // front-lit against black: brightened 2.5×
  return {
    front: { light: day(lift(thick.R)), dark: day(lift(thin.R)) },
    back: { light: day(thin.T), dark: day(thick.T), mid: day(mid.T) },
  };
}

const CAPTIONS = {
  front: 'Front-lit: the 50–100 nm silver-gold particles scatter light back toward you, more of it green and yellow than red or blue, so the cup looks opaque and greenish. The model gives a sage green, paler than the jade of photographs.',
  back: 'Back-lit: the same particles absorb and scatter the blue and green out of the light coming through, so the cup glows red.',
};

export function initLycurgusFlip(root) {
  const stage = root.querySelector('.lyc-stage');
  const cup = root.querySelector('.lyc-cup');
  const caption = root.querySelector('.lyc-caption');
  const buttons = root.querySelectorAll('.lyc-buttons button');
  const c = lycurgusColors();
  const MODES = {
    front: { cup: `radial-gradient(circle at 45% 35%, ${c.front.light}, ${c.front.dark} 75%)`, bg: '#141414' },
    back: { cup: `radial-gradient(circle at 50% 45%, ${c.back.light}, ${c.back.mid} 45%, ${c.back.dark} 85%)`, bg: '#f4f4f0' },
  };
  function select(id) {
    stage.style.background = MODES[id].bg;
    cup.style.background = MODES[id].cup;
    caption.textContent = CAPTIONS[id];
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  }
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
  select('front');
}
