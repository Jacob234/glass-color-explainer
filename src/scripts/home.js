// home.js — the instruments on the home page. Every glass colour is computed from absorption
// spectra in optics.json through spectra.js; nothing here is a hand-picked colour.
import optics from '../data/optics.json';
import history from '../data/history.json';
import {
  GRID, toGrid, spectrumColor, densityOnGrid, transmission, glow, glowStrength,
  SPECTRAL, bandEdge, dichroicBand, encode, css,
} from './spectra.js';
import * as na from './flare.js';

const DAY = toGrid(optics.wavelengths, optics.illuminants.find((i) => i.id === 'daylight').spd);
const COLORANT = Object.fromEntries(optics.colorants.map((c) => [c.id, c]));
const DENS = Object.fromEntries(optics.colorants.map((c) => [c.id, densityOnGrid(optics.wavelengths, c.absorbance)]));
const ONES = GRID.map(() => 1);
const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const tColor = (T) => spectrumColor(T, DAY);
const mixT = (parts, thickness = 1) => transmission(parts.map(([id, c]) => [DENS[id], c]), thickness);
const colorOf = (parts, thickness = 1) => tColor(mixT(parts, thickness));

// A spectrum strip: light in (top band) and light out (bottom band, with its curve drawn on).
function strip(canvas, top, bottom) {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d'), n = GRID.length;
  const half = Math.round(h * 0.42), gap = Math.round(h * 0.08);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const x0 = Math.floor((i / n) * w), x1 = Math.ceil(((i + 1) / n) * w);
    ctx.fillStyle = css(SPECTRAL[i].map((v) => encode(v * top[i])));
    ctx.fillRect(x0, 0, x1 - x0, half);
    ctx.fillStyle = css(SPECTRAL[i].map((v) => encode(v * bottom[i])));
    ctx.fillRect(x0, half + gap, x1 - x0, h - half - gap);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * w, y = h - 3 * dpr - bottom[i] * (h - half - gap - 6 * dpr);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

// Colors an isometric slab (components/Slab.astro): thin path on the face, long path on the edges.
function slab(svg) {
  const face = svg.querySelector('.face'), cast = svg.querySelector('.cast'), edges = svg.querySelectorAll('.edge');
  return (faceColor, edgeColor) => {
    face.setAttribute('fill', faceColor); cast.setAttribute('fill', faceColor);
    for (const e of edges) e.setAttribute('fill', edgeColor);
  };
}

// Build an element: h('span', { className: 'x', style: { '--c': red } }, 'text', child).
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...children);
  return el;
}

function chips(box, ids, label, onPick) {
  for (const id of ids) {
    const b = h('button', { className: 'chip' }, h('i', { style: { '--c': colorOf([[id, 1]], 1.2).css } }), label(id));
    b.dataset.id = id;
    b.addEventListener('click', () => onPick(id));
    box.appendChild(b);
  }
  return (cur) => { for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === cur)); };
}

