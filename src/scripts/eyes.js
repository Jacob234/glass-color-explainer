// eyes.js — the instruments for the showroom, other eyes (components/Observers.astro): the light
// table split between the page's eye and another, and a glass against its smooth twin.
// Physics in observers.js; the glass is the light table's, under whatever lamp the page is lit by.
import optics from '../data/optics.json';
import { GRID, SPECTRAL, colorantDensity, transmission, upsample, encode, css } from './spectra.js';
import { LAMP, underLamp } from './lamps.js';
import * as u from './uranium.js';
import { EYES, EYE, seenBy, curvesOf, mediaTransmission } from './observers.js';
import { linToLab, deltaE00 } from './fit.js';

const $ = (id) => document.getElementById(id);
const DENS = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
const mixT = (parts) => transmission(parts.map(([id, c]) => [DENS[id], c]));
const dE = (a, b) => deltaE00(linToLab(a.lin), linToLab(b.lin));
const at = (nm) => (nm - 380) / 5;

// The light table's pieces, at the same strengths (home.js lightTable).
const PIECES = [
  { id: 'cobalt', lab: 'cobalt', T: mixT([['cobalt', 0.9]]) },
  { id: 'gold', lab: 'gold ruby', T: mixT([['gold-colloid', 1.1]]) },
  { id: 'cds', lab: 'cadmium yellow', T: mixT([['cds', 1]]) },
  { id: 'chromium', lab: 'chromium', T: mixT([['chromium', 1.2]]) },
  { id: 'copper', lab: 'copper', T: mixT([['copper', 1]]) },
  { id: 'manganese', lab: 'manganese', T: mixT([['manganese', 1.3]]) },
  { id: 'neodymium', lab: 'neodymium', T: mixT([['neodymium', 1]]) },
  { id: 'uranium', lab: 'uranium', T: u.transmissionOnGrid(), uranium: true },
];
// The lamps the split table compares: the broadband ones and the two the eye partly adapts to.
const TABLE_LAMPS = ['daylight', 'tungsten', 'led', 'tube'];

