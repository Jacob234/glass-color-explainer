// fire.js — the cut piece in the cold shop, cut (components/Dispersion.astro): white light falling on
// a brilliant-cut section, trapped by total internal reflection and sent back out through the top,
// split into colors on the way. Physics in dispersion.js; colors through lamps.js.
import { GRID, SPECTRAL, css } from './spectra.js';
import { underLamp } from './lamps.js';
import { GLASS, LINES, index, criticalAngle, returnWindow, brilliant, beamFate } from './dispersion.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const ZERO = GRID.map(() => 0);
const FINE = Array.from({ length: 401 }, (_, i) => 380 + i);
const svg = (tag, attrs = {}, parent = null) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
};
const HUE = SPECTRAL.map((c) => { const m = Math.max(...c, 1e-6); return css(c.map((v) => Math.min(1, (v / m) ** 0.8))); });
const fit = (canvas) => {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return [ctx2(canvas), w, h];
};
const ctx2 = (c) => c.getContext('2d');

// The glasses on offer, and diamond for comparison in the window chart (its index at the d line
// only, as Tolkowsky gives it; no dispersion formula, so it is not traced in color).
const PICK = ['sodalime', 'llf1', 'f2', 'sf11'];
const DIAMOND = { id: 'diamond', label: 'diamond', formula: 'cauchy', coef: [2.417, 0, 0] };
const TOLKOWSKY = 40.75; // 40° 45′, his pavilion angle for diamond

// Geometry in millimetres: a piece 20 mm across, drawn at K units to the millimetre.
const R = 10, K = 15, CEIL = 1000, SPAN = 1200, BINS = 240, ACROSS = 120;