/* ---------- the light table ---------- */
function lightTable() {
  const table = $('table');
  const shard = (pts) => `polygon(${pts})`;
  const pieces = [
    { lab: 'cobalt', parts: [['cobalt', 0.9]], x: 0.08, y: 0.10, s: 0.30, r: '50%' },
    { lab: 'gold ruby', parts: [['gold-colloid', 1.1]], x: 0.19, y: 0.30, s: 0.30, clip: shard('8% 18%, 62% 0%, 100% 46%, 78% 100%, 14% 84%') },
    { lab: 'cadmium yellow', parts: [['cds', 1]], x: 0.52, y: 0.12, s: 0.26, r: '50% 50% 50% 8%' },
    { lab: 'chromium', parts: [['chromium', 1.2]], x: 0.60, y: 0.32, s: 0.24, clip: shard('0% 30%, 46% 0%, 100% 22%, 88% 92%, 26% 100%') },
    { lab: 'copper', parts: [['copper', 1]], x: 0.07, y: 0.62, s: 0.20, r: '6px' },
    { lab: 'manganese', parts: [['manganese', 1.3]], x: 0.82, y: 0.10, s: 0.18, r: '50%' },
    { lab: 'neodymium', parts: [['neodymium', 1.6]], x: 0.38, y: 0.56, s: 0.17, clip: shard('50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%') },
  ];
  let z = 10;
  const els = pieces.map((p) => {
    const g = h('div', { className: 'g' });
    const el = h('div', { className: 'piece' + (p.r === '50%' ? ' round' : '') }, g, h('span', { className: 'lab' }, p.lab));
    g.style.setProperty('--c', colorOf(p.parts).css);
    if (p.clip) g.style.setProperty('--clip', p.clip);
    if (p.r) g.style.setProperty('--r', p.r);
    table.appendChild(el);
    return { el, p };
  });
  function layout() {
    const w = table.clientWidth, h = table.clientHeight, base = Math.min(w * 0.9, h * 1.25);
    for (const { el, p } of els) {
      const s = Math.max(70, p.s * base * 0.92);
      el.style.width = el.style.height = `${s}px`;
      el.style.left = `${Math.min(w - s, p.x * w)}px`;
      el.style.top = `${Math.min(h - s - 18, p.y * h)}px`;
    }
  }
  layout();
  addEventListener('resize', layout);
  for (const { el, p } of els) {
    let dragging = null; // one pointer drags a piece at a time
    el.addEventListener('pointerdown', (e) => {
      if (dragging !== null) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); el.style.zIndex = ++z;
      dragging = e.pointerId;
      const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop;
      const move = (ev) => {
        if (ev.pointerId !== dragging) return;
        const x = Math.max(-el.offsetWidth * 0.4, Math.min(table.clientWidth - el.offsetWidth * 0.6, ev.clientX - ox));
        const y = Math.max(-el.offsetHeight * 0.4, Math.min(table.clientHeight - el.offsetHeight * 0.6, ev.clientY - oy));
        el.style.left = `${x}px`; el.style.top = `${y}px`;
        p.x = x / table.clientWidth; p.y = y / table.clientHeight;
      };
      const up = (ev) => {
        if (ev.pointerId !== dragging) return;
        dragging = null;
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }
}

/* ---------- 01 the batch: face versus edge ---------- */
function batch() {
  const draw = slab($('slab1')), s = $('iron');
  const render = () => {
    const c = (s.valueAsNumber / 100) ** 1.5 * 0.6, parts = [['iron-ferrous', c * 0.6], ['iron-ferric', c * 0.4]];
    draw(colorOf(parts, 0.5).css, colorOf(parts, 20).css);
    $('ironOut').textContent = c < 0.02 ? 'almost none' : c < 0.12 ? 'a trace' : c < 0.3 ? 'window glass' : 'a lot';
    $('ironRead').textContent = c < 0.02
      ? 'Low-iron glass stays nearly colourless even edge on. It is used where the green would show: display cases, solar panels, aquariums.'
      : 'Face on, the light crosses a thin sheet and barely changes. Edge on, it crosses forty times as much glass, and the same iron reads as green.';
  };
  s.addEventListener('input', render); render();
}

/* ---------- 02 the melt: redox ---------- */
function redox() {
  const draw = slab($('slab2')), s = $('redoxR');
  const render = () => {
    const r = s.valueAsNumber / 100, parts = [['iron-ferrous', 0.9 * r], ['iron-ferric', 1.6 * (1 - r)]];
    draw(colorOf(parts, 1).css, colorOf(parts, 6).css);
    $('redoxOut').textContent = `${Math.round(r * 100)}% Fe²⁺`;
    $('redoxRead').textContent = r > 0.65 ? 'Reducing flame: most iron is Fe²⁺, absorbing in the red and near infrared. Blue-green.'
      : r < 0.3 ? 'Oxidizing flame: most iron is Fe³⁺, absorbing violet and blue. A pale straw yellow.'
      : 'A mix of both ions. Each subtracts its own band, and the result is a muddy olive.';
  };
  s.addEventListener('input', render); render();
}

/* ---------- 03 the colour rod: ions ---------- */
const ROD_NOTES = {
  cobalt: 'Co²⁺ absorbs across orange and red in three overlapping bands. A tiny amount is enough: cobalt is among the strongest colorants in glass.',
  copper: 'Cu²⁺ absorbs a broad band in the red and near infrared, leaving turquoise to blue.',
  chromium: 'Cr³⁺ has two bands, one in the violet and one in the orange-red. What gets through is a green window, the green of old bottle glass.',
  manganese: "Mn³⁺ absorbs in the green and lets red and blue through: amethyst. Glassmakers used it as 'glassmaker's soap' to cancel iron's green.",
  neodymium: 'Nd³⁺ has narrow f-electron lines, sharpest near yellow (around 585 nm). The colour shifts with the light it is viewed under.',
  'iron-ferrous': 'Fe²⁺ absorbs a broad band in the red and near infrared. This is the green-blue of window edges.',
};
function ions() {
  const s = $('conc'), draw = slab($('slab3'));
  let cur = 'cobalt';
  const press = chips($('rods'), Object.keys(ROD_NOTES), (id) => COLORANT[id].label, (id) => { cur = id; render(); });
  function render() {
    const k = 2 ** (s.valueAsNumber / 100), T = mixT([[cur, 1]], k);
    draw(tColor(T).css, colorOf([[cur, 1]], k * 5).css);
    strip($('strip3'), ONES, T);
    $('concOut').textContent = `×${k.toFixed(2)}`;
    $('ionRead').textContent = ROD_NOTES[cur];
    press(cur);
  }
  s.addEventListener('input', render); addEventListener('resize', render); render();
}

/* ---------- 04 the glory hole: incandescence hides colour ---------- */
const HOT = 1150; // °C, soda-lime furnace
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
// The sodium flare's brightness relative to the gather's own glow (illustrative): strong in the
// glory hole's flame, gone once the gather is out of it and below working heat.
const flareRatio = (t) => { const x = Math.min(1, Math.max(0, (t - 820) / 180)); return 6 * x * x * (3 - 2 * x); };

function heat() {
  const s = $('temp'), ids = ['cobalt', 'copper', 'chromium', 'manganese'];
  let cur = 'cobalt', body = colorOf([[cur, 1]], 1.4).rgb, raf = 0;
  const press = chips($('heatRods'), ids, (id) => id, (id) => { cur = id; body = colorOf([[id, 1]], 1.4).rgb; render(s.valueAsNumber); });
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const el = (id) => document.getElementById(id);
  const lens = glasses();
  function render(t) {
    const g = glow(t + 273.15), a = glowStrength(g.luminance);
    const hot = lerp(g.rgb, [1, 0.82, 0.45], a ** 3 * 0.45); // the hottest glass reads yellow-orange
    const col = css(lerp(body, hot, a)), flare = flareRatio(t);
    el('g-body').setAttribute('fill', col);
    el('g-cast').setAttribute('fill', col); el('g-cast').setAttribute('opacity', 0.2 + a * 0.5);
    el('g-halo').setAttribute('fill', css(g.rgb)); el('g-halo').setAttribute('opacity', a * 0.85);
    el('g-rim').setAttribute('opacity', 1 - a * 0.9); // hot glass glows from within; the dark rim appears as it cools
    for (const id of ['g-flare', 'g-flare2']) el(id).setAttribute('opacity', flare / (1 + flare));
    el('g-rig').setAttribute('transform', `translate(${-(1 - t / HOT) * 330} 0)`);
    lens.render({ t, a, body, hot, glowRgb: g.rgb, flare });
    $('tempOut').textContent = String(Math.round(t));
    s.setAttribute('aria-valuetext', `${Math.round(t)} degrees Celsius`);
    $('heatRead').textContent = t > 1000 ? 'In the glory hole. The gather is brighter than any color it carries, and the sodium flare is brighter still.'
      : t > 800 ? 'Working heat. Still orange: you are reading temperature, not color.'
      : t > 525 ? 'Cooling through cherry red. The glow is dimming and the colorant starts to show.'
      : t > 200 ? 'Past the Draper point. The glow is too faint to see; this is the colorant.'
      : `Cooled: ${COLORANT[cur].label}. This is the color it carried all along.`;
    press(cur);
  }
  lens.onChange = () => render(s.valueAsNumber);
  s.addEventListener('input', () => { cancelAnimationFrame(raf); render(s.valueAsNumber); });
  render(HOT);
  // Play the cool-down once, when the scene first comes into view.
  if (!reduceMotion() && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now() + 1200, dur = 7000;
      const tick = (now) => {
        const f = Math.min(1, Math.max(0, (now - t0) / dur)), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        const t = HOT - (HOT - 20) * e;
        s.value = String(t); render(t);
        if (f < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe($('scene'));
  }
}

/* ---------- 04 the glory hole: the glasses ---------- */
// A pair of safety glasses on the scene. Inside the lenses the scene is drawn again, recoloured by
// each lens's transmission: the room by the lens under daylight, the glowing parts by the lens
// against a black body, and the sodium flare by the lens at 589 nm. Each is normalised by the
// lens's luminous transmission, i.e. after the eye has adapted to the dimmer view.
const LENS_NOTES = {
  none: 'Without protection the flare is several times brighter than the glass inside it. The gather is a shape in a yellow blaze.',
  didymium: 'Neodymium and praseodymium cut a notch across 580–595 nm. The flare drops to about 1% and the gather shows through, slightly pink because a little yellow is gone. The near infrared passes almost untouched.',
  shade: 'A second, iron-bearing glass behind the didymium. Fe²⁺ absorbs broadly in the near infrared, the same ion that turns a window edge green, so it costs little visible light but stops most of the heat.',
};
function glasses() {
  const svg = $('scene'), view = $('lens-view'), frame = $('lens-frame'), lensG = $('lens'), shape = $('lens-clip').children; // clip paths take shapes, not groups
  const T5 = (T) => GRID.map((w) => T[na.FINE.indexOf(w)]);
  const naColor = na.lightColor(na.xyz(na.lineSpectrum()));
  svg.style.setProperty('--na', css(naColor));

  // Clone the scene into the lens view, suffixing ids so the clones can be addressed.
  const LUMINOUS = new Set(['g-body', 'g-halo', 'g-cast', 'g-flare', 'g-flare2']);
  for (const node of svg.children) {
    if (node.tagName === 'defs' || node === lensG) continue;
    const c = node.cloneNode(true);
    view.appendChild(c);
  }
  for (const e of view.querySelectorAll('[id]')) e.id += '-L';
  const lumIn = (e) => [...LUMINOUS].some((id) => e.closest(`#${id}-L`));
  for (const e of view.querySelectorAll('rect, line, circle, ellipse, path')) {
    if (lumIn(e)) continue;
    const fill = e.getAttribute('fill') || '';
    e.setAttribute('filter', fill === 'url(#g-hole)' || fill === '#ff7a24' ? 'url(#lens-fire)' : 'url(#lens-room)');
  }
  const L = (id) => document.getElementById(`${id}-L`);

  // Per-lens constants. Channel multipliers are in linear sRGB, normalised to unit luminance.
  const norm = (m) => { const y = lum(m) || 1; return m.map((v) => Math.min(3, v / y)); };
  const linOf = (v) => [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]]
    .map((r) => Math.max(1e-6, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]));
  const FLARE = na.lineSpectrum();
  const lensData = Object.fromEntries(Object.entries(na.LENSES).map(([id, { label, T }]) => {
    const paper = spectrumColor(T5(T), DAY); // white paper seen through the lens
    return [id, { id, label, T, room: norm(paper.lin), roomCss: paper.css, flareT: na.xyz(FLARE, T)[1] / na.xyz(FLARE)[1] }];
  }));
  const fireCache = new Map();
  function fire(lensId, tK) { // glow multiplier and luminous transmission for a black body at tK
    const key = `${lensId}:${Math.round(tK / 10)}`;
    if (!fireCache.has(key)) {
      const bb = na.planck(tK), k = 1 / na.xyz(bb)[1], bare = linOf(na.xyz(bb).map((v) => v * k)), thru = linOf(na.xyz(bb, lensData[lensId].T).map((v) => v * k));
      const lumT = na.luminousT(lensData[lensId].T, bb); // the eye adapts to the overall dimming, not to the hue shift
      fireCache.set(key, { mul: thru.map((v, i) => Math.min(3, v / bare[i] / lumT)), lumT });
    }
    return fireCache.get(key);
  }
  const matrix = (m) => `${m[0]} 0 0 0 0 0 ${m[1]} 0 0 0 0 0 ${m[2]} 0 0 0 0 0 1 0`;
  const apply = (rgb, m) => css(rgb.map((v, i) => encode(toLin(v) * m[i])));

  // Position (scene units). Start with the right lens on the gather at furnace heat.
  const pos = { x: 680, y: 150 };
  const place = () => {
    const tr = `translate(${pos.x} ${pos.y})`;
    frame.setAttribute('transform', tr); for (const e of shape) e.setAttribute('transform', tr);
    frame.setAttribute('aria-valuetext', `glasses at ${Math.round((pos.x / 900) * 100)}% across the scene`);
  };
  const toScene = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  let drag = null;
  frame.addEventListener('pointerdown', (e) => {
    if (drag) return;
    e.preventDefault(); frame.setPointerCapture(e.pointerId);
    const p = toScene(e); drag = { id: e.pointerId, dx: pos.x - p.x, dy: pos.y - p.y };
  });
  frame.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toScene(e);
    pos.x = Math.min(900, Math.max(0, p.x + drag.dx)); pos.y = Math.min(260, Math.max(40, p.y + drag.dy)); place();
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
  frame.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] }[e.key];
    if (!d) return;
    e.preventDefault(); pos.x = Math.min(900, Math.max(0, pos.x + d[0])); pos.y = Math.min(260, Math.max(40, pos.y + d[1])); place();
  });
  place();

  // Lens chips, meters and the spectrum strip.
  let cur = 'didymium', last = null;
  const api = { onChange: null, render };
  const box = $('lensPick');
  for (const id of Object.keys(lensData)) {
    const b = h('button', { className: 'chip' }, h('i', { style: { '--c': lensData[id].roomCss } }), lensData[id].label);
    b.dataset.id = id;
    b.addEventListener('click', () => { cur = id; api.onChange?.(); });
    box.appendChild(b);
  }
  const meters = $('lensMeters');
  const meter = (label, v, color) => h('div', {}, h('dt', {}, label), h('dd', {}, v < 0.1 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`), h('i', { style: { '--v': `${Math.min(100, v * 100)}%`, '--c': color } }));

  function drawStrip(lensT, tK, flare) {
    const canvas = $('stripNa'), r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    const ctx = canvas.getContext('2d'), n = na.FINE.length, x = (i) => (i / (n - 1)) * w, vis = na.VIS_END;
    ctx.clearRect(0, 0, w, hh);
    // colour band: the spectrum through the lens (visible), a dim red wash for the infrared
    for (let i = 0; i < n; i++) {
      const g = Math.round(((na.FINE[i] - 380) / 5)), T = lensT[i];
      ctx.fillStyle = i <= vis ? css(SPECTRAL[Math.min(80, g)].map((v) => encode(v * T))) : `rgba(201, 120, 106, ${0.08 + 0.32 * T})`;
      ctx.fillRect(Math.floor(x(i)), 0, Math.ceil(w / n) + 1, hh);
    }
    // black-body emission at this temperature (shape only), and the lens's transmission
    const bb = na.planck(tK), peak = Math.max(...bb);
    ctx.fillStyle = 'rgba(255, 138, 42, .28)'; ctx.beginPath(); ctx.moveTo(0, hh);
    for (let i = 0; i < n; i++) ctx.lineTo(x(i), hh - (bb[i] / peak) * hh * 0.85);
    ctx.lineTo(w, hh); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(239, 230, 220, .95)'; ctx.lineWidth = 1.4 * dpr; ctx.beginPath();
    for (let i = 0; i < n; i++) { const y = 4 * dpr + (1 - lensT[i]) * (hh - 8 * dpr); i ? ctx.lineTo(x(i), y) : ctx.moveTo(x(i), y); }
    ctx.stroke();
    // the sodium doublet, as a spike: its height is the flare's share, through the lens
    const i589 = na.FINE.indexOf(589), fx = x(i589), pass = (lensT[i589] + lensT[i589 + 1]) / 2;
    const top = hh - Math.max(2 * dpr, (flare > 0 ? 0.3 + 0.7 * Math.min(1, flare / 6) : 0) * pass * (hh - 16 * dpr));
    ctx.strokeStyle = '#0c0907'; ctx.lineWidth = 5 * dpr; ctx.beginPath(); ctx.moveTo(fx, hh); ctx.lineTo(fx, top); ctx.stroke();
    ctx.strokeStyle = '#ffe7a0'; ctx.lineWidth = 2.5 * dpr; ctx.beginPath(); ctx.moveTo(fx, hh); ctx.lineTo(fx, top); ctx.stroke();
    ctx.fillStyle = '#efe6dc'; ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`; ctx.fillText('Na D', fx + 5 * dpr, Math.max(12 * dpr, Math.min(hh - 4 * dpr, top + 10 * dpr)));
    ctx.strokeStyle = 'rgba(239, 230, 220, .35)'; ctx.lineWidth = 1 * dpr; ctx.setLineDash([3 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(x(vis), 0); ctx.lineTo(x(vis), hh); ctx.stroke(); ctx.setLineDash([]);
  }

  function render({ t, a, body, hot, glowRgb, flare }) {
    const d = lensData[cur], tK = t + 273.15, f = fire(cur, tK), fHot = fire(cur, HOT + 273.15);
    lensG.style.display = cur === 'none' ? 'none' : '';
    $('lens-name').textContent = d.label;
    $('lens-room-m').setAttribute('values', matrix(d.room));
    $('lens-fire-m').setAttribute('values', matrix(fHot.mul));
    if (cur !== 'none') {
      // through the lens: body lit by the room, glow recoloured by the lens, then mixed as outside
      const b = body.map((v, i) => encode(toLin(v) * d.room[i])), hh = hot.map((v, i) => encode(toLin(v) * f.mul[i]));
      const col = css(b.map((v, i) => v + (hh[i] - v) * a));
      L('g-body').setAttribute('fill', col); L('g-cast').setAttribute('fill', col);
      L('g-cast').setAttribute('opacity', 0.2 + a * 0.5);
      L('g-halo').setAttribute('fill', apply(glowRgb, f.mul)); L('g-halo').setAttribute('opacity', a * 0.85);
      L('g-rim').setAttribute('opacity', 1 - a * 0.9);
      const r = flare * (d.flareT / Math.max(1e-6, f.lumT));
      for (const id of ['g-flare', 'g-flare2']) L(id).setAttribute('opacity', r / (1 + r));
      L('g-rig').setAttribute('transform', $('g-rig').getAttribute('transform'));
    }
    const key = `${cur}:${Math.round(t / 10)}`;
    if (key !== last) {
      last = key;
      for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === cur));
      const ir = na.power(na.planck(tK), d.T) / na.power(na.planck(tK));
      meters.replaceChildren(
        meter('sodium flare reaching you', d.flareT, css(naColor)),
        meter('light from the glass', f.lumT, '#ff8a2a'),
        meter('near infrared, 780–1400 nm', ir, '#c9786a'),
      );
      $('lensRead').textContent = LENS_NOTES[cur];
      drawStrip(d.T, tK, flare);
    }
  }
  addEventListener('resize', () => { last = null; api.onChange?.(); });
  return api;
}

