// StrikingSlider: heat-treatment progress slider -> swatch color + stage label,
// interpolating through the striking sequence in optics.json.

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function strikeColor(seq, t) {
  let lo = seq[0], hi = seq[seq.length - 1];
  for (let i = 0; i < seq.length - 1; i++) {
    if (t >= seq[i].t && t <= seq[i + 1].t) { lo = seq[i]; hi = seq[i + 1]; break; }
  }
  const span = hi.t - lo.t || 1;
  const f = (t - lo.t) / span;
  const a = hexToRgb(lo.color), b = hexToRgb(hi.color);
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return { color: `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`, label: f < 0.5 ? lo.label : hi.label };
}

export function initStrikingSlider(root, optics) {
  const seq = optics.striking[root.dataset.sequence];
  const slider = root.querySelector('input[type=range]');
  const swatch = root.querySelector('.stk-swatch');
  const label = root.querySelector('.stk-label');
  const update = () => {
    const { color, label: text } = strikeColor(seq, slider.value / 100);
    swatch.style.background = color;
    label.textContent = text;
  };
  slider.addEventListener('input', update);
  update();
}
