// home.js — the instruments on the home page. Every glass colour is computed from absorption
// spectra in optics.json through spectra.js; nothing here is a hand-picked colour.
import optics from '../data/optics.json';
import history from '../data/history.json';
import {
  GRID, colorantDensity, transmission, glow, glowStrength, emissivity, luminousEmissivity, planck,
  SPECTRAL, bandEdge, dichroicBand, encode, css, upsample,
} from './spectra.js';
import * as na from './flare.js';
import { LAMPS, LAMP, underLamp, lampColor, fineSpd } from './lamps.js';
import { makeFitter, MATCH, C_MAX } from './fit.js';
import * as u from './uranium.js';
import { initDispersion } from './prism.js';
import { BOWL, CANE, profile, bowlPath, bowlReadings, canePath } from './vessel.js';
import * as st from './stress.js';
import { glassStage } from './stage-glass.js';

const COLORANT = Object.fromEntries(optics.colorants.map((c) => [c.id, c]));
const DENS = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
DENS.uranium = GRID.map(u.density); // uranium.js: the one colorant that also gives light out
const ONES = GRID.map(() => 1);
const $ = (id) => document.getElementById(id);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The lamp the whole page is lit by. Every instrument registers a re-render with onLamp.
let lamp = LAMP.daylight;
const relight = [];
const onLamp = (fn) => relight.push(fn);
const lampLight = () => { const m = Math.max(...lamp.spd); return lamp.spd.map((v) => v / m); };

const tColor = (T) => underLamp(T, lamp);
const mixT = (parts, thickness = 1) => transmission(parts.map(([id, c]) => [DENS[id], c]), thickness);
const colorOf = (parts, thickness = 1) => tColor(mixT(parts, thickness));
// Uranium glass: what it passes plus what it gives out. glow is the fluorescence's share of the light.
function uraniumOf(thickness = 1) {
  const T = u.transmissionOnGrid(thickness), F = u.fluorescence(lamp.ext, thickness);
  const all = underLamp(T, lamp, F), lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const glowOnly = underLamp(GRID.map(() => 0), lamp, F);
  return { ...all, T, F, glow: lum(glowOnly.lin) / Math.max(1e-9, lum(all.lin)), glowCss: glowOnly.css };
}

