// prism.js — the instruments for the cold shop, cut (components/Dispersion.astro): a prism bench,
// the index chart, and crown against achromat. Physics in dispersion.js; colors through lamps.js,
// under whatever lamp the page is lit by.
import { GRID, SPECTRAL, css } from './spectra.js';
import { underLamp } from './lamps.js';
import { initFire } from './fire.js';
import { GLASSES, GLASS, LINES, index, abbe, spread, uvResonance, prism, trace, deviation, onCard, focal, lineImage } from './dispersion.js';

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
// A wavelength's hue at full strength, for drawing a ray: SPECTRAL with its brightest channel at 1.
const HUE = SPECTRAL.map((c) => { const m = Math.max(...c, 1e-6); return css(c.map((v) => Math.min(1, (v / m) ** 0.8))); });
const fit = (canvas) => {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return [canvas.getContext('2d'), w, h];
};

// Scene geometry, in millimeters; the drawing is 3.2 units to the millimeter.
const K = 3.2, SIDE = 60, CX = 150, CY = 105, HALF = 4; // 8 mm beam
const TILT = (28 * Math.PI) / 180, DIR = [Math.cos(TILT), -Math.sin(TILT)];
const MID = [CX - SIDE / 4, CY - (SIDE / Math.sqrt(3)) / 4]; // middle of the left face, prism untouched
const ORIGIN = [MID[0] - 160 * DIR[0], MID[1] - 160 * DIR[1]];
const cardMm = (v) => 20 * 150 ** (v / 100); // 20 mm to 3 m, on a log scale
const DRAWN = 100; // the drawing shortens the card's distance past this