/* ---------- 05 the reheat: struck gold and band-gap crystals ---------- */
function strike() {
  const base = DENS['gold-colloid'], sG = $('gold'), sE = $('gap');
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Model: particles form (density rises), then over-strike shifts the band ~30 nm red and broadens it.
  function goldT(t) {
    const amount = smooth(0.1, 0.6, t), over = smooth(0.6, 1, t), shift = over * 6, width = 1 + over * 5; // steps of 5 nm
    const reach = Math.ceil(width * 2);
    return GRID.map((_, i) => {
      let sum = 0, norm = 0;
      for (let k = -reach; k <= reach; k++) {
        const j = Math.min(GRID.length - 1, Math.max(0, Math.round(i - shift + k))), wt = Math.exp(-0.5 * (k / width) ** 2);
        sum += wt * base[j]; norm += wt;
      }
      return 10 ** -((sum / norm) * (amount * 2.2 + 0.02) * (1 + over * 0.6));
    });
  }
  const renderGold = () => {
    const t = sG.valueAsNumber / 100, T = goldT(t);
    $('goldPane').style.setProperty('--c', tColor(T).css);
    strip($('stripGold'), ONES, T);
    const lab = t < 0.15 ? 'unstruck' : t < 0.4 ? 'pink' : t < 0.7 ? 'ruby' : 'over-struck';
    $('goldTag').textContent = lab; $('goldOut').textContent = lab;
    $('goldRead').textContent = t < 0.15 ? 'Gold dissolved as atoms. They absorb almost nothing, so the glass is close to clear.'
      : t < 0.7 ? 'Particles have formed. Their electrons resonate with green light (a surface plasmon) and absorb it; red and some blue pass.'
      : 'Particles grow and clump. The band shifts toward longer wavelengths and broadens, and the ruby goes dull and brown.';
  };
  const renderGap = () => {
    const eV = sE.valueAsNumber / 100, edge = 1240 / eV, T = bandEdge(eV);
    $('gapPane').style.setProperty('--c', tColor(T).css);
    strip($('stripGap'), ONES, T);
    $('gapOut').textContent = `${eV.toFixed(2)} eV · edge ${Math.round(edge)} nm`;
    $('gapTag').textContent = eV > 2.3 ? 'yellow' : eV > 2.05 ? 'orange' : eV > 1.85 ? 'red' : 'deep red';
    $('gapRead').textContent = `Every photon above ${eV.toFixed(2)} eV (shorter than ${Math.round(edge)} nm) is absorbed; everything longer passes. A sharp edge gives these colors their clean, saturated look.`;
  };
  sG.addEventListener('input', renderGold); sE.addEventListener('input', renderGap);
  addEventListener('resize', () => { renderGold(); renderGap(); });
  renderGold(); renderGap();
}