// A spectrum strip: light in (top band) and light out (bottom band), with curve drawn on the bottom.
// Without bands given, the light in is the current lamp and the light out is that lamp through T.
function strip(canvas, T, top = lampLight(), bottom = top.map((v, i) => v * T[i]), curve = T) {
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
    const x = ((i + 0.5) / n) * w, y = h - 3 * dpr - curve[i] * (h - half - gap - 6 * dpr);
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

function chips(box, ids, label, onPick, parts = (id) => [[id, 1]]) {
  const swatches = ids.map((id) => {
    const i = h('i'), b = h('button', { className: 'chip' }, i, label(id));
    b.dataset.id = id;
    b.addEventListener('click', () => onPick(id));
    box.appendChild(b);
    return [i, id];
  });
  const paint = () => { for (const [i, id] of swatches) i.style.setProperty('--c', colorOf(parts(id), 1.2).css); };
  paint(); onLamp(paint);
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
    { lab: 'neodymium', parts: [['neodymium', 1]], x: 0.38, y: 0.56, s: 0.17, clip: shard('50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%') },
    { lab: 'uranium', uranium: true, x: 0.74, y: 0.56, s: 0.2, clip: shard('25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%') },
  ];
  let z = 10;
  const els = pieces.map((p) => {
    const g = h('div', { className: 'g' });
    const el = h('div', { className: 'piece' + (p.r === '50%' ? ' round' : '') }, g, h('span', { className: 'lab' }, p.lab));
    if (p.clip) g.style.setProperty('--clip', p.clip);
    if (p.r) g.style.setProperty('--r', p.r);
    table.appendChild(el);
    return { el, g, p };
  });
  // The table is lit by the lamp too (see paint() below), and the screen multiplies each piece over
  // it, so a piece is drawn as its colour divided by the table's: the product is the computed colour.
  // A glowing piece can be brighter than the table under it, which multiply cannot draw; it switches
  // to screen, which adds light: screen(paper, x) = c when x = 1 − (1 − c) / (1 − paper).
  onLamp(() => {
    const paper = tColor(ONES).rgb;
    for (const { el, g, p } of els) {
      const c = p.uranium ? uraniumOf() : colorOf(p.parts), lit = c.rgb.some((v, i) => v > paper[i] + 0.01);
      g.style.setProperty('--c', css(c.rgb.map((v, i) => (lit
        ? Math.max(0, 1 - (1 - v) / Math.max(1e-3, 1 - paper[i]))
        : Math.min(1, v / Math.max(paper[i], 1e-3))))));
      el.classList.toggle('lit', lit);
      if (lit) el.style.setProperty('--glow', c.glowCss);
    }
    torch.toggle(!!lamp.dark);
  });

  // Under the black light the table is a dark room and the light is a torch: a dark layer over the
  // pieces with a hole where the beam falls. It follows the pointer, and sweeps once on its own.
  const shade = h('div', { className: 'shade', 'aria-hidden': 'true' });
  table.appendChild(shade);
  const torch = (() => {
    let raf = 0, on = false;
    const aim = (x, y) => { shade.style.setProperty('--x', `${x}px`); shade.style.setProperty('--y', `${y}px`); };
    const target = () => { const t = els.find((e) => e.p.uranium).el; return [t.offsetLeft + t.offsetWidth / 2, t.offsetTop + t.offsetHeight / 2]; };
    table.addEventListener('pointermove', (e) => {
      if (!on) return;
      cancelAnimationFrame(raf);
      const r = table.getBoundingClientRect(); aim(e.clientX - r.left, e.clientY - r.top);
    });
    return {
      toggle(next) {
        if (next === on) return;
        on = next; table.classList.toggle('dark', on); cancelAnimationFrame(raf);
        if (!on) return;
        const [tx, ty] = target(), w = table.clientWidth, hh = table.clientHeight;
        if (reduceMotion()) return aim(tx, ty);
        // a sweep from the left edge, across the table, coming to rest on the uranium glass
        const t0 = performance.now(), dur = 3200;
        const tick = (now) => {
          const f = Math.min(1, (now - t0) / dur), e = 1 - (1 - f) ** 3;
          const x = -0.1 * w + (tx + 0.1 * w) * e, y = hh * 0.35 + (ty - hh * 0.35) * e + Math.sin(f * Math.PI * 2) * hh * 0.18 * (1 - f);
          aim(x, y);
          if (f < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
    };
  })();
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
  s.addEventListener('input', render); onLamp(render);
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
  s.addEventListener('input', render); onLamp(render);
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
function ions(onRod) {
  const s = $('conc'), draw = slab($('slab3'));
  let cur = 'cobalt';
  const press = chips($('rods'), Object.keys(ROD_NOTES), (id) => COLORANT[id].label, (id) => { cur = id; render(); });
  function render() {
    const k = 2 ** (s.valueAsNumber / 100), T = mixT([[cur, 1]], k);
    draw(tColor(T).css, colorOf([[cur, 1]], k * 5).css);
    strip($('strip3'), T);
    $('concOut').textContent = `×${k.toFixed(2)}`;
    $('ionRead').textContent = ROD_NOTES[cur];
    press(cur);
    onRod?.(cur, k);
  }
  s.addEventListener('input', render); addEventListener('resize', render); onLamp(render);
}

/* ---------- 03 the colour rod, blown: wall thickness in a bowl and a cane ---------- */
// Colorants differ in strength by an order of magnitude, so each rod is dosed to pass WALL_Y of
// daylight through a 3 mm wall at amount ×1. A cased skin carries six times the colorant, so face
// on 0.5 mm of it holds as much as a 3 mm solid wall.
const SOLID_MM = 3, SKIN_DOSE = 6, WALL_Y = 0.6;
const LUT_MAX = 40, LUT_N = 1024; // dose range in 3 mm walls, sampled on a square-root scale
const PAPER = [1, 1, 1], CLEAR = [0.9, 0.925, 0.91], INK = 'rgba(20,20,20,.55)';

// Size a canvas to its box at device resolution; returns [ctx, width, height, dpr].
function fit(canvas, aspect) {
  const w0 = canvas.getBoundingClientRect().width, dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(w0 * dpr)), h = Math.max(1, Math.round(w0 * aspect * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  canvas.style.height = `${w0 * aspect}px`;
  return [canvas.getContext('2d'), w, h, dpr];
}

function vessel() {
  const bowl = $('bowl'), cane = $('cane'), wall = $('wall');
  let rod = 'cobalt', k = 1, cased = false, lut = [], unit = 1, raf = 0, litBy = null;
  const builds = [['solid', 'solid colour'], ['cased', 'cased in colour']].map(([id, label]) => {
    const b = h('button', { className: 'chip chip-plain' }, label);
    b.addEventListener('click', () => { cased = id === 'cased'; queue(); });
    $('build').appendChild(b);
    return [id, b];
  });
  const press = (cur) => { for (const [id, b] of builds) b.setAttribute('aria-pressed', String(id === cur)); };
  const blow = () => 2 ** (wall.valueAsNumber / 100);
  const dose = (mm, skin = cased) => (k * mm * (skin ? SKIN_DOSE : 1)) / SOLID_MM;
  const look = (d) => lut[Math.min(LUT_N - 1, Math.round(Math.sqrt(Math.max(0, d) / LUT_MAX) * (LUT_N - 1)))];

  function buildLut() {
    let lo = 0, hi = 50; // bisect for the rod's dose per 3 mm wall, always in daylight
    for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; lum(underLamp(mixT([[rod, 1]], mid), LAMP.daylight).lin) > WALL_Y ? (lo = mid) : (hi = mid); }
    unit = lo;
    litBy = lamp; // the colours themselves are under the page's lamp
    lut = Array.from({ length: LUT_N }, (_, i) => tColor(mixT([[rod, 1]], unit * LUT_MAX * (i / (LUT_N - 1)) ** 2)));
  }

  // The bowl in half section: cut away on the left, as seen against the light on the right.
  const X = 95, Y0 = -4, Y1 = 106; // drawing extents in mm (y up from the table)
  function drawBowl() {
    const [ctx, w, h, dpr] = fit(bowl, (Y1 - Y0) / (2 * X));
    const img = ctx.createImageData(w, h), px = img.data, f = blow(), mm = (2 * X) / w;
    for (let j = 0; j < h; j++) {
      const y = Y1 - (j + 0.5) * mm, p = profile(y, f);
      if (!p) continue;
      for (let i = 0; i < w; i++) {
        const x = -X + (i + 0.5) * mm, rho = Math.abs(x);
        if (rho > p.R) continue;
        let c;
        if (x >= 0) c = look(dose(bowlPath(x, y, { blow: f, cased }))).rgb;
        else if (rho < p.r) c = look(dose(bowlPath(x, y, { blow: f, cased, back: true }))).rgb;
        else if (!cased) c = look(dose(p.t)).rgb; // the cut wall, tinted by its own thickness
        else c = !p.inFoot && rho >= p.skinR ? look(dose(BOWL.skin)).rgb : CLEAR;
        const o = 4 * (j * w + i);
        px[o] = 255 * c[0]; px[o + 1] = 255 * c[1]; px[o + 2] = 255 * c[2]; px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const sx = (x) => ((x + X) / (2 * X)) * w, sy = (y) => ((Y1 - y) / (Y1 - Y0)) * h;
    const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], n) => (n ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)))); ctx.stroke(); };
    const ys = Array.from({ length: 121 }, (_, n) => (BOWL.H * n) / 120);
    ctx.lineWidth = dpr; ctx.strokeStyle = INK;
    line(ys.map((y) => [-profile(y, f).R, y]));
    const floor = profile(BOWL.H, f).floor, inner = ys.filter((y) => y >= floor);
    line([[0, floor], ...inner.map((y) => [-profile(y, f).r, y])]);
    line([[-profile(BOWL.H, f).r, BOWL.H], [-BOWL.rimR, BOWL.H]]);
    line([[-BOWL.footR, 0], [0, 0]]);
    ctx.strokeStyle = 'rgba(20,20,20,.14)'; // the silhouette, so clear glass reads
    line(ys.filter((y) => y >= BOWL.foot).map((y) => [profile(y, f).R, y]));
    line([[profile(BOWL.foot, f).R, BOWL.foot], [BOWL.footR, BOWL.foot], [BOWL.footR, 0], [0, 0]]);
    ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.strokeStyle = 'rgba(20,20,20,.35)'; line([[0, -3], [0, 105]]); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(20,20,20,.5)'; ctx.font = `500 ${11 * dpr}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'left'; ctx.fillText('CUT AWAY', 4 * dpr, h - 6 * dpr);
    ctx.textAlign = 'right'; ctx.fillText('AS SEEN', w - 4 * dpr, h - 6 * dpr);
  }

  // A cane: a slice cut end on (a murrina), then the rod seen from the side.
  const CX = 104, CY = 9; // extents in mm
  function drawCane() {
    const [ctx, w, h] = fit(cane, (2 * CY) / CX);
    const img = ctx.createImageData(w, h), px = img.data, mm = CX / w, { R, skin, slice } = CANE;
    const sliceC = (rho) => (cased && rho < R - skin ? CLEAR : look(dose(slice)).rgb);
    for (let j = 0; j < h; j++) {
      const y = CY - (j + 0.5) * mm;
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) * mm, rho = Math.hypot(x - 9, y);
        let c = null;
        if (rho <= R) c = sliceC(rho);
        else if (x >= 22 && x <= 102 && Math.abs(y) <= R) c = look(dose(canePath(y, cased))).rgb;
        if (!c) continue;
        const o = 4 * (j * w + i);
        px[o] = 255 * c[0]; px[o + 1] = 255 * c[1]; px[o + 2] = 255 * c[2]; px[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function meters() {
    const read = bowlReadings({ blow: blow(), cased });
    const rows = [['rim', read.rim], ['wall', read.wall], ['base', read.base]].map(([name, t]) => {
      const col = look(dose(t)), pct = Math.round(100 * lum(col.lin));
      return h('div', {}, h('dt', {}, `${name} · ${t.toFixed(1)} mm${cased ? ' of colour' : ''}`), h('dd', {}, `${pct}%`),
        h('i', { style: { '--v': `${pct}%`, '--c': col.css } }));
    });
    $('bowlMeters').replaceChildren(...rows);
    $('wallOut').textContent = `×${blow().toFixed(2)}`;
    $('bowlRead').textContent = cased
      ? 'Cased: the colour lives in a skin half a millimetre thick, so rim, wall and foot each cross about the same amount of it and the bowl reads as one even tint. The foot, added in clear, carries none.'
      : 'Solid colour: the rim is blown thinnest and is palest, and the heavy foot is darkest. The outline darkens too, because there your line of sight runs along the wall instead of across it.';
    $('caneRead').textContent = cased
      ? 'Cased cane is darkest at its edges and palest down the middle, like a tube, because the middle crosses only the skin twice. Cut end on, the colour is a ring.'
      : 'Solid cane is darkest down the middle, where a ray crosses the most glass, and pales toward its edges. Cut end on, the slice is one even colour.';
  }

  function render() {
    raf = 0;
    press(cased ? 'cased' : 'solid');
    drawBowl(); drawCane(); meters();
  }
  function queue() { if (!raf) raf = requestAnimationFrame(render); }
  wall.addEventListener('input', queue);
  addEventListener('resize', queue);
  return (id, amount) => {
    if (id !== rod || !lut.length || litBy !== lamp) { rod = id; buildLut(); }
    k = amount; queue();
  };
}

/* ---------- 04 the glory hole: hot glass glows where it absorbs ---------- */
const HOT = 1150; // °C, soda-lime furnace
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
// The sodium flare's brightness relative to a black body's glow (illustrative): strong in the
// glory hole's flame, gone once the gather is out of it and below working heat. The flame does not
// care what the gather is, so against a gather that glows less than a black body the flare wins by more.
const flareRatio = (t) => { const x = Math.min(1, Math.max(0, (t - 820) / 180)); return 6 * x * x * (3 - 2 * x); };

// The gathers. Each is seen through the same path (in optics.json's units), so the colour it shows
// cold and the light it gives out hot come from one transmission spectrum. Clear is a trace of iron.
const GATHERS = {
  clear: { label: 'Clear (trace iron)', parts: [['iron-ferrous', 0.03], ['iron-ferric', 0.03]] },
  ...Object.fromEntries(['cobalt', 'copper', 'chromium', 'manganese'].map((id) => [id, { label: COLORANT[id].label, parts: [[id, 1]] }])),
};
const GATHER_PATH = 1.4;
const gatherT = (id) => mixT(GATHERS[id].parts, GATHER_PATH);
const gatherEps = Object.fromEntries(Object.keys(GATHERS).map((id) => [id, emissivity(gatherT(id))]));
const SOOT = [0.06, 0.045, 0.035];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// What a glowing gather looks like at t °C: its glow colour, its strength, and the hottest glass pushed
// toward yellow-orange the way an overexposed glow reads. Strength is the log visibility scale (zero
// once the glow is too faint to see) times the cube root of its luminous emissivity, Stevens's
// brightness exponent, so a glass that emits a thirtieth of a black body's light looks about a third as bright.
function hotLook(id, t) {
  const tK = t + 273.15, g = glow(tK, 1423, gatherEps[id]);
  const a = glowStrength(g.luminance) * luminousEmissivity(gatherEps[id], tK) ** (1 / 3);
  return { g, a, hot: lerp(g.rgb, [1, 0.82, 0.45], a ** 3 * 0.45) };
}
// The lowest temperature (°C) at which a gather's glow is still visible on the page's strength scale.
// For a black body that is the Draper point; a glass that emits less fades out hotter.
function fadeOut(eps) {
  let lo = 300, hi = 1150;
  for (let n = 0; n < 30; n++) { const mid = (lo + hi) / 2; glowStrength(glow(mid + 273.15, 1423, eps).luminance) > 0 ? (hi = mid) : (lo = mid); }
  return hi;
}

function heat() {
  const s = $('temp'), ids = Object.keys(GATHERS);
  let cur = 'cobalt', body = colorOf(GATHERS[cur].parts, GATHER_PATH).rgb, raf = 0;
  const press = chips($('heatRods'), ids, (id) => (id === 'clear' ? 'clear' : id), (id) => { cur = id; body = colorOf(GATHERS[id].parts, GATHER_PATH).rgb; render(s.valueAsNumber); }, (id) => GATHERS[id].parts);
  const el = (id) => document.getElementById(id);
  const lens = glasses();
  const compare = kirchhoff();
  function render(t) {
    const { g, a, hot } = hotLook(cur, t), epsY = luminousEmissivity(gatherEps[cur], t + 273.15);
    const col = css(lerp(body, hot, a)), flare = flareRatio(t) / Math.max(0.01, epsY);
    el('g-body').setAttribute('fill', col);
    el('g-cast').setAttribute('fill', col); el('g-cast').setAttribute('opacity', 0.2 + a * 0.5);
    el('g-halo').setAttribute('fill', css(g.rgb)); el('g-halo').setAttribute('opacity', a * 0.85);
    el('g-rim').setAttribute('opacity', 1 - a * 0.9); // hot glass glows from within; the dark rim appears as it cools
    for (const id of ['g-flare', 'g-flare2']) el(id).setAttribute('opacity', flare / (1 + flare));
    el('g-rig').setAttribute('transform', `translate(${-(1 - t / HOT) * 330} 0)`);
    lens.render({ t, a, body, hot, glowRgb: g.rgb, flare, gather: cur, eps: gatherEps[cur] });
    compare(t);
    $('tempOut').textContent = String(Math.round(t));
    s.setAttribute('aria-valuetext', `${Math.round(t)} degrees Celsius`);
    const pct = Math.round(epsY * 100);
    $('heatRead').textContent = a === 0
      ? (t > 200 ? 'The glow is too faint to see; this is the colorant.' : `Cooled: ${GATHERS[cur].label}. This is the color it carried all along.`)
      : cur === 'clear'
        ? `Clear glass absorbs almost no visible light, so it gives almost none back: about ${pct}% of a black body's glow at this heat.${t > 1000 ? ' The sodium flare outshines it many times over.' : ''}`
        : t > 1000 ? `In the glory hole. The gather glows in its own absorption bands, about ${pct}% as bright as a black body, and the sodium flare is brighter still.`
        : t > 800 ? `Working heat. The glow comes from the bands that make the color, so you are reading temperature, not color (${pct}% of a black body).`
        : 'Cooling through cherry red. The glow is dimming and the colorant starts to show.';
    press(cur);
  }
  lens.onChange = () => render(s.valueAsNumber);
  onLamp(() => { body = colorOf(GATHERS[cur].parts, GATHER_PATH).rgb; lens.relight(); compare.relight(); render(s.valueAsNumber); });
  s.addEventListener('input', () => { cancelAnimationFrame(raf); render(s.valueAsNumber); });
  addEventListener('resize', () => compare.resize(s.valueAsNumber));
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

/* ---------- 04 the glory hole: Kirchhoff, three gathers side by side ---------- */
// Each card: the gather cold on the light table, the same gather at the stage's temperature in the
// dark, and its spectrum: a black body at that temperature (top), what this glass emits (bottom), and
// its emissivity ε = 1 − T (line). The cold colour and the hot glow are one spectrum read both ways.
function kirchhoff() {
  const grid = $('kGrid'), CARDS = ['clear', 'cobalt', 'copper'];
  const cards = CARDS.map((id) => {
    const cold = h('div', { className: 'k-cold' }, h('b', {}, 'cold')), hot = h('div', { className: 'k-hot' }, h('b', {}, 'at heat'));
    const canvas = h('canvas', { className: 'strip', 'aria-hidden': 'true' }), read = h('p', { className: 'readout' });
    grid.appendChild(h('figure', { className: 'k-card' }, h('h4', { className: 'mono' }, GATHERS[id].label), h('div', { className: 'k-pair' }, cold, hot), canvas, read));
    return { id, cold, hot, canvas, read, fade: Math.round(fadeOut(gatherEps[id]) / 5) * 5 };
  });
  const relight = () => { for (const c of cards) c.cold.style.setProperty('--c', colorOf(GATHERS[c.id].parts, GATHER_PATH).css); };
  let last = null;
  function render(t, force = false) {
    const key = Math.round(t / 5);
    if (key === last && !force) return;
    last = key;
    const tK = t + 273.15, B = planck(tK), peak = Math.max(...B), top = B.map((v) => v / peak);
    for (const c of cards) {
      const eps = gatherEps[c.id], { a, hot } = hotLook(c.id, t), epsY = luminousEmissivity(eps, tK);
      c.hot.style.setProperty('--c', css(lerp(SOOT, hot, a)));
      strip(c.canvas, eps, top, top.map((v, i) => v * eps[i]), eps);
      const pct = epsY < 0.1 ? (epsY * 100).toFixed(1) : Math.round(epsY * 100);
      c.read.textContent = a > 0
        ? `At ${Math.round(t)} °C it glows ${pct}% as bright as a black body. Its glow fades from sight near ${c.fade} °C.`
        : `Too cool to glow visibly; its glow fades from sight near ${c.fade} °C.`;
    }
  }
  relight();
  return Object.assign(render, { relight: () => { relight(); last = null; }, resize: (t) => render(t, true) });
}

/* ---------- 04 the glory hole: the glasses ---------- */
// A pair of safety glasses on the scene. Inside the lenses the scene is drawn again, recoloured by
// each lens's transmission: the room by the lens under the page's lamp, the glowing parts by the lens
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
  const lensData = Object.fromEntries(Object.entries(na.LENSES).map(([id, { label, T }]) =>
    [id, { id, label, T, flareT: na.xyz(FLARE, T)[1] / na.xyz(FLARE)[1] }]));
  // The room through each lens depends on the lamp: white paper seen through the lens, relative to
  // bare paper, and the share of the lamp's light the lens lets through (on the 1 nm grid).
  function relightLenses() {
    const bare = tColor(ONES).lin, spd = fineSpd(lamp);
    for (const d of Object.values(lensData)) {
      const paper = tColor(T5(d.T));
      Object.assign(d, { room: norm(paper.lin.map((v, i) => v / Math.max(1e-6, bare[i]))), roomCss: paper.css, lampT: na.luminousT(d.T, spd) });
    }
    for (const b of box.querySelectorAll('button')) b.firstChild.style.setProperty('--c', lensData[b.dataset.id].roomCss);
  }
  const fireCache = new Map();
  // ε on the 1 nm grid (visible only; xyz ignores the rest). Without ε, a black body (the glory hole's walls).
  const fineEps = (eps) => na.FINE.map((w) => { if (w >= 780) return eps[80]; const i = Math.floor((w - 380) / 5), f = (w - 380) / 5 - i; return eps[i] + (eps[i + 1] - eps[i]) * f; });
  function fire(lensId, tK, gather = null, eps = null) { // glow multiplier and luminous transmission for the gather's glow at tK
    const key = `${lensId}:${gather}:${Math.round(tK / 10)}`;
    if (!fireCache.has(key)) {
      const e = eps && fineEps(eps), bb = na.planck(tK).map((v, i) => (e ? v * e[i] : v)), k = 1 / na.xyz(bb)[1], bare = linOf(na.xyz(bb).map((v) => v * k)), thru = linOf(na.xyz(bb, lensData[lensId].T).map((v) => v * k));
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
  const api = { onChange: null, render, relight: () => { relightLenses(); last = null; } };
  const box = $('lensPick');
  for (const id of Object.keys(lensData)) {
    const b = h('button', { className: 'chip' }, h('i'), lensData[id].label);
    b.dataset.id = id;
    b.addEventListener('click', () => { cur = id; api.onChange?.(); });
    box.appendChild(b);
  }
  relightLenses();
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

  function render({ t, a, body, hot, glowRgb, flare, gather, eps }) {
    const d = lensData[cur], tK = t + 273.15, f = fire(cur, tK, gather, eps), fHot = fire(cur, HOT + 273.15);
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
    const key = `${cur}:${gather}:${Math.round(t / 10)}`;
    if (key !== last) {
      last = key;
      for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === cur));
      const ir = na.power(na.planck(tK), d.T) / na.power(na.planck(tK));
      meters.replaceChildren(
        meter('sodium flare reaching you', d.flareT, css(naColor)),
        meter('light from the glass', f.lumT, '#ff8a2a'),
        meter('near infrared, 780–1400 nm', ir, '#c9786a'),
        meter(`room light (${lamp.label})`, d.lampT, lampColor(lamp.spd)),
      );
      $('lensRead').textContent = LENS_NOTES[cur] + (lamp.lines && cur !== 'none'
        ? ' Under the sodium street lamp the trick runs backwards: the notch that removes the flare removes almost all the light there is, and the room goes nearly black.' : '');
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
    strip($('stripGold'), T);
    const lab = t < 0.15 ? 'unstruck' : t < 0.4 ? 'pink' : t < 0.7 ? 'ruby' : 'over-struck';
    $('goldTag').textContent = lab; $('goldOut').textContent = lab;
    $('goldRead').textContent = t < 0.15 ? 'Gold dissolved as atoms. They absorb almost nothing, so the glass is close to clear.'
      : t < 0.7 ? 'Particles have formed. Their electrons resonate with green light (a surface plasmon) and absorb it; red and some blue pass.'
      : 'Particles grow and clump. The band shifts toward longer wavelengths and broadens, and the ruby goes dull and brown.';
  };
  const renderGap = () => {
    const eV = sE.valueAsNumber / 100, edge = 1240 / eV, T = bandEdge(eV);
    $('gapPane').style.setProperty('--c', tColor(T).css);
    strip($('stripGap'), T);
    $('gapOut').textContent = `${eV.toFixed(2)} eV · edge ${Math.round(edge)} nm`;
    $('gapTag').textContent = eV > 2.3 ? 'yellow' : eV > 2.05 ? 'orange' : eV > 1.85 ? 'red' : 'deep red';
    $('gapRead').textContent = `Every photon above ${eV.toFixed(2)} eV (shorter than ${Math.round(edge)} nm) is absorbed; everything longer passes. A sharp edge gives these colors their clean, saturated look.`;
  };
  sG.addEventListener('input', renderGold); sE.addEventListener('input', renderGap);
  addEventListener('resize', () => { renderGold(); renderGap(); });
  onLamp(() => { renderGold(); renderGap(); });
}

/* ---------- 06 the lehr: frozen-in stress between polarizers ---------- */
// Every colour is the polariscope's transmission spectrum (stress.js, Jones calculus) under the
// page's lamp. The colour of a spectrum is linear in it, so each lamp gives one weight per wavelength
// and a table of colours by retardation is a matrix product. The tint plate's colour also depends
// on the stress direction, so it gets a second axis in angle.
const VIEW_NOTES = {
  plane: 'The dark cross is not unstressed glass. Along it the stress runs parallel and perpendicular to the polarizers, and light polarized along a principal stress passes through unchanged. Switch to circular to remove it.',
  circular: 'Quarter-wave plates on either side make the light circular, so the direction of the stress no longer matters and the cross is gone. Only the size of the stress shows.',
  tint: 'A full-wave plate makes the empty field magenta, the colour that changes fastest with retardation. A few nanometres push it toward blue where the stress lies along the plate\'s axis and toward yellow where it lies across, so even well-annealed glass shows. This is how strain viewers in glassworks are set up.',
};
const RATE = (v) => 0.3 * 1000 ** (v / 1000); // °C per minute, log slider
const G_MAX = 12000, G_STEP = 2, T_MAX = 3000, T_STEP = 10, T_PHI = 24; // nm, nm, nm, nm, angle bins over 180°
function lehr() {
  const canvas = $('polar'), edge = $('polarEdge'), an = $('analyzer'), sCool = $('cool'), sThick = $('thick');
  let viewer = 'plane', luts = null, litBy = null, raf = 0;
  const views = [['plane', 'crossed'], ['circular', 'circular'], ['tint', 'tint plate']].map(([id, label]) => {
    const b = h('button', { className: 'chip chip-plain' }, label);
    b.addEventListener('click', () => { viewer = id; queue(); });
    $('polarView').appendChild(b);
    return [id, b];
  });

  // Colour tables under the current lamp, in linear sRGB.
  function build() {
    const W = GRID.map((_, i) => underLamp(GRID.map((_, j) => (j === i ? 1 : 0)), lamp).lin);
    const colour = (I) => { const c = [0, 0, 0]; I.forEach((v, i) => { c[0] += v * W[i][0]; c[1] += v * W[i][1]; c[2] += v * W[i][2]; }); return c; };
    const S = []; // sin²(πΓ/λ): crossed at 45°, and circular at any angle
    for (let G = 0; G <= G_MAX; G += G_STEP) S.push(colour(GRID.map((w) => Math.sin((Math.PI * G) / w) ** 2)));
    luts = { S, high: colour(GRID.map(() => 0.5)), tint: null, colour };
    litBy = lamp;
  }
  function tintLut() { // [angle bin][retardation bin], −T_MAX..T_MAX
    if (!luts.tint) luts.tint = Array.from({ length: T_PHI }, (_, k) => {
      const phi = (k * Math.PI) / T_PHI, row = [];
      for (let G = -T_MAX; G <= T_MAX; G += T_STEP) row.push(luts.colour(st.polariscope('tint', phi, G)));
      return row;
    });
    return luts.tint;
  }
  // Linear colour at retardation G (signed) with the slow axis at phi from the polarizer.
  function look(G, phi) {
    if (viewer === 'tint') {
      const t = tintLut(), a = (((phi % Math.PI) + Math.PI) % Math.PI) / (Math.PI / T_PHI), k0 = Math.floor(a) % T_PHI, k1 = (k0 + 1) % T_PHI, f = a - Math.floor(a);
      const j = Math.round((Math.min(T_MAX, Math.max(-T_MAX, G)) + T_MAX) / T_STEP), p = t[k0][j], q = t[k1][j];
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
    }
    const g = Math.abs(G), c = g > G_MAX ? luts.high : luts.S[Math.round(g / G_STEP)];
    if (viewer === 'circular') return c;
    const k = Math.sin(2 * phi) ** 2;
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  const put = (px, o, c) => { px[o] = 255 * encode(c[0]); px[o + 1] = 255 * encode(c[1]); px[o + 2] = 255 * encode(c[2]); px[o + 3] = 255; };

  // The light table from above: the scene is X mm either side of the disc's centre.
  const X = 80, Y = 50, R = st.FOOT.R, pos = { x: 18, y: -6 }, AR = 40; // analyzer centre and radius, mm
  const open = document.createElement('canvas'), shut = document.createElement('canvas');
  const state = () => {
    const rate = RATE(sCool.valueAsNumber), d = sThick.valueAsNumber;
    return { rate, d, dT: st.frozenDifference(rate, d) };
  };
  function paintScene() {
    const [, w, hh] = fit(canvas, Y / X), { d, dT } = state(), mm = (2 * X) / w;
    for (const c of [open, shut]) { c.width = w; c.height = hh; }
    const a = open.getContext('2d').createImageData(w, hh), b = shut.getContext('2d').createImageData(w, hh);
    const paper = tColor(ONES).lin, field = look(0, 0), k = st.planRetardation(R, R, d, dT);
    for (let j = 0; j < hh; j++) {
      const y = Y - (j + 0.5) * mm;
      for (let i = 0; i < w; i++) {
        const x = -X + (i + 0.5) * mm, r = Math.hypot(x, y), o = 4 * (j * w + i);
        put(a.data, o, paper);
        put(b.data, o, r < R ? look(k * (r / R) ** 2, Math.atan2(y, x)) : field);
      }
    }
    open.getContext('2d').putImageData(a, 0, 0); shut.getContext('2d').putImageData(b, 0, 0);
  }
  function compose() {
    const ctx = canvas.getContext('2d'), w = canvas.width, hh = canvas.height, s = w / (2 * X), dpr = Math.min(2, devicePixelRatio || 1);
    const sx = (x) => (x + X) * s, sy = (y) => (Y - y) * s;
    ctx.drawImage(open, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.arc(sx(pos.x), sy(pos.y), AR * s, 0, 2 * Math.PI); ctx.clip(); ctx.drawImage(shut, 0, 0); ctx.restore();
    ctx.lineWidth = dpr; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(sx(0), sy(0), R * s, 0, 2 * Math.PI); ctx.stroke();
    an.style.left = `${(sx(pos.x) / w) * 100}%`; an.style.top = `${(sy(pos.y) / hh) * 100}%`; an.style.width = `${((2 * AR * s) / w) * 100}%`;
    an.setAttribute('aria-valuetext', `second polarizer ${Math.round(Math.hypot(pos.x, pos.y))} mm from the centre of the foot`);
  }

  // The foot through its edge: a ray at offset x crosses the whole chord at height z.
  const EX = 36, EZ = 10;
  function paintEdge() {
    const [ctx, w, hh] = fit(edge, EZ / EX), { d, dT } = state(), mm = (2 * EX) / w;
    const img = ctx.createImageData(w, hh), field = look(0, Math.PI / 4), SUB = 4;
    for (let j = 0; j < hh; j++) {
      for (let i = 0; i < w; i++) {
        const x = -EX + (i + 0.5) * mm, o = 4 * (j * w + i);
        let c = [0, 0, 0], n = 0;
        for (let k = 0; k < SUB; k++) { // average sub-rows, since fringes crowd near the faces
          const z = EZ - (j + (k + 0.5) / SUB) * mm;
          if (Math.abs(x) >= R || Math.abs(z) > d / 2) continue;
          const g = look(st.edgeRetardation(x, z, R, d, dT), Math.PI / 4);
          c[0] += g[0]; c[1] += g[1]; c[2] += g[2]; n++;
        }
        const f = n / SUB;
        put(img.data, o, n ? c.map((v, m) => v / SUB + field[m] * (1 - f)) : field);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function words() {
    const { rate, d, dT } = state(), face = -st.surfaceStress(d, dT), core = st.coreStress(d, dT);
    const rim = Math.abs(st.planRetardation(R, R, d, dT)), through = Math.abs(st.edgeRetardation(0, d / 2, R, d, dT));
    const mins = (st.GLASS.anneal - st.GLASS.strain) / rate;
    const time = mins < 1 ? `${Math.round(mins * 60)} s` : mins < 90 ? `${Math.round(mins)} min` : `${(mins / 60).toFixed(1)} h`;
    $('coolOut').textContent = `${rate < 10 ? rate.toFixed(1) : Math.round(rate)} °C/min`;
    $('thickOut').textContent = `${d} mm`;
    const bar = (v) => `${Math.min(100, Math.max(1.5, (Math.log10(Math.max(v, 1e-3)) + 2) * 25))}%`; // log scale, 0.01 to 100
    const row = (name, val, v) => h('div', {}, h('dt', {}, name), h('dd', {}, val), h('i', { style: { '--v': bar(v), '--c': 'var(--ink)' } }));
    const mpa = (v) => (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)) + ' MPa';
    $('lehrMeters').replaceChildren(
      row('faces · compression', mpa(face), face),
      row('core · tension', mpa(core), core),
      row('rim, face on · retardation', `${rim < 10 ? rim.toFixed(1) : Math.round(rim)} nm`, rim / 6),
      row(`${st.GLASS.anneal} → ${st.GLASS.strain} °C takes`, time, mins / 6));
    const state_ = rim < 3 ? `Annealed. Face on, ${rim.toFixed(1)} nm of retardation at the rim is far less than a wavelength, so between crossed polarizers the foot all but vanishes into the dark field.`
      : rim < 150 ? 'Low stress: first-order grey and white, brightest at the rim, where the hoop stress differs most from the radial.'
      : rim < 450 ? 'The rim has reached first-order yellow and orange. Rings of equal colour are lines of equal retardation, and they crowd toward the rim because the stress there grows as the square of the radius.'
      : 'Past first-order red into blue at the rim. Each repeat of the colours is another wavelength of retardation: this piece is carrying real stress.';
    const sodium = lamp.id === 'sodium' ? ' Under the sodium lamp there is only one wavelength, so the colours collapse into light and dark rings. Each dark ring is one more 589 nm of retardation: count them and you have measured the stress.' : '';
    $('lehrRead').textContent = `${state_} ${VIEW_NOTES[viewer]}${sodium}`;
    $('edgeRead').textContent = `Through the edge the foot shows what face on hides: compression of ${mpa(face)} in a band at each face, tension of ${mpa(core)} in the core, and between them a line where the stress passes through zero (dark between crossed polarizers), 58% of the way from the middle to each face. The light now crosses ${2 * R} mm of glass instead of ${d}, so the same stress gives up to ${through < 10 ? through.toFixed(1) : Math.round(through)} nm. Thickness counts twice: the frozen difference grows as its square.`;
    for (const [id, b] of views) b.setAttribute('aria-pressed', String(id === viewer));
  }

  function render() {
    raf = 0;
    if (litBy !== lamp || !luts) build();
    paintScene(); compose(); paintEdge(); words();
  }
  function queue() { if (!raf) raf = requestAnimationFrame(render); }

  // Drag the second polarizer; it can hang off the table's edge by up to half its width.
  const toMM = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 2 * X - X, y: Y - ((e.clientY - r.top) / r.width) * 2 * X }; };
  const clampPos = () => { pos.x = Math.min(X, Math.max(-X, pos.x)); pos.y = Math.min(Y, Math.max(-Y, pos.y)); };
  let drag = null;
  an.addEventListener('pointerdown', (e) => { e.preventDefault(); an.setPointerCapture(e.pointerId); const p = toMM(e); drag = { id: e.pointerId, dx: pos.x - p.x, dy: pos.y - p.y }; });
  an.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const p = toMM(e); pos.x = p.x + drag.dx; pos.y = p.y + drag.dy; clampPos(); compose(); });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  an.addEventListener('pointerup', end); an.addEventListener('pointercancel', end);
  an.addEventListener('keydown', (e) => {
    const m = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key];
    if (!m) return;
    e.preventDefault(); pos.x += m[0]; pos.y += m[1]; clampPos(); compose();
  });
  sCool.addEventListener('input', queue); sThick.addEventListener('input', queue);
  addEventListener('resize', queue); onLamp(() => { luts = null; queue(); });
}

/* ---------- 07 the cold shop: dichroic ---------- */
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
    const light = lampLight();
    strip($('stripDi'), T, light.map((v, i) => v * Math.min(1, R[i] / 0.9)), light.map((v, i) => v * T[i]));
    $('angleOut').textContent = `${deg}° · band at ${Math.round(center)} nm`;
  };
  s.addEventListener('input', render); addEventListener('resize', render); onLamp(render);
}