export function initDispersion({ getLamp, onLamp }) {
  let glass = GLASS.bk7;
  const lampNorm = () => { const s = getLamp().spd, m = Math.max(...s); return s.map((v) => v / m); };

  /* ---------- the prism bench ---------- */
  const scene = $('prismScene'), turn = $('turn'), card = $('card');
  const gBeam = svg('g', {}, scene), gPrism = svg('polygon', { class: 'prism-glass', tabindex: '0', role: 'slider', 'aria-label': 'prism: drag to turn it, or use the arrow keys' }, scene);
  const gRays = svg('g', { class: 'rays' }, scene), gCard = svg('g', {}, scene);
  svg('text', { x: -40, y: 210, class: 'scene-lab' }, scene).textContent = 'WHITE LIGHT IN';
  const cardLab = svg('text', { class: 'scene-lab', 'text-anchor': 'end' }, scene);
  // the incoming beam: the light table's own white, so drawn as two ink edges
  const perp = [-DIR[1], DIR[0]], beamPts = [-HALF, HALF].map((k) => [ORIGIN[0] + k * perp[0], ORIGIN[1] + k * perp[1]]);

  // The card is lit at 1 nm steps, since a dense flint near its critical angle spreads neighboring
  // 5 nm samples apart; each 1 nm slice's light is added to the nearest sample of the observer's grid.
  function cardColors(poly, ref, D, samples) {
    const spd = getLamp().spd, at = (nm) => { const x = (nm - 380) / 5, i = Math.min(GRID.length - 2, Math.floor(x)); return spd[i] + (spd[i + 1] - spd[i]) * (x - i); };
    // a line lamp is traced at its own lines; anything else at 1 nm, each slice a fifth of a grid sample
    const lamp = getLamp(), src = lamp.lines ? lamp.lines.map(([w, a]) => [w, a]) : FINE.map((nm) => [nm, at(nm) / 5]);
    const hits = onCard(poly, glass, src.map(([w]) => w), ORIGIN, DIR, HALF, ref, D);
    let lo = Infinity, hi = -Infinity;
    hits.forEach((h, k) => { if (h && src[k][1] > 0) { lo = Math.min(lo, h.a); hi = Math.max(hi, h.b); } });
    if (!isFinite(lo)) return null;
    const pad = Math.max(2, 0.12 * (hi - lo)), s0 = lo - pad, s1 = hi + pad;
    const cols = Array.from({ length: samples }, (_, j) => {
      const s = s0 + ((j + 0.5) / samples) * (s1 - s0), L = GRID.map(() => 0);
      hits.forEach((h, k) => { if (h && s >= h.a && s <= h.b) L[Math.round((src[k][0] - 380) / 5)] += (src[k][1] * h.T * 2 * HALF) / Math.max(1e-6, h.b - h.a); });
      return underLamp(ZERO, lamp, L).css;
    });
    return { s0, s1, lo, hi, cols };
  }

  function renderPrism() {
    const deg = turn.valueAsNumber, poly = prism(CX, CY, SIDE, deg), P = (p) => `${(p[0] * K).toFixed(1)},${(p[1] * K).toFixed(1)}`;
    gPrism.setAttribute('points', poly.map(P).join(' '));
    gBeam.replaceChildren();
    const hit = trace(poly, index(glass, LINES.d), ORIGIN, DIR);
    const entry = hit.pts[1] ?? ORIGIN;
    svg('polygon', { class: 'beam', points: [beamPts[0], beamPts[1], [entry[0] + HALF * perp[0], entry[1] + HALF * perp[1]], [entry[0] - HALF * perp[0], entry[1] - HALF * perp[1]]].map(P).join(' ') }, gBeam);
    // inside the glass the colors have barely parted: drawn as one beam along the d line
    if (hit.pts.length > 2) svg('polyline', { class: 'beam-in', points: hit.pts.slice(1).map(P).join(' ') }, gBeam);

    // every other wavelength on the grid, weighted by the lamp
    const light = lampNorm(), rays = [];
    for (let i = 0; i < GRID.length; i += 2) {
      if (light[i] < 0.004) continue;
      const r = trace(poly, index(glass, GRID[i]), ORIGIN, DIR);
      rays.push({ i, r });
    }
    // the reference exit ray: the d line, or the reddest ray that gets out
    // a ray counts as through the prism only if it leaves by the far face, not after reflecting inside
    const through = (r) => r.out && r.T > 0 && r.tir === 0;
    const out = rays.filter(({ r }) => through(r));
    const dRay = through(hit) ? hit : out.length ? out[out.length - 1].r : null;
    gRays.replaceChildren(); gCard.replaceChildren();
    if (!dRay) {
      cardLab.textContent = '';
      $('prismRead').textContent = `${glass.label}: every wavelength meets the far face past its critical angle and is totally reflected inside the glass, so none reaches the card. Turn the prism toward glancing.`;
      fitStrip(null); return;
    }
    const ref = { p: dRay.pts[dRay.pts.length - 1], dir: dRay.dir };
    const D = cardMm(card.valueAsNumber), Dd = Math.min(D, DRAWN);
    const c0 = [ref.p[0] + Dd * ref.dir[0], ref.p[1] + Dd * ref.dir[1]], across = [-ref.dir[1], ref.dir[0]];
    for (const { i, r } of rays) {
      const path = through(r) ? r.pts.slice(-1) : r.pts.slice(1);
      if (through(r)) {
        const p = path[path.length - 1], den = r.dir[0] * ref.dir[0] + r.dir[1] * ref.dir[1];
        const t = den > 1e-6 ? ((c0[0] - p[0]) * ref.dir[0] + (c0[1] - p[1]) * ref.dir[1]) / den : 0;
        path.push([p[0] + t * r.dir[0], p[1] + t * r.dir[1]]);
      }
      svg('polyline', { points: path.map(P).join(' '), stroke: HUE[i], 'stroke-opacity': (through(r) ? 0.25 + 0.75 * light[i] * r.T : 0.18).toFixed(2) }, gRays);
    }
    // the card, colored where the light lands at the drawn distance
    const drawn = cardColors(poly, ref, Dd, 48);
    if (drawn) {
      const n = drawn.cols.length, half = Math.max(drawn.s1 - drawn.s0, 24) / 2, mid = (drawn.s0 + drawn.s1) / 2;
      const A = [c0[0] + (mid - half) * across[0], c0[1] + (mid - half) * across[1]], B = [c0[0] + (mid + half) * across[0], c0[1] + (mid + half) * across[1]];
      svg('line', { x1: A[0] * K, y1: A[1] * K, x2: B[0] * K, y2: B[1] * K, class: 'card-edge' }, gCard);
      drawn.cols.forEach((c, j) => {
        const s0 = drawn.s0 + (j / n) * (drawn.s1 - drawn.s0), s1 = drawn.s0 + ((j + 1) / n) * (drawn.s1 - drawn.s0);
        svg('line', { x1: (c0[0] + s0 * across[0]) * K, y1: (c0[1] + s0 * across[1]) * K, x2: (c0[0] + s1 * across[0]) * K, y2: (c0[1] + s1 * across[1]) * K, stroke: c, class: 'card-light' }, gCard);
      });
      cardLab.setAttribute('x', 880); cardLab.setAttribute('y', 590);
      cardLab.textContent = D > DRAWN ? `CARD · ${fmtMm(D)} (DRAWN NEARER)` : `CARD · ${fmtMm(D)}`;
    }
    fitStrip(cardColors(poly, ref, D, 200));

    // the readout
    const lost = rays.filter(({ r }) => !through(r)).map(({ i }) => GRID[i]);
    const ends = out.length > 1 ? [out[0], out[out.length - 1]] : null;
    const fan = ends ? Math.abs(deviation(ends[0].r.dir, ends[1].r.dir)) : 0;
    const dev = deviation(DIR, dRay.dir), lamp = getLamp();
    let txt = `${glass.label}: the d line turns ${dev.toFixed(1)}°, and the fan from ${ends ? `${ends[0].i * 5 + 380} to ${ends[1].i * 5 + 380} nm` : 'end to end'} opens ${fan.toFixed(2)}°.`;
    if (lamp.lines) txt = `Under the sodium lamp there is one wavelength, so there is nothing to fan out: the ray turns ${dev.toFixed(1)}° and stays one color.`;
    else if (lamp.dark) txt = 'Under the black light almost nothing visible goes in, so almost nothing comes out. A prism sorts light; it cannot make it.';
    if (lost.length && !lamp.lines && !lamp.dark) txt += ` Light below ${Math.max(...lost)} nm meets the far face past its critical angle and is totally reflected inside: violet goes first because glass bends it most.`;
    else if (!lamp.lines && !lamp.dark) {
      // blue and orange centers, D apart along the card: separated once they are well over a beam width apart
      const at = (nm) => out.find(({ i }) => GRID[i] === nm), b = at(430), o = at(650);
      const d = b && o ? cardMm(card.valueAsNumber) * Math.tan((deviation(b.r.dir, o.r.dir) * Math.PI) / 180) : 0;
      txt += d > 2 * HALF * 1.6 ? ' The colors have separated.' : ' At this distance the colored beams still overlap, so the middle stays white and only the edges are colored, red on one side and blue on the other.';
    }
    $('prismRead').textContent = txt;
    $('turnOut').textContent = `${deg > 0 ? '+' : ''}${deg}°`;
    $('cardOut').textContent = fmtMm(D);
  }
  const fmtMm = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} m` : `${Math.round(d)} mm`);
  let lastStrip = null;
  function fitStrip(c) {
    lastStrip = c;
    const [ctx, w, h] = fit($('cardStrip'));
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    if (!c) { $('cardKeyL').textContent = ''; $('cardKeyR').textContent = ''; return; }
    c.cols.forEach((col, j) => { ctx.fillStyle = col; ctx.fillRect(Math.floor((j / c.cols.length) * w), 0, Math.ceil(w / c.cols.length) + 1, h); });
    $('cardKeyL').textContent = `${(c.s1 - c.s0).toFixed(c.s1 - c.s0 < 20 ? 1 : 0)} mm across`;
    $('cardKeyR').textContent = `beam ${2 * HALF} mm`;
  }

  // turning the prism: drag around its center, or the arrow keys, or the slider
  let grab = null;
  const angleAt = (e) => {
    const m = scene.getScreenCTM().inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return (Math.atan2(p.y - CY * K, p.x - CX * K) * 180) / Math.PI;
  };
  const setTurn = (v) => { turn.value = String(Math.max(-25, Math.min(26, Math.round(v * 2) / 2))); renderPrism(); };
  gPrism.addEventListener('pointerdown', (e) => { grab = { a: angleAt(e), v: turn.valueAsNumber }; gPrism.setPointerCapture(e.pointerId); e.preventDefault(); });
  gPrism.addEventListener('pointermove', (e) => { if (grab) { let d = angleAt(e) - grab.a; d = ((d + 540) % 360) - 180; setTurn(grab.v + d); } });
  const drop = () => { grab = null; };
  gPrism.addEventListener('pointerup', drop); gPrism.addEventListener('pointercancel', drop);
  gPrism.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (step) { setTurn(turn.valueAsNumber + step); e.preventDefault(); }
  });
  turn.addEventListener('input', renderPrism); card.addEventListener('input', renderPrism);

  /* ---------- the glass picker and the index chart ---------- */
  const pick = $('glassPick'), buttons = GLASSES.map((g) => {
    const b = document.createElement('button');
    b.className = 'chip chip-plain'; b.textContent = g.label; b.dataset.id = g.id;
    b.addEventListener('click', () => { glass = g; renderAll(); });
    pick.appendChild(b); return b;
  });
  const chart = $('nChart'), X0 = 56, X1 = 560, Y0 = 300, Y1 = 24, N0 = 1.44, N1 = 1.87;
  const xOf = (nm) => X0 + ((nm - 380) / 400) * (X1 - X0), yOf = (n) => Y0 - ((n - N0) / (N1 - N0)) * (Y0 - Y1);
  // axes and the three lines, drawn once
  for (let n = 1.45; n <= 1.851; n += 0.05) {
    svg('line', { x1: X0, x2: X1, y1: yOf(n), y2: yOf(n), class: 'grid' }, chart);
    svg('text', { x: X0 - 8, y: yOf(n) + 4, 'text-anchor': 'end', class: 'tick' }, chart).textContent = n.toFixed(2);
  }
  for (let nm = 400; nm <= 780; nm += 100) svg('text', { x: xOf(nm), y: Y0 + 34, 'text-anchor': 'middle', class: 'tick' }, chart).textContent = `${nm} nm`;
  GRID.forEach((w, i) => { if (i < GRID.length - 1) svg('rect', { x: xOf(w), y: Y0 + 6, width: xOf(w + 5) - xOf(w) + 0.5, height: 10, fill: HUE[i] }, chart); });
  for (const [k, nm] of Object.entries(LINES)) {
    svg('line', { x1: xOf(nm), x2: xOf(nm), y1: Y1, y2: Y0, class: 'fline' }, chart);
    svg('text', { x: xOf(nm), y: Y1 - 8, 'text-anchor': 'middle', class: 'tick' }, chart).textContent = k;
  }
  const curves = GLASSES.map((g) => {
    const d = Array.from({ length: 81 }, (_, i) => 380 + 5 * i).map((nm, i) => `${i ? 'L' : 'M'}${xOf(nm).toFixed(1)},${yOf(index(g, nm)).toFixed(1)}`).join('');
    const path = svg('path', { d, class: 'ncurve' }, chart);
    const lab = svg('text', { x: X1 + 6, y: yOf(index(g, 780)) + 4, class: 'clab' }, chart);
    lab.textContent = g.label.replace(/,.*$/, '');
    return { g, path, lab };
  });
  // the two SF11s end at the same place: lift one label clear of the other
  const nsf = curves.find((c) => c.g.id === 'nsf11'); nsf.lab.setAttribute('y', +nsf.lab.getAttribute('y') - 13);
  nsf.lab.textContent = 'N-SF11';
  // LLF1, window glass and N-BK7 end close together: part their labels
  for (const [id, dy] of [['llf1', -6], ['sodalime', -4], ['bk7', 8]]) { const c = curves.find((k) => k.g.id === id); c.lab.setAttribute('y', +c.lab.getAttribute('y') + dy); }

  function renderGlass() {
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.id === glass.id));
    for (const c of curves) { c.path.classList.toggle('on', c.g === glass); c.lab.classList.toggle('on', c.g === glass); }
    const nd = index(glass, LINES.d), V = abbe(glass), dn = spread(glass), uv = uvResonance(glass);
    const meter = (label, value, frac) => `<div><dt>${label}</dt><dd>${value}</dd><i style="--v:${(100 * Math.max(0, Math.min(1, frac))).toFixed(0)}%"></i></div>`;
    $('glassMeters').innerHTML = meter('index, n<sub>d</sub>', nd.toFixed(4), (nd - 1.4) / 0.5)
      + meter('Abbe number, V<sub>d</sub>', V.toFixed(1), V / 80)
      + meter('spread, n<sub>F</sub> − n<sub>C</sub>', dn.toFixed(4), dn / 0.035)
      + (uv ? meter('nearest ultraviolet term', `${Math.round(uv)} nm`, uv / 300) : '');
    const sheet = glass.nd ? ` Schott's datasheet gives n<sub>d</sub> ${glass.nd} and V<sub>d</sub> ${glass.vd}.`
      : glass.formula === 'cauchy' ? ' Rubin gives a Cauchy fit with no resonances, so it has no ultraviolet term to show.'
        : ' Malitson fitted his own prism measurements, so there is no datasheet to compare.';
    $('glassRead').innerHTML = `${glass.about}${glass.lead ? ' Contains lead.' : ''}${sheet}`;
  }

  /* ---------- crown against crown + flint ---------- */
  const lensSvg = $('lensScene'), focusS = $('focus');
  const F = 100, A = 12.5; // mm: a 100 mm lens at f/4
  const LX = 120, FX = 610, KZ = 120, AX = [72, 196], H = 50; // drawing: lens x, focus x, units per mm along the axis
  const WAVES = Array.from({ length: 14 }, (_, i) => 420 + 20 * i);
  const fl = { singlet: focal(F, GLASS.bk7) };
  const flintFor = () => (abbe(glass) < 50 ? glass : GLASS.f2);
  const dz = () => (focusS.valueAsNumber / 100) * 1.6;

  function lineCanvas(canvas, f) {
    const [ctx, w, h] = fit(canvas), cols = Math.min(220, Math.max(60, Math.round(w / 3))), z = F + dz(), lamp = getLamp();
    for (let j = 0; j < cols; j++) {
      const x = -0.3 + ((j + 0.5) / cols) * 0.6;
      ctx.fillStyle = underLamp(lineImage(f, GRID, A, z, 0.06, x), lamp).css;
      ctx.fillRect(Math.floor((j / cols) * w), 0, Math.ceil(w / cols) + 1, h);
    }
  }
  function renderLens() {
    const flint = flintFor(); fl.achro = focal(F, GLASS.bk7, flint);
    $('achroTitle').textContent = `crown + ${flint.label}`;
    lensSvg.replaceChildren();
    const light = lampNorm();
    [['singlet', 'CROWN ALONE'], ['achro', 'CROWN + FLINT']].forEach(([k, label], row) => {
      const y = AX[row], f = fl[k];
      svg('line', { x1: 20, x2: 880, y1: y, y2: y, class: 'axis' }, lensSvg);
      svg('text', { x: 20, y: y - H - 8, class: 'scene-lab' }, lensSvg).textContent = label;
      for (const nm of WAVES) {
        const i = (nm - 380) / 5, fx = FX + KZ * (f(nm) - F);
        if (light[i] < 0.004) continue;
        for (const s of [-1, 1]) {
          const x2 = 880, y2 = y + s * H * (1 - (x2 - LX) / (fx - LX));
          svg('line', { x1: LX, y1: y + s * H, x2, y2, stroke: HUE[i], 'stroke-opacity': (0.3 + 0.7 * light[i]).toFixed(2), class: 'lray' }, lensSvg);
        }
      }
      // the lens: a biconvex crown, and for the achromat a diverging flint cemented behind it
      svg('path', { d: `M${LX},${y - H - 4} Q${LX - 22},${y} ${LX},${y + H + 4} Q${LX + 22},${y} ${LX},${y - H - 4}Z`, class: 'lens' }, lensSvg);
      if (k === 'achro') svg('path', { d: `M${LX + 8},${y - H - 4} Q${LX + 24},${y} ${LX + 8},${y + H + 4} L${LX + 22},${y + H + 4} L${LX + 22},${y - H - 4}Z`, class: 'lens flint' }, lensSvg);
    });
    const cx = FX + KZ * dz();
    svg('line', { x1: cx, x2: cx, y1: 24, y2: 250, class: 'card-line' }, lensSvg);
    svg('text', { x: Math.min(cx + 6, 820), y: 18, class: 'scene-lab' }, lensSvg).textContent = 'CARD';
    svg('text', { x: 880, y: 250, 'text-anchor': 'end', class: 'scene-lab faint' }, lensSvg).textContent = `AXIS NEAR FOCUS STRETCHED ×${Math.round(KZ / ((FX - LX) / F))}`;

    lineCanvas($('imgSinglet'), fl.singlet); lineCanvas($('imgAchro'), fl.achro);
    const s = fl.singlet, a = fl.achro, mm = (v) => `${Math.abs(v).toFixed(2)} mm`;
    let best = 480; for (let nm = 480; nm <= 660; nm += 2) if (a(nm) < a(best)) best = nm;
    $('readSinglet').textContent = `Blue (F, 486 nm) focuses ${mm(s(LINES.C) - s(LINES.F))} nearer than red (C, 656 nm), so the line is fringed with color at every card position.`;
    $('readAchro').textContent = `F and C now focus together. Green near ${best} nm still comes to focus ${mm(a(LINES.C) - a(best))} nearer: the secondary spectrum, about ${Math.round((s(LINES.C) - s(LINES.F)) / (a(LINES.C) - a(best)))} times smaller, which leaves an achromat's faint purple and green fringes.`;
    $('focusOut').textContent = `${dz() >= 0 ? '+' : '−'}${Math.abs(dz()).toFixed(2)} mm from the d focus`;
  }
  focusS.addEventListener('input', renderLens);

  function renderAll() { renderPrism(); renderGlass(); renderLens(); }
  renderAll();
  initFire({ getLamp, onLamp });
  addEventListener('resize', () => { fitStrip(lastStrip); renderLens(); });
  onLamp(renderAll);
}