export function initEyes({ getLamp, onLamp }) {
  let eye = EYE.cones, age = 70, field = 2, pick = PIECES.find((p) => p.id === 'neodymium');
  const opts = () => ({ age, field });
  // Uranium also gives light out; under a dark lamp the eye is set by its glow (as in lamps.js).
  const look = (p, e, lamp = getLamp(), o = opts()) => {
    const F = p.uranium ? u.fluorescence(lamp.ext) : null;
    return seenBy(p.T, lamp, e, { ...o, emitted: F, ref: lamp.dark ? u.fluorescence(lamp.ext) : null });
  };

  /* ---------- the table, split ---------- */
  const table = $('eyeTable');
  const tiles = PIECES.map((p) => {
    const el = document.createElement('figure');
    el.className = 'eye-piece';
    el.innerHTML = '<div class="eye-disc"><i class="l"></i><i class="r"></i></div><figcaption><span></span><b></b></figcaption>';
    el.querySelector('span').textContent = p.lab;
    table.appendChild(el);
    return { p, el, l: el.querySelector('.l'), r: el.querySelector('.r'), d: el.querySelector('b') };
  });

  const picker = $('eyePick'), ageIn = $('eyeAge'), fieldIn = $('eyeField');
  const buttons = EYES.map((e) => {
    const b = document.createElement('button');
    b.className = 'chip chip-plain';
    b.textContent = e.label;
    b.addEventListener('click', () => { eye = e; render(); });
    picker.appendChild(b);
    return [e, b];
  });
  ageIn.addEventListener('input', () => { age = ageIn.valueAsNumber; render(); });
  fieldIn.addEventListener('input', () => { field = fieldIn.valueAsNumber; render(); });

  function renderTable() {
    const lamp = getLamp(), rows = tiles.map((t) => {
      const a = look(t.p, EYE.standard), b = look(t.p, eye);
      t.l.style.background = a.css; t.r.style.background = b.css;
      const d = dE(a, b);
      t.d.textContent = d < 0.05 ? 'same' : `ΔE ${d.toFixed(1)}`;
      return [t.p, d];
    });
    for (const [e, b] of buttons) b.setAttribute('aria-pressed', String(e === eye));
    const cone = eye.kind === 'lms';
    for (const [ctl, input] of [[$('ageCtl'), ageIn], [$('fieldCtl'), fieldIn]]) { ctl.classList.toggle('off', !cone); input.disabled = !cone; }
    $('eyeAgeOut').textContent = cone ? `${age} years` : 'n/a';
    $('eyeFieldOut').textContent = cone ? `${field}°` : eye.id === 'wide' ? '10°' : '2°';

    const sorted = rows.slice().sort((x, y) => y[1] - x[1]);
    let text = eye.note;
    if (eye !== EYE.standard) {
      const [top, low] = [sorted[0], sorted[sorted.length - 1]];
      text += ` Under ${lamp.id === 'daylight' ? 'daylight' : `the ${lamp.label}`}, ${top[0].lab} changes most (ΔE ${top[1].toFixed(1)}) and ${low[0].lab} least (${low[1].toFixed(1)}); 1 is a just-noticeable difference side by side.`;
    }
    if (cone) {
      const m = mediaTransmission(opts())[at(450)], young = mediaTransmission({ age: 20, field })[at(450)];
      text += ` At ${age}, the lens and macula pass ${Math.round(100 * m)}% of 450 nm blue (${Math.round(100 * young)}% at 20). Adaptation takes most of that back, which is why white stays white.`;
    }
    $('eyeRead').textContent = text;
  }

  /* ---------- the twin ---------- */
  // Each glass's twin: the smoothest spectrum (spectra.js upsample) with the same color for the
  // page's eye in daylight. Fitted once per glass. Uranium is left out: its glow is not a filter.
  const twins = new Map();
  const twinOf = (p) => {
    if (!twins.has(p.id)) twins.set(p.id, upsample(underLamp(p.T, LAMP.daylight).rgb, LAMP.daylight.spd));
    return twins.get(p.id);
  };
  const tp = $('twinPick');
  const twinButtons = PIECES.filter((p) => !p.uranium).map((p) => {
    const b = document.createElement('button');
    b.className = 'chip chip-plain';
    b.textContent = p.lab;
    b.addEventListener('click', () => { pick = p; renderTwin(); });
    tp.appendChild(b);
    return [p, b];
  });

  // The split table: rows are eyes (the cone eyes at the chosen age and field), columns lamps.
  const splits = $('splits');
  const head = splits.createTHead().insertRow();
  head.appendChild(document.createElement('th'));
  for (const id of TABLE_LAMPS) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = LAMP[id].label.replace('fluorescent ', ''); head.appendChild(th); }
  const body = splits.createTBody();
  const cells = EYES.map((e) => {
    const tr = body.insertRow(), th = document.createElement('th');
    th.scope = 'row'; th.textContent = e.label; tr.appendChild(th);
    return [e, tr, TABLE_LAMPS.map(() => tr.insertCell())];
  });

  const plot = $('eyePlot');
  function renderTwin() {
    const lamp = getLamp(), twin = twinOf(pick), twinPiece = { ...pick, T: twin, uranium: false };
    const a = look(pick, eye), b = look(twinPiece, eye);
    $('twinGlass').style.setProperty('--c', a.css); $('twinSmooth').style.setProperty('--c', b.css);
    $('twinGlassTag').textContent = pick.lab;
    for (const [p, btn] of twinButtons) btn.setAttribute('aria-pressed', String(p === pick));

    const grid = cells.map(([e, tr, tds]) => {
      tr.classList.toggle('on', e === eye);
      return tds.map((td, j) => {
        const L = LAMP[TABLE_LAMPS[j]], d = dE(look(pick, e, L), look(twinPiece, e, L));
        td.textContent = d.toFixed(1);
        td.style.setProperty('--v', Math.min(1, d / 10).toFixed(3));
        td.classList.toggle('on', L === lamp);
        td.classList.toggle('dark', d > 5.5);
        return d;
      });
    });
    const here = dE(a, b), byEye = Math.max(...grid.slice(0, 3).map((r) => r[0])), byLamp = Math.max(...grid[0]);
    const lampName = lamp.id === 'daylight' ? 'daylight' : `the ${lamp.label}`;
    let text = `${eye === EYE.standard ? 'The page’s eye' : `The eye you picked (${eye.label})`} sees ${pick.lab} and its twin ${here < 1 ? 'as a match' : here < 3 ? 'as just different' : 'as clearly different'} under ${lampName} (ΔE ${here.toFixed(1)}).`;
    text += ` In daylight, changing only the eye between the three trichromats splits the pair by up to ${byEye.toFixed(1)}; changing only the lamp, for the page's own eye, by up to ${byLamp.toFixed(1)}.`;
    if (lamp.dark || lamp.lines) text += ` (${lamp.dark ? 'Under the black light almost no visible light reaches either glass.' : 'Under the sodium lamp every glass is one orange, so no eye can tell them apart by hue.'})`;
    $('twinRead').textContent = text;
    drawPlot(pick.T, twin);
  }

  // The glass's transmission, filled with the colors it passes; its twin, dashed; the eye's three
  // curves in ink (a missing cone faint), and for cone eyes what the lens and macula let through.
  function drawPlot(T, twin) {
    const r = plot.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), hgt = Math.max(1, Math.round(r.height * dpr));
    if (plot.width !== w || plot.height !== hgt) { plot.width = w; plot.height = hgt; }
    const ctx = plot.getContext('2d'), n = GRID.length, pad = 14 * dpr, H = hgt - pad - 4 * dpr;
    const x = (i) => ((i + 0.5) / n) * w, y = (v) => hgt - 2 * dpr - v * H;
    ctx.clearRect(0, 0, w, hgt);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = css(SPECTRAL[i].map((v) => encode(1 - 0.7 * (1 - Math.min(1, v * 1.4))))); // pale: the curves sit on it
      const x0 = Math.floor((i / n) * w), x1 = Math.ceil(((i + 1) / n) * w);
      ctx.fillRect(x0, y(T[i]), x1 - x0, y(0) - y(T[i]));
    }
    const line = (vals, { width = 1.4, dash = [], alpha = 1 } = {}) => {
      ctx.save(); ctx.strokeStyle = `rgba(20, 20, 20, ${alpha})`; ctx.lineWidth = width * dpr; ctx.setLineDash(dash.map((d) => d * dpr));
      ctx.beginPath(); vals.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)))); ctx.stroke(); ctx.restore();
    };
    line(T, { width: 1, alpha: 0.45 });
    line(twin, { width: 1.6, dash: [5, 4] });
    if (eye.kind === 'lms') line(mediaTransmission(opts()), { width: 1, dash: [1, 3], alpha: 0.8 });
    const curves = curvesOf(eye, opts());
    ctx.font = `${11 * dpr}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
    curves.forEach((c, k) => {
      const gone = k === eye.missing;
      line(c, { width: gone ? 1 : 1.8, dash: gone ? [2, 4] : [], alpha: gone ? 0.35 : 0.95 });
      const i = c.indexOf(Math.max(...c));
      ctx.fillStyle = `rgba(20, 20, 20, ${gone ? 0.4 : 0.95})`;
      ctx.fillText(eye.names[k], x(i), y(c[i]) - 4 * dpr);
    });
    $('plotKey').textContent = eye.kind === 'lms'
      ? 'filled: the glass · dashed: its twin · lines: the cones · dotted: lens and macula'
      : 'filled: the glass · dashed: its twin · lines: the eye';
  }

  function render() { renderTable(); renderTwin(); }
  render();
  onLamp(render);
  addEventListener('resize', () => drawPlot(pick.T, twinOf(pick)));
}