/* ---------- 08 the rack: real supplier colours on hue shelves ---------- */
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
    d.style.setProperty('--c', it.hex); d.dataset.i = i; it.el = d; it.c = it.hex;
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
      h('i', { style: { '--c': it.c } }),
      h('div', {}, h('strong', {}, it.name), h('span', {}, `${it.supplier} · ${it.code} · ${it.opacity}${colorants} · ${MECH_NOTE[it.mechanism] ?? it.mechanism}`)),
    );
  };
  const bench = fitBench();
  let pinned = null;
  mosaic.addEventListener('pointerover', (e) => show(e.target));
  mosaic.addEventListener('pointerleave', () => pinned && show(pinned));
  const pick = (el) => {
    pinned = el; show(pinned); bench(items[pinned.dataset.i]);
    // On a phone the bench sits under the shelves, out of sight.
    if (matchMedia('(max-width: 820px)').matches) $('fit').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  mosaic.addEventListener('click', (e) => e.target?.dataset?.i && pick(e.target));
  // Keyboard: the rack is one tab stop; arrow keys walk the visible rods, Enter puts one on the bench.
  mosaic.tabIndex = 0;
  mosaic.setAttribute('aria-label', 'rack of rods: arrow keys to browse, Enter to reverse-engineer');
  mosaic.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      const vis = [...mosaic.querySelectorAll('.rods div')].filter((d) => d.style.display !== 'none');
      const at = vis.indexOf(on);
      show(vis[Math.min(vis.length - 1, Math.max(0, at < 0 ? 0 : at + step))]);
      on?.scrollIntoView({ block: 'nearest' });
      e.preventDefault();
    } else if ((e.key === 'Enter' || e.key === ' ') && on) { pick(on); e.preventDefault(); }
  });
  // Start the bench on a rod whose label names its colorant and whose photo that colorant can
  // match (Bullseye's cadmium yellow), so the first thing it shows is a claim that checks out.
  // Wait until the rack is near the screen: a fit takes a moment.
  const first = [...mosaic.querySelectorAll('.rods div')].find((d) => items[d.dataset.i].code === '004220')
    ?? mosaic.querySelector('.rods div');
  if (first) {
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || pinned) return;
      io.disconnect(); pinned = first; show(first); bench(items[first.dataset.i]);
    }, { rootMargin: '300px' });
    io.observe($('fit'));
  }

  const counts = items.reduce((m, it) => ((m[it.mechanism] = (m[it.mechanism] || 0) + 1), m), { all: items.length });
  const box = $('filters');
  for (const [id, lab] of MECH) {
    const b = h('button', { className: 'chip', 'aria-pressed': String(id === 'all') }, `${lab} `, h('span', {}, String(counts[id] || 0)));
    b.addEventListener('click', () => {
      for (const x of box.children) x.setAttribute('aria-pressed', String(x === b));
      for (const d of mosaic.querySelectorAll('.rods div')) d.style.display = id === 'all' || items[d.dataset.i].mechanism === id ? '' : 'none';
      if (on && on.style.display === 'none') { on.classList.remove('on'); on = null; tag.replaceChildren(...blank.map((n) => n.cloneNode(true))); }
      if (pinned && pinned.style.display === 'none') pinned = null; // the bench keeps its last result
      recount();
    });
    box.appendChild(b);
  }

  // Relighting: the swatches are photos, not spectra, so each gets a smooth spectrum that reproduces
  // its daylight colour (spectra.js upsample), fitted the first time the lamp changes.
  let fitted = false;
  onLamp(() => {
    if (lamp === LAMP.daylight && !fitted) return;
    for (const it of items) {
      if (!fitted) it.T = upsample([1, 3, 5].map((i) => parseInt(it.hex.slice(i, i + 2), 16) / 255), LAMP.daylight.spd);
      it.c = lamp === LAMP.daylight ? it.hex : tColor(it.T).css;
      it.el.style.setProperty('--c', it.c);
    }
    fitted = true;
    if (on) show(on);
  });
}