export function initFire({ getLamp, onLamp }) {
  let glass = GLASS.sodalime;
  const pav = $('pavilion'), tilt = $('tilt'), scene = $('fireScene');
  const lampNorm = () => { const s = getLamp().spd, m = Math.max(...s); return s.map((v) => v / m); };
  const dirOf = () => { const t = tilt.valueAsNumber * Math.PI / 180; return [-Math.sin(t), Math.cos(t)]; };

  /* ---------- the scene ---------- */
  const gBeam = svg('g', {}, scene), gem = svg('polygon', { class: 'gem', tabindex: '0', role: 'slider', 'aria-label': 'the cut piece: drag sideways to tilt the light, or use the arrow keys' }, scene);
  const gRays = svg('g', { class: 'rays' }, scene), gTir = svg('g', {}, scene), gLab = svg('g', {}, scene);
  const P = (p) => `${(p[0] * K).toFixed(1)},${(p[1] * K).toFixed(1)}`;
  const lab = (x, y, t, anchor = 'start') => { svg('text', { x, y, class: 'scene-lab', 'text-anchor': anchor }, gLab).textContent = t; };

  function drawScene(poly, n, dir) {
    gem.setAttribute('points', poly.map(P).join(' '));
    gBeam.replaceChildren(); gRays.replaceChildren(); gTir.replaceChildren(); gLab.replaceChildren();
    // the incoming beam, the light table's own white: drawn as two ink edges, as on the prism bench
    const perp = [-dir[1], dir[0]], s = poly.map((p) => p[0] * perp[0] + p[1] * perp[1]);
    const at = (q, y) => { const k = (y - q * perp[1]) / dir[1]; return [q * perp[0] + k * dir[0], y]; };
    const edges = [Math.min(...s), Math.max(...s)].map((q) => [at(q, -18), at(q, -6)]);
    svg('polygon', { class: 'beam', points: [edges[0][0], edges[1][0], edges[1][1], edges[0][1]].map(P).join(' ') }, gBeam);
    lab(-390, -278, 'WHITE LIGHT IN');
    lab(390, 326, 'OUT THE BACK', 'end');
    lab(390, -278, 'BACK OUT THE TOP', 'end');

    // inside the glass the colors have barely parted: each ray drawn once, along the d line, with a
    // ring where it reflects totally (every bounce inside is one, since partial reflections are not followed)
    const RAYS = 12, light = lampNorm();
    for (const { r } of beamFate(poly, n, dir, RAYS, { rays: true }).list) {
      svg('polyline', { points: r.pts.slice(1).map(P).join(' '), class: 'ray-in' }, gRays);
      r.pts.slice(2, r.out ? -1 : undefined).forEach((p) => svg('circle', { cx: p[0] * K, cy: p[1] * K, r: 3.2, class: 'tir' }, gTir));
    }
    // out of the glass, every fourth wavelength on the grid, weighted by the lamp
    for (let i = 0; i < GRID.length; i += 4) {
      if (light[i] < 0.004) continue;
      for (const { r } of beamFate(poly, index(glass, GRID[i]), dir, RAYS, { rays: true }).list) {
        if (!r.out) continue;
        const p = r.pts[r.pts.length - 1], q = [p[0] + 15 * r.dir[0], p[1] + 15 * r.dir[1]];
        svg('line', { x1: p[0] * K, y1: p[1] * K, x2: q[0] * K, y2: q[1] * K, stroke: HUE[i], 'stroke-opacity': (0.25 + 0.75 * light[i] * r.T).toFixed(2) }, gRays);
      }
    }
  }

  /* ---------- the light thrown above and below ---------- */
  // Every ray across the beam at 1 nm (or at a line lamp's lines) lands on a ceiling CEIL mm above or a
  // table CEIL mm below; each bin of the strips adds up the spectrum that lands in it.
  function thrown(poly, dir) {
    const lamp = getLamp(), spd = lamp.spd;
    const at = (nm) => { const x = (nm - 380) / 5, i = Math.min(GRID.length - 2, Math.floor(x)); return spd[i] + (spd[i + 1] - spd[i]) * (x - i); };
    const src = lamp.lines ? lamp.lines.map(([w, p]) => [w, p]) : FINE.map((nm) => [nm, at(nm) / 5]);
    const up = Array.from({ length: BINS }, () => GRID.map(() => 0)), down = Array.from({ length: BINS }, () => GRID.map(() => 0));
    for (const [nm, power] of src) {
      if (power <= 0) continue;
      const g = Math.round((nm - 380) / 5);
      for (const { r, up: isUp, w } of beamFate(poly, index(glass, nm), dir, ACROSS, { rays: true }).list) {
        if (!r.out || r.T === 0 || Math.abs(r.dir[1]) < 0.05) continue;
        const p = r.pts[r.pts.length - 1], plane = isUp ? -CEIL : CEIL, t = (plane - p[1]) / r.dir[1];
        if (t <= 0) continue;
        const x = p[0] + t * r.dir[0], bin = Math.floor(((x + SPAN) / (2 * SPAN)) * BINS);
        if (bin >= 0 && bin < BINS) (isUp ? up : down)[bin][g] += power * r.T * w;
      }
    }
    // one exposure for both strips, set by the brightest bin, so above and below compare honestly
    const col = (L, k) => underLamp(ZERO, lamp, L.map((v) => v * k));
    let peak = 1e-12;
    for (const L of [...up, ...down]) if (L.some((v) => v > 0)) peak = Math.max(peak, ...col(L, 1).lin);
    return { up: up.map((L) => col(L, 1 / peak).css), down: down.map((L) => col(L, 1 / peak).css) };
  }
  const strips = { up: null, down: null };
  function paint(id, cols) {
    const [ctx, w, h] = fit($(id));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    cols.forEach((c, j) => { ctx.fillStyle = c; ctx.fillRect(Math.floor((j / cols.length) * w), 0, Math.ceil(w / cols.length) + 1, h); });
  }

  /* ---------- the window chart: which pavilion angles send light back ---------- */
  const chart = $('windowChart'), X0 = 160, X1 = 588, A0 = 30, A1 = 56, ROW = 34, Y0 = 26;
  const xOf = (a) => X0 + ((a - A0) / (A1 - A0)) * (X1 - X0);
  const rows = [...PICK.map((id) => GLASS[id]), DIAMOND];
  for (let a = A0; a <= A1; a += 2) {
    svg('line', { x1: xOf(a), x2: xOf(a), y1: Y0 - 6, y2: Y0 + rows.length * ROW, class: 'grid' }, chart);
    if (a % 4 === 2) svg('text', { x: xOf(a), y: Y0 + rows.length * ROW + 18, 'text-anchor': 'middle', class: 'tick' }, chart).textContent = `${a}°`;
  }
  svg('text', { x: (X0 + X1) / 2, y: Y0 + rows.length * ROW + 40, 'text-anchor': 'middle', class: 'tick' }, chart).textContent = 'pavilion angle, from the girdle plane';
  const tol = xOf(TOLKOWSKY);
  svg('line', { x1: tol, x2: tol, y1: Y0 - 8, y2: Y0 + rows.length * ROW, class: 'tolk' }, chart);
  svg('text', { x: tol, y: Y0 - 12, 'text-anchor': 'middle', class: 'tick' }, chart).textContent = 'Tolkowsky';
  const rowEls = rows.map((g, k) => {
    const y = Y0 + k * ROW, n = index(g, LINES.d), [lo, hi] = returnWindow(n);
    const label = svg('text', { x: X0 - 10, y: y + 17, 'text-anchor': 'end', class: 'clab' }, chart);
    label.textContent = g.id === 'sodalime' ? 'window glass' : g.label.replace(/ .*$/, '');
    // the share of a straight-down beam over the table that comes back out of the top, traced
    for (let a = A0; a < A1; a += 0.25) {
      const f = beamFate(brilliant(0, 0, R, a + 0.125), n, [0, 1], 30, { only: [-0.53 * R, 0.53 * R] });
      if (f.up > 0.01) svg('rect', { x: xOf(a), y: y + 4, width: xOf(a + 0.25) - xOf(a) + 0.3, height: ROW - 10, class: 'ret', 'fill-opacity': Math.min(1, f.up / 0.9).toFixed(2) }, chart);
    }
    svg('text', { x: X1 + 8, y: y + 17, class: 'tick' }, chart).textContent = `θc ${lo.toFixed(1)}°`;
    return { g, label, lo, hi };
  });
  const marker = svg('line', { y1: Y0 - 8, y2: Y0 + rows.length * ROW, class: 'pav-mark' }, chart);

  /* ---------- render ---------- */
  function render() {
    const a = pav.valueAsNumber, dir = dirOf(), poly = brilliant(0, 0, R, a), n = index(glass, LINES.d);
    drawScene(poly, n, dir);
    marker.setAttribute('x1', xOf(a)); marker.setAttribute('x2', xOf(a));
    for (const r of rowEls) r.label.classList.toggle('on', r.g === glass);
    const t = thrown(poly, dir); strips.up = t.up; strips.down = t.down;
    paint('fireUp', t.up); paint('fireDown', t.down);

    const f = beamFate(poly, n, dir, 400), [lo, hi] = returnWindow(n), pct = (v) => `${Math.round(100 * v)}%`;
    const lamp = getLamp();
    let txt = `${glass.label}: critical angle ${criticalAngle(n).toFixed(1)}°. Of the light falling on the piece, ${pct(f.up)} comes back out of the top and ${pct(f.down)} leaks out of the back; the remaining ${pct(1 - f.up - f.down)} is reflected partially at the surfaces and not followed here.`;
    txt += a < lo ? ` The pavilion is cut at ${a}°, under the critical angle, so light coming straight down escapes through the first pavilion facet.`
      : a > hi ? ` The pavilion is cut at ${a}°, past ${hi.toFixed(1)}°, so light reflected by one pavilion facet meets the other under the critical angle and escapes there.`
        : ` At ${a}° the pavilion reflects light coming straight down twice and sends it back up.`;
    if (tilt.valueAsNumber !== 0) txt += ' Light at a slant meets the facets at other angles, so some of it leaks even from a well-cut piece.';
    if (lamp.lines) txt += ' Under the sodium lamp there is one wavelength, so the spots above are one color: the cut still returns light, but there is no fire.';
    $('fireRead').textContent = txt;
    $('pavOut').textContent = `${a}°`;
    $('tiltOut').textContent = `${tilt.valueAsNumber}°`;
  }

  const pick = $('firePick'), buttons = PICK.map((id) => {
    const g = GLASS[id], b = document.createElement('button');
    b.className = 'chip chip-plain'; b.textContent = id === 'llf1' ? 'LLF1, lead-crystal stand-in' : id === 'sodalime' ? 'window glass' : g.label; b.dataset.id = id;
    b.addEventListener('click', () => { glass = g; sync(); render(); });
    pick.appendChild(b); return b;
  });
  const sync = () => { for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.id === glass.id)); };

  // tilting the light: drag the piece sideways, the arrow keys, or the slider
  let grab = null;
  const setTilt = (v) => { tilt.value = String(Math.max(+tilt.min, Math.min(+tilt.max, Math.round(v)))); render(); };
  gem.addEventListener('pointerdown', (e) => { grab = { x: e.clientX, v: tilt.valueAsNumber }; gem.setPointerCapture(e.pointerId); e.preventDefault(); });
  gem.addEventListener('pointermove', (e) => { if (grab) setTilt(grab.v + (e.clientX - grab.x) / 6); });
  const drop = () => { grab = null; };
  gem.addEventListener('pointerup', drop); gem.addEventListener('pointercancel', drop);
  gem.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (step) { setTilt(tilt.valueAsNumber + step); e.preventDefault(); }
  });
  pav.addEventListener('input', render); tilt.addEventListener('input', render);
  addEventListener('resize', () => { if (strips.up) { paint('fireUp', strips.up); paint('fireDown', strips.down); } });
  sync(); render();
  onLamp(render);
}
