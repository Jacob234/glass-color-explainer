// qn-lab.js — the Structure Lab's network figure: Qⁿ in binary alkali silicate glass against mol%
// alkali, one model at a time, with the ²⁹Si NMR the statistical-mechanics model was fitted to.
import * as qn from '../qn.js';
import * as qp from '../qn-plot.js';

const NAME = { Na2O: 'soda', K2O: 'potash' };
const MODEL = {
  sm: 'statistical mechanics',
  random: 'the random model',
  binary: 'the binary model',
};

export function initQnLab(root) {
  const svg = root.querySelector('svg'), read = root.querySelector('.qn-read');
  const F = qp.frame({ x0: 0, x1: 60, ticks: [0, 10, 20, 30, 40, 50, 60], fmt: (t) => `${t}%`, xlabel: 'mol% alkali oxide' });
  const live = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.replaceChildren(F.g, live);
  const series = {}, misses = {};
  let ox = 'Na2O', model = 'sm';

  function render() {
    for (const c of root.querySelectorAll('[data-ox]')) c.setAttribute('aria-pressed', String(c.dataset.ox === ox));
    for (const c of root.querySelectorAll('[data-m]')) c.setAttribute('aria-pressed', String(c.dataset.m === model));
    series[ox] ??= qn.binarySeries(ox, 60, 0.5);
    misses[ox] ??= Object.fromEntries(Object.keys(MODEL).map((m) => [m, qn.nmrMiss(ox, m)]));
    const rows = series[ox].map((r) => ({ x: r.x, Q: r[model] }));
    const items = [
      ...qp.rule(F, 33.3, 'disilicate', { faint: true, anchor: 'end' }),
      ...qp.rule(F, 50, 'metasilicate', { faint: true, anchor: 'end' }),
      ...qp.curves(F, rows, { cls: 'ln' }),
      ...qp.points(F, qn.NMR[ox]),
    ];
    live.replaceChildren(...items);
    const m = misses[ox], tf = (x) => Math.round(series[ox].find((r) => r.x === x).Tf - 273.15);
    read.textContent = `Against the NMR for ${NAME[ox]}–silica glass, ${MODEL[model]} misses by ${m[model].toFixed(1)} percentage points (root mean square over every species and glass); `
      + `statistical mechanics ${m.sm.toFixed(1)}, binary ${m.binary.toFixed(1)}, random ${m.random.toFixed(1)}. `
      + (model === 'sm'
        ? `Each glass is frozen at its own Tg from the oxide bench's viscosity model, ${tf(20)} °C at 20% and ${tf(50)} °C at 50%. That model was fitted mostly to commercial glasses, so past about a third alkali its Tg is an extrapolation; the fit hardly depends on it (holding every glass at 527 °C instead changes the miss by under a point). The enthalpies were fitted to these same points, so the close fit shows the model can describe them, not that it predicts new glasses.`
        : model === 'random'
          ? 'If every bridge were equally likely to break, Q² and Q¹ would appear from the first addition of alkali. They do not: real glasses keep far more Q³ and far less of the extremes.'
          : 'If each silicon had to be broken once before any was broken twice, the curves would be straight lines meeting at the disilicate and metasilicate compositions. Real glasses are close but rounded: some Q² appears before the last Q⁴ is gone.');
  }
  root.querySelectorAll('[data-ox]').forEach((c) => c.addEventListener('click', () => { ox = c.dataset.ox; render(); }));
  root.querySelectorAll('[data-m]').forEach((c) => c.addEventListener('click', () => { model = c.dataset.m; render(); }));
  render();
}