/* ---------- 09 the showroom: uranium glass gives light back ---------- */
function showroom() {
  const canvas = $('stripU');
  for (const id of ['black', 'daylight']) {
    const b = h('button', { className: 'chip' }, h('i', { style: { '--c': lampColor(LAMP[id].spd) } }), `switch on ${LAMP[id].label}`);
    b.addEventListener('click', () => setLamp(LAMP[id]));
    $('uLamps').appendChild(b);
  }
  // The strip runs from 300 nm so the ultraviolet shows: hatched, because the eye cannot see it.
  function draw(top, bottom, curve) {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
    const ctx = canvas.getContext('2d'), n = u.EXT.length, nUV = u.UV.length;
    const half = Math.round(hh * 0.42), gap = Math.round(hh * 0.08);
    const color = (i, v) => (i < nUV ? `rgba(150, 110, 255, ${0.08 + 0.85 * v})` : css(SPECTRAL[i - nUV].map((c) => encode(c * v))));
    ctx.clearRect(0, 0, w, hh);
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor((i / n) * w), x1 = Math.ceil(((i + 1) / n) * w);
      ctx.fillStyle = color(i, top[i]); ctx.fillRect(x0, 0, x1 - x0, half);
      ctx.fillStyle = color(i, bottom[i]); ctx.fillRect(x0, half + gap, x1 - x0, hh - half - gap);
    }
    const xv = (nUV / n) * w; // hatch the invisible part
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, xv, hh); ctx.clip();
    ctx.strokeStyle = 'rgba(0, 0, 0, .35)'; ctx.lineWidth = 1 * dpr;
    for (let x = -hh; x < xv; x += 6 * dpr) { ctx.beginPath(); ctx.moveTo(x, hh); ctx.lineTo(x + hh, 0); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * w, y = hh - 3 * dpr - curve[i] * (hh - half - gap - 6 * dpr);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  function render() {
    const c = uraniumOf(), Text = u.EXT.map((w) => 10 ** -u.density(w));
    const out = u.EXT.map((w, i) => lamp.ext[i] * Text[i] + (i < u.UV.length ? 0 : c.F[i - u.UV.length]));
    const peak = (a) => Math.max(...a, 1e-30);
    draw(lamp.ext.map((v) => v / peak(lamp.ext)), out.map((v) => v / peak(out)), Text);
    $('uPane').style.setProperty('--c', c.css);
    $('uPane').style.setProperty('--glow', c.glowCss);
    $('uPane').classList.toggle('lit', c.glow > 0.5);
    const pct = c.glow * 100, share = pct < 0.1 ? 'under 0.1%' : pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
    $('uTag').textContent = `${share} of this light is glow`;
    $('uRead').textContent = lamp.dark
      ? 'The torch puts out almost nothing you can see, so there is nothing to take away. The glass absorbs the ultraviolet and sends a share of it back out as green: all the light you see from it is light it made.'
      : lamp.lines
        ? 'The sodium lamp has no ultraviolet and no blue, so there is nothing for the uranium to absorb or to re-emit. It looks like plain glass, the same orange as everything else.'
        : `Under ${lamp.label} the glass is mostly a filter: it takes away violet and blue and looks yellow. The ultraviolet in the light makes ${share} of what you see from it, a faint green cast on top.`;
  }
  addEventListener('resize', render); onLamp(render);
}

