// StrikingSlider: heat-treatment slider -> particle or crystal size -> spectrum -> swatch color.
// "metals": gold, silver or copper spheres through Mie theory (strike.js, mie.js), with the light the
// same glass scatters back when lit from the front. "selenium": a CdS–CdSe band edge that moves as
// the crystals grow (the Brus model in strike.js). Colors are integrated under CIE daylight.
import { bandEdge } from '../spectra.js';
import { LAMP, underLamp } from '../lamps.js';
import { struck, phase, brusGap, crystalRadius } from '../strike.js';

const day = (T) => underLamp(T, LAMP.daylight).css;
const nm = (r) => (r < 10 ? r.toFixed(1) : Math.round(r));

const METAL_NOTES = {
  Au: 'Gold resonates in the green, so a struck gold glass is ruby.',
  Ag: 'Silver resonates in the violet, so it is yellow; coarse silver goes amber and brown.',
  Cu: 'Copper resonates near 575 nm, a weak band on top of copper\u2019s own absorption of the blue, so copper ruby is dark: at full thickness it is nearly black.',
};

export function metalsView(id, t) {
  const g = struck(id, t), stage = phase(t);
  const size = g.p < 0.01 ? 'no particles yet'
    : `radius ${nm(g.r)} nm · ${g.peak ? `band peak ${g.peak} nm` : 'no distinct band'} · ${Math.round(100 * g.scatter)}% scattered`;
  return { color: day(g.T), front: day(g.R.map((v) => Math.min(1, v * 4))), label: `${stage} · ${size}`, note: METAL_NOTES[id] };
}

export function seleniumView(t) {
  const r = crystalRadius(t), eV = brusGap(r), edge = Math.round(1240 / eV);
  return { color: day(bandEdge(eV)), label: `crystal radius ${r.toFixed(1)} nm · gap ${eV.toFixed(2)} eV · absorbs below ${edge} nm` };
}

export function initStrikingSlider(root) {
  const metals = root.dataset.sequence === 'metals';
  const slider = root.querySelector('input[type=range]');
  const swatch = root.querySelector('.stk-swatch'), front = root.querySelector('.stk-front');
  const label = root.querySelector('.stk-label'), note = root.querySelector('.stk-note');
  const buttons = root.querySelectorAll('.stk-metals button');
  let metal = 'Au';
  const update = () => {
    const t = slider.value / 100, v = metals ? metalsView(metal, t) : seleniumView(t);
    swatch.style.background = v.color;
    if (front) front.style.background = v.front;
    label.textContent = v.label;
    if (note) note.textContent = v.note;
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.id === metal));
  };
  buttons.forEach((b) => b.addEventListener('click', () => { metal = b.dataset.id; update(); }));
  slider.addEventListener('input', update);
  update();
}
