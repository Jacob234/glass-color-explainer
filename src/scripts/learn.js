// learn.js — concept pages with depth in side panes (src/pages/learn/[id].astro), and the
// Beer–Lambert instrument of concept E1. Colors use the site's engine: optics.json density,
// Beer–Lambert, CIE D65, CIE 1931 2°, sRGB.
import optics from '../data/optics.json' with { type: 'json' };
import { GRID, SPECTRAL, colorantDensity, transmission, spectrumColor, css, encode } from './spectra.js';
import { LAMP } from './lamps.js';
import { weightPercent } from './measured-spectra.js';

const PHONE = '(max-width: 860px)';
const DEPTH_KEY = 'learn-depth-all';
const isPhone = () => matchMedia(PHONE).matches;

// ---- panes ----
function panes(root) {
  const stack = []; // open sheets on a phone, for the back gesture
  let pending = 0; // history traversals sent and not yet answered by popstate
  let skip = 0; // popstates that answer a bulk unwind, not a single close
  const setOpen = (blk, level, open) => {
    const pane = blk.querySelector(`.pane.${level}`);
    const btn = blk.querySelector(`[data-open="${level}"]`);
    if (!pane) return;
    pane.hidden = !open;
    btn?.setAttribute('aria-expanded', String(open));
    blk.classList.toggle(`${level}-open`, open);
    if (level === 'l2' && !open) setOpen(blk, 'l3', false);
  };
  const open = (blk, level) => {
    setOpen(blk, level, true);
    if (isPhone() && !(level === 'l2' && document.body.classList.contains('depth-all'))) {
      stack.push([blk, level]);
      history.pushState({ pane: `${blk.id}-${level}` }, '');
      blk.querySelector(`.pane.${level} .close`)?.focus();
    }
  };
  const close = (blk, level) => {
    const top = stack.at(-1);
    if (top && top[0] === blk && top[1] === level) { // popstate closes it
      if (!pending) { pending = 1; history.back(); } // a second close before popstate would leave the page
      return;
    }
    setOpen(blk, level, false);
  };
  addEventListener('popstate', () => {
    pending = 0;
    if (skip) { skip = 0; return; }
    const top = stack.pop();
    if (top) { setOpen(top[0], top[1], false); top[0].querySelector(`[data-open="${top[1]}"]`)?.focus(); }
  });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open], [data-close]');
    if (!t) return;
    const blk = t.closest('.blk');
    if (t.dataset.open) {
      const level = t.dataset.open;
      if (blk.classList.contains(`${level}-open`) && !isPhone()) close(blk, level); else open(blk, level);
    } else close(blk, t.dataset.close);
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = stack.at(-1);
    if (top) close(top[0], top[1]);
  });
  // "open the numbers everywhere"
  const all = root.querySelector('[data-depth-all]');
  const applyAll = (on) => {
    // Unwind any sheets opened one at a time, so Back never points at a pane the toggle changed.
    if (stack.length) { skip = 1; pending = 1; history.go(-stack.length); stack.length = 0; }
    document.body.classList.toggle('depth-all', on);
    for (const blk of root.querySelectorAll('.blk')) { setOpen(blk, 'l3', false); setOpen(blk, 'l2', on); }
  };
  let saved = false;
  try { saved = localStorage.getItem(DEPTH_KEY) === '1'; } catch { /* storage blocked */ }
  if (all) {
    all.checked = saved;
    if (saved) applyAll(true);
    all.addEventListener('change', () => {
      applyAll(all.checked);
      try { localStorage.setItem(DEPTH_KEY, all.checked ? '1' : '0'); } catch { /* storage blocked */ }
    });
  }
}