/* ---------- 06 the cold shop: dichroic ---------- */
function dichroic() {
  const s = $('angle');
  const set = (id, attrs) => { const el = document.getElementById(id); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); };
  const render = () => {
    const deg = s.valueAsNumber, th = (deg * Math.PI) / 180, { center, R } = dichroicBand(deg), T = R.map((r) => 1 - r);
    const rc = tColor(R), tc = tColor(T);
    // the reflected band is dim overall but vivid at the specular angle: show it at full brightness
    const pk = Math.max(...rc.lin, 1e-6), refl = css(rc.lin.map((v) => encode(Math.max(0, v) / pk)));
    const L = 150, x0 = 260, y0 = 150, dx = Math.sin(th) * L, dy = Math.cos(th) * L * 0.8;
    const thr = Math.asin(Math.sin(th) / 1.5), bx = x0 + Math.tan(thr) * 34, ex = bx + Math.sin(th) * 110, ey = y0 + 34 + Math.cos(th) * 110;
    set('d-in', { x1: x0 - dx, y1: y0 - dy, x2: x0, y2: y0 });
    set('d-ref', { x1: x0, y1: y0, x2: x0 + dx, y2: y0 - dy, stroke: refl });
    set('d-tr', { x1: bx, y1: y0 + 34, x2: ex, y2: ey, stroke: tc.css });
    set('d-tref', { x: Math.min(505, x0 + dx + 4), y: Math.max(16, y0 - dy - 10) });
    set('d-ttr', { x: Math.min(420, ex + 12), y: Math.min(312, ey) });
    strip($('stripDi'), R.map((r) => Math.min(1, r / 0.9)), T);
    $('angleOut').textContent = `${deg}° · band at ${Math.round(center)} nm`;
  };
  s.addEventListener('input', render); addEventListener('resize', render); render();
}