/* ---------- the lamp switch: one light for the whole page ---------- */
// The page's paper, table and rules are lit by the lamp too: each base colour is multiplied by the
// colour white paper takes on under it.
const BASE = { '--paper': '#f3f4f1', '--paper-2': '#e9eae5', '--rule': '#d6d8d2', '--panel': '#fafaf8' };
// When the paper goes nearly black (the black light), the page needs light ink and visible rules.
const DARK = { '--rule': '#2d2838', '--paper-2': '#17131f', '--panel': '#110e18' };
let setLamp = () => {};
function lampSwitch() {
  const bar = $('lamps'), spark = $('lampSpark'), root = document.documentElement;
  const hex = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const buttons = LAMPS.map((l) => {
    const b = h('button', { className: 'lamp', 'aria-pressed': String(l === lamp) }, h('i', { style: { '--c': lampColor(l.spd) } }), l.label);
    b.addEventListener('click', () => set(l));
    bar.appendChild(b);
    return [b, l];
  });
  function sparkline() {
    const r = spark.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (spark.width !== w || spark.height !== hh) { spark.width = w; spark.height = hh; }
    const ctx = spark.getContext('2d'), L = lampLight(), n = GRID.length;
    ctx.clearRect(0, 0, w, hh);
    for (let i = 0; i < n; i++) {
      const x0 = Math.floor((i / n) * w), x1 = Math.ceil(((i + 1) / n) * w), y = Math.max(1 * dpr, L[i] * hh);
      ctx.fillStyle = css(SPECTRAL[i].map((v) => encode(Math.min(1, v * 1.6))));
      ctx.fillRect(x0, hh - y, x1 - x0, y);
    }
  }
  function set(l) {
    lamp = l;
    const tint = tColor(ONES).rgb;
    const dark = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2] < 0.2;
    for (const [k, v] of Object.entries(BASE)) root.style.setProperty(k, dark && DARK[k] ? DARK[k] : css(hex(v).map((c, i) => c * tint[i])));
    root.style.setProperty('--tint', css(tint));
    root.toggleAttribute('data-dark', dark);
    for (const [b, x] of buttons) b.setAttribute('aria-pressed', String(x === l));
    $('lampName').textContent = l.id === 'daylight' ? 'daylight' : `a ${l.label}`;
    $('lampNote').textContent = l.note;
    sparkline();
    for (const fn of relight) fn();
  }
  addEventListener('resize', sparkline);
  setLamp = set;
  set(lamp);
}

