// LycurgusFlip: front-lit (scattering, opaque green) vs back-lit (transmission, glowing red).
const MODES = {
  front: {
    cup: 'radial-gradient(circle at 45% 35%, #6aa87a, #2c5a3a 70%)',
    bg: '#1c1c22',
    caption: 'Front-lit: the ~70 nm gold-silver particles scatter green light back at you — the cup reads opaque pea-green.',
  },
  back: {
    cup: 'radial-gradient(circle at 50% 45%, #ff7a6a, #8a1420 75%)',
    bg: '#f4ead8',
    caption: 'Back-lit: light passing through is filtered by the colloid’s absorption — the cup glows translucent red.',
  },
};

export function initLycurgusFlip(root) {
  const stage = root.querySelector('.lyc-stage');
  const cup = root.querySelector('.lyc-cup');
  const caption = root.querySelector('.lyc-caption');
  const buttons = root.querySelectorAll('.lyc-buttons button');
  function select(id) {
    const m = MODES[id];
    stage.style.background = m.bg;
    cup.style.background = m.cup;
    caption.textContent = m.caption;
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  }
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.id)));
  select('front');
}