/* ---------- 07 the rack: real supplier colours on hue shelves ---------- */
function rack() {
  const items = JSON.parse($('rack-data').textContent);
  const MECH = [['all', 'everything'], ['ions', 'ions'], ['colloids', 'metal colloids'], ['bandgap', 'semiconductors'], ['structure', 'structure'], ['unknown', 'unclassified']];
  const MECH_NOTE = { ions: 'ions', colloids: 'metal colloid', bandgap: 'semiconductor', structure: 'structural', unknown: 'mechanism not published' };
  const SHELVES = [['reds', 345, 15], ['ambers & browns', 15, 45], ['yellows', 45, 70], ['greens', 70, 160], ['teals', 160, 195], ['blues', 195, 250], ['violets', 250, 290], ['pinks', 290, 345]];
  const NEUTRAL = 'whites, greys & blacks', names = [...SHELVES.map((x) => x[0]), NEUTRAL];
  const hsl = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  };
  for (const it of items) {
    const [h, sat, l] = (it.hsl = hsl(it.hex));
    it.shelf = sat < 0.14 || l < 0.1 || l > 0.94 ? NEUTRAL : SHELVES.find(([, a, b]) => (a > b ? h >= a || h < b : h >= a && h < b))[0];
  }
  items.sort((a, b) => names.indexOf(a.shelf) - names.indexOf(b.shelf) || b.hsl[2] - a.hsl[2]);
  $('rackN').textContent = items.length.toLocaleString('en');

  const mosaic = $('mosaic'), rows = {};
  for (const n of names) {
    const row = h('div', { className: 'shelf' }, h('span', {}, n, h('b')), h('div', { className: 'rods' }));
    mosaic.appendChild(row); rows[n] = row;
  }
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.style.setProperty('--c', it.hex); d.dataset.i = i;
    if (it.opacity === 'opaque') d.className = 'op';
    rows[it.shelf].lastChild.appendChild(d);
  });
  const recount = () => {
    for (const n of names) {
      const shown = [...rows[n].lastChild.children].filter((d) => d.style.display !== 'none').length;
      rows[n].querySelector('b').textContent = shown;
      rows[n].classList.toggle('empty', !shown);
    }
  };
  recount();

  const tag = $('tag'), blank = [...tag.childNodes].map((n) => n.cloneNode(true));
  let on = null;
  const show = (el) => {
    if (!el?.dataset?.i) return;
    const it = items[el.dataset.i];
    on?.classList.remove('on'); on = el; el.classList.add('on');
    const colorants = it.colorant.length ? ` · ${it.colorant.join(', ')}` : '';
    tag.replaceChildren(
      h('i', { style: { '--c': it.hex } }),
      h('div', {}, h('strong', {}, it.name), h('span', {}, `${it.supplier} · ${it.code} · ${it.opacity}${colorants} · ${MECH_NOTE[it.mechanism] ?? it.mechanism}`)),
    );
  };
  mosaic.addEventListener('pointerover', (e) => show(e.target));
  mosaic.addEventListener('click', (e) => show(e.target));

  const counts = items.reduce((m, it) => ((m[it.mechanism] = (m[it.mechanism] || 0) + 1), m), { all: items.length });
  const box = $('filters');
  for (const [id, lab] of MECH) {
    const b = h('button', { className: 'chip', 'aria-pressed': String(id === 'all') }, `${lab} `, h('span', {}, String(counts[id] || 0)));
    b.addEventListener('click', () => {
      for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
      for (const d of mosaic.querySelectorAll('.rods div')) d.style.display = id === 'all' || items[d.dataset.i].mechanism === id ? '' : 'none';
      if (on && on.style.display === 'none') { on.classList.remove('on'); on = null; tag.replaceChildren(...blank.map((n) => n.cloneNode(true))); }
      recount();
    });
    box.appendChild(b);
  }
}