/* ---------- ← the record: the history rail ---------- */
function historyRail() {
  const box = $('history');
  // a pin's colour comes from the same engine as the stage it links to, under the page's lamp
  const pinColor = (c) => (c.uranium ? uraniumOf(c.thickness ?? 1)
    : c.dichroic != null ? tColor(dichroicBand(c.dichroic).R.map((r) => 1 - r)) : colorOf(c.parts, c.thickness ?? 1)).css;
  onLamp(() => {
    for (const p of history.pins) {
      if (!p.color) continue;
      for (const el of box.querySelectorAll(`[data-pin="${p.id}"]`)) el.style.setProperty('--c', pinColor(p.color));
    }
  });
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

/* ---------- 08 the rack, continued: the bench works a rod backwards to a melt ---------- */
const BENCH_LAMP = 'a tungsten bulb';
function fitBench() {
  const fitter = makeFitter(optics, { lamp: 'incandescent' });
  const lab = (id) => COLORANT[id]?.label ?? id;
  const names = (parts) => parts.map(([id]) => lab(id)).join(' + ');
  const verdict = (dE) =>
    dE <= 1 ? 'Side by side you could not tell them apart.'
    : dE <= MATCH ? 'Close enough to pass for the same color side by side.'
    : dE <= 6 ? 'Near, but visibly off. The twelve curves cannot quite reach this color.'
    : 'Far off. No melt of these colorants makes this color, so something else is going on.';
  // A melt in the mixing lab: concentrations up to 1 at a wall up to 4× thick, so scale the
  // wall to fit the strongest colorant and divide it back out.
  const labLink = (parts) => {
    const t = Math.min(4, 2 ** Math.max(0, Math.ceil(Math.log2(Math.max(...parts.map(([, c]) => c))))));
    const melt = parts.map(([id, c]) => `${id}:${(c / t).toFixed(3)}`).join(',');
    return `${$('fitLab').getAttribute('href').split('?')[0]}?melt=${melt}&t=${t}`;
  };
  const row = (r, name) => h('div', {}, h('span', {}, name),
    h('i', { style: { '--c': r.hex }, title: 'daylight' }), h('i', { style: { '--c': r.lamp.hex }, title: BENCH_LAMP }));
  let job = 0;

  return function show(it) {
    const id = ++job;
    $('fitEmpty').hidden = true; $('fitBody').hidden = false;
    $('fitName').textContent = it.name;
    $('fitMeta').textContent = `${it.supplier} · ${it.code} · ${it.opacity}`;
    $('fitPhoto').style.setProperty('--c', it.hex);
    $('fit').classList.add('busy');
    $('fitVerdict').textContent = 'Weighing every melt of up to three colorants…';
    // Yield a frame so the click paints before the search runs.
    setTimeout(() => {
      if (id !== job) return;
      const r = fitter.fit(it.hex), b = r.best;
      $('fit').classList.remove('busy');
      $('fitGlass').style.setProperty('--c', b.hex);
      $('fitVerdict').replaceChildren(
        h('b', {}, `ΔE ${b.dE.toFixed(1)}. `), verdict(b.dE),
        ` ${r.matches} of the ${r.tried} melts tried ${r.matches === 1 ? 'matches' : 'match'} this photo; this is the simplest.`,
      );
      const top = Math.log(C_MAX / 0.01);
      $('fitRecipe').replaceChildren(...b.parts.map(([cid, c]) => h('li', {},
        h('i', { style: { '--c': colorOf([[cid, 1]], 1.2).css } }),
        h('span', {}, lab(cid)),
        h('em', { style: { '--w': `${Math.max(4, (100 * Math.log(c / 0.01)) / top)}%` } }),
        h('output', {}, `×${c < 0.1 ? c.toFixed(3) : c.toFixed(2)}`),
      )));
      strip($('fitStrip'), mixT(b.parts));

      if (r.alternatives.length) {
        const alt = r.alternatives[0];
        $('fitSplit').textContent = `Here is the simplest melt beside the other matching melt that disagrees with it most under ${BENCH_LAMP}. In daylight they are ΔE ${alt.gap.toFixed(1)} apart. Under the bulb they are ${alt.split.toFixed(1)} apart${alt.split > 3 ? ', which a glassblower holding both rods would see' : ', still close: this palette has few ways to make this color'}.`;
        $('fitAlts').replaceChildren(
          h('div', { className: 'key' }, h('span'), h('b', {}, 'day'), h('b', {}, 'bulb')),
          ...[b, ...r.alternatives].map((x, i) => row(x, i ? names(x.parts) : `${names(x.parts)} (simplest)`)),
        );
      } else {
        $('fitSplit').textContent = `No other melt matches, so within this palette the recipe is fairly well pinned down. Under ${BENCH_LAMP} it looks like this:`;
        $('fitAlts').replaceChildren(h('div', { className: 'key' }, h('span'), h('b', {}, 'day'), h('b', {}, 'bulb')), row(b, names(b.parts)));
      }

      const known = it.colorant.filter((c) => COLORANT[c]);
      if (known.length) {
        const l = fitter.fit(it.hex, { only: known }).best;
        const ok = l.dE <= MATCH ? 'matches the photo, so the label and the color agree' : l.dE <= 6 ? 'comes near the photo but not all the way' : 'cannot reach the photo. The photo, the label or the page\'s illustrative curve for it must be off, or the color comes from something the label does not name';
        $('fitLabel').replaceChildren(h('b', {}, 'The label says ' + names(known.map((c) => [c])) + '. '), `${known.length > 1 ? 'Together, at their best amounts, they reach' : 'On its own, at its best amount, it reaches'} ΔE ${l.dE.toFixed(1)}: ${known.length > 1 ? 'the mix' : 'it'} ${ok}.`);
      } else $('fitLabel').replaceChildren(h('b', {}, 'No colorant on the label. '), 'The supplier does not say what is in this one, so the bench has nothing to check its guess against.');

      const scatter = ' The photo shows light scattered back from inside the glass, not light passed through it, so a transmission fit is only an analogy.';
      const lit = {
        transparent: '', translucent: scatter, opal: scatter, opalescent: scatter,
        streaky: ' This is a streaky glass, so the swatch is an average of several colors that may each have their own recipe.',
        metallic: ' This glass gets its look partly from a metallic surface or sparkle, which no absorption curve describes.',
        dichroic: ' A dichroic coating colors this glass by interference, not absorption, so no melt is the true answer.',
      }[it.opacity] ?? ' The catalog does not say whether it is transparent. If it is opaque, the fit is only an analogy.';
      $('fitCaveat').textContent = `The bench fits the photo, which carries its own lighting and white balance.${lit}`;
      $('fitLab').href = labLink(b.parts);
    }, 30);
  };
}

export function initHome() {
  lightTable(); glassStage({ colorOf, onLamp }); batch(); redox(); ions(vessel()); heat(); strike(); lehr(); dichroic(); initDispersion({ getLamp: () => lamp, onLamp }); rack(); showroom(); historyRail(); lampSwitch();
}