// ---- E1: Beer–Lambert instrument ----
const COBALT = optics.colorants.find((c) => c.id === 'cobalt');
const DENS = colorantDensity(COBALT, optics.wavelengths); // decadic density per reference path (10 mm) at amount 1
const I595 = GRID.indexOf(595);
const EPS_595 = 175; // L mol⁻¹ cm⁻¹, Thiemsorn et al. 2007 (the calibration measured.json scales cobalt to)
export const molPerL = (amount) => (amount * DENS[I595]) / EPS_595; // Co²⁺ concentration the engine's amount stands for
export const thicknessMm = (v) => 0.5 * 100 ** (v / 100); // slider 0..100 → 0.5..50 mm, logarithmic
export const amountOf = (v) => 0.25 * 16 ** (v / 100); // slider 0..100 → 0.25..4 × reference
export function cobaltAt(amount, mm) {
  const T = transmission([[DENS, amount]], mm / 10);
  const A595 = DENS[I595] * amount * (mm / 10);
  return { T, A595, color: spectrumColor(T, LAMP.daylight.spd, LAMP.daylight.adapt).css };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (name, attrs, text) => {
  const n = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text) n.textContent = text;
  return n;
};
function plot(svg, T) {
  const W = 420, H = 200, x = (i) => 30 + (i / (GRID.length - 1)) * (W - 40), y = (t) => 14 + (1 - t) * (H - 50);
  const label = { 'font-size': 10, 'font-family': 'IBM Plex Mono', fill: '#5d605b' };
  const nodes = [
    el('line', { x1: 30, x2: W - 10, y1: y(0), y2: y(0), stroke: '#d6d8d2' }),
    el('line', { x1: 30, x2: W - 10, y1: y(1), y2: y(1), stroke: '#d6d8d2' }),
    el('text', { x: 4, y: y(1) + 4, ...label }, '1'),
    el('text', { x: 4, y: y(0) + 4, ...label }, '0'),
    ...GRID.map((_, i) => el('rect', { x: x(i).toFixed(1), y: H - 28, width: (W - 40) / (GRID.length - 1) + 0.6, height: 8, fill: css(SPECTRAL[i].map(encode)) })),
    el('text', { x: 30, y: H - 6, ...label }, '380 nm'),
    el('text', { x: W - 10, y: H - 6, 'text-anchor': 'end', ...label }, '780 nm'),
    el('line', { x1: x(I595), x2: x(I595), y1: y(1), y2: y(0), stroke: '#8d908a', 'stroke-dasharray': '3 3' }),
    el('polyline', { points: T.map((t, i) => `${x(i).toFixed(1)},${y(t).toFixed(1)}`).join(' '), fill: 'none', stroke: '#141414', 'stroke-width': 1.6 }),
  ];
  svg.replaceChildren(...nodes);
}

function instrument(root) {
  const fig = root.querySelector('[data-instrument]');
  if (!fig) return;
  const t = fig.querySelector('[data-t]'), c = fig.querySelector('[data-c]');
  const plots = [...root.querySelectorAll('[data-tplot] svg')];
  const wt = weightPercent('cobalt');
  const draw = () => {
    const mm = thicknessMm(+t.value), amount = amountOf(+c.value);
    const { T, A595, color } = cobaltAt(amount, mm);
    fig.querySelector('[data-swatch]').style.background = color;
    fig.querySelector('[data-swatch-label]').textContent = `${mm < 10 ? mm.toFixed(1) : mm.toFixed(0)} mm`;
    fig.querySelector('[data-out="t"]').textContent = `${mm < 10 ? mm.toFixed(1) : mm.toFixed(0)} mm`;
    const mol = molPerL(amount);
    fig.querySelector('[data-out="c"]').textContent = `${(wt * amount).toFixed(3)} wt% CoO · ${mol.toFixed(3)} mol/L Co²⁺`;
    const pass = 100 * 10 ** -A595;
    const cd = mol * (mm / 10);
    fig.querySelector('[data-pass]').textContent = `${pass >= 1 ? pass.toFixed(pass >= 10 ? 0 : 1) : pass.toPrecision(2)}%`;
    fig.querySelector('[data-acd]').textContent = `A = ${A595.toFixed(2)} · c·d = ${cd.toPrecision(2)} mol/L·cm`;
    for (const svg of plots) plot(svg, T);
    for (const cap of root.querySelectorAll('[data-tplot-cap]')) cap.textContent = `transmission T(λ), 380–780 nm, ${mm < 10 ? mm.toFixed(1) : mm.toFixed(0)} mm of ${mol.toFixed(3)} mol/L Co²⁺; dashed line 595 nm`;
  };
  t.addEventListener('input', draw);
  c.addEventListener('input', draw);
  draw();
}

export function initLearn() {
  const root = document.querySelector('[data-learn]');
  if (!root) return;
  panes(root);
  instrument(root);
}