/* ---------- ← the record: the history rail ---------- */
function historyRail() {
  const box = $('history');
  // a pin's colour comes from the same engine as the stage it links to
  const pinColor = (c) => (c.dichroic != null ? tColor(dichroicBand(c.dichroic).R.map((r) => 1 - r)) : colorOf(c.parts, c.thickness ?? 1)).css;
  for (const p of history.pins) {
    if (!p.color) continue;
    for (const el of box.querySelectorAll(`[data-pin="${p.id}"]`)) el.style.setProperty('--c', pinColor(p.color));
  }
  const buttons = [...box.querySelectorAll('.pin button')], cards = [...box.querySelectorAll('.hist-card')];
  const pick = (id) => {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.id === id));
    for (const c of cards) c.hidden = c.dataset.id !== id;
  };
  for (const b of buttons) {
    b.addEventListener('click', () => pick(b.dataset.id));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(b.dataset.id); });
    b.addEventListener('focus', () => pick(b.dataset.id));
  }
  pick(history.pins[0].id);

  // Lanes: the build guesses them from a nominal label width; here they are redone from the
  // measured labels, so neighbours never overlap at any width. A tick's year hides under a stem.
  const rail = box.querySelector('.hist-rail'), pinEls = [...rail.querySelectorAll('.pin')], ticks = [...rail.querySelectorAll('.hist-tick')];
  const pct = (el) => parseFloat(el.style.getPropertyValue('--x')) / 100;
  const lanes = () => {
    const W = rail.clientWidth;
    if (getComputedStyle(rail).display === 'grid') return; // the phone layout is a plain list
    // Each label takes a lane and a side of its stem. A label may not overlap another in its lane,
    // and an outer stem may not cross an inner label. A small depth-first search finds a fit.
    const P = pinEls.map((el) => ({ el, x: pct(el) * W, w: el.querySelector('.pin-lab').offsetWidth + 12 }));
    const OPTS = ['up1', 'down1', 'up2', 'down2'].flatMap((lane) => [[lane, 'left'], [lane, 'right']]);
    const hits = (a, b, c, d) => !(b < c || a > d);
    const fits = (i, lane, side, placed) => {
      const { x, w } = P[i], [a, b] = side === 'left' ? [x, x + w] : [x - w, x];
      if (a < 0 || b > W) return false;
      const up = lane.slice(0, -1), outer = lane.endsWith('2');
      return placed.every((q, j) => {
        if (q.lane === lane && hits(a, b, q.a, q.b)) return false;
        if (q.lane.slice(0, -1) !== up) return true;
        const qOuter = q.lane.endsWith('2');
        if (outer && !qOuter && hits(x - 4, x + 4, q.a, q.b)) return false;
        if (!outer && qOuter && hits(P[j].x - 4, P[j].x + 4, a, b)) return false;
        return true;
      }) && { lane, side, a, b };
    };
    let steps = 0;
    const solve = (i, placed) => {
      if (i === P.length) return placed;
      if (++steps > 20000) return null;
      for (const [lane, side] of OPTS) {
        const q = fits(i, lane, side, placed), done = q && solve(i + 1, [...placed, q]);
        if (done) return done;
      }
      return null;
    };
    const plan = solve(0, []), downs = [];
    if (!plan) return; // keep the build's lanes
    plan.forEach((q, i) => {
      P[i].el.dataset.lane = q.lane; P[i].el.dataset.side = q.side;
      if (q.lane.startsWith('down')) downs.push(P[i].x);
    });
    const left = rail.getBoundingClientRect().left;
    for (const t of ticks) {
      const s = t.querySelector('span'), r = s.getBoundingClientRect();
      s.style.visibility = downs.some((d) => d > r.left - left - 4 && d < r.right - left + 4) ? 'hidden' : '';
    }
  };
  lanes(); addEventListener('resize', lanes);
}

export function initHome() {
  lightTable(); batch(); redox(); ions(); heat(); strike(); dichroic(); rack(); historyRail();
}
