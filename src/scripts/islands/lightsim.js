// LightSim: a slit beam raking across a darkened light table, through pieces of glass you can drag.
// Each frame traces a few thousand single-wavelength rays (raytrace.js) and adds the light each
// run leaves on the paper, as CIE XYZ per pixel; the image is that sum, adapted to the lamp.
import optics from '../../data/optics.json';
import { GRID, CMF_GRID, colorantDensity, displayMatrix, encode } from '../spectra.js';
import { LAMP } from '../lamps.js';
import { GLASSES, traceRay, slitRay, prism, slab, lens } from '../raytrace.js';

const SCENE = [0, 0, 180, 110]; // mm
const SHAPES = {
  prism: (p) => prism(p.x, p.y, 46, p.rot),
  slab: (p) => slab(p.x, p.y, 16, 60, p.rot),
  lens: (p) => lens(p.x, p.y, 56, 60, p.rot),
};
// The prism beam comes down steeply so the fan it makes runs across the table.
const PRESETS = {
  prism: () => ({ beam: { x: 22, y: 1, angle: 1.31, width: 3 }, pieces: [{ shape: 'prism', x: 40, y: 56, rot: 1.81 }] }),
  lens: () => ({ beam: { x: 2, y: 55, angle: 0, width: 44 }, pieces: [{ shape: 'lens', x: 50, y: 55, rot: 0 }] }),
  slab: () => ({ beam: { x: 2, y: 40, angle: 0, width: 3 }, pieces: [{ shape: 'slab', x: 70, y: 55, rot: 0.5 }] }),
};
// Display value for linear light v: a soft shoulder where light focuses, then sRGB encoding.
// Tabulated, since it runs for every channel of every pixel each frame.
const TONE_STEPS = 1024, TONE = Uint8ClampedArray.from({ length: 8 * TONE_STEPS }, (_, k) => 255 * encode(1 - Math.exp((-1.6 * (k + 0.5)) / TONE_STEPS)));
const RAY_BUDGET = 3e6, BEAM_LEVEL = 0.55, AMBIENT = 0.03;

export function initLightSim(root) {
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const $ = (name) => root.querySelector(`[name=${name}]`);
  const colorants = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
  let W, H, scale, X, Y, Z, img, rays = 0, frame = 0, drag = null, perFrame = 2000;
  let { beam, pieces } = PRESETS.prism();

  const state = () => ({ glass: $('glass').value, colorant: $('colorant').value, conc: +$('conc').value / 100, lamp: LAMP[$('lamp').value] });
  // Density per mm: optics.json densities are per reference thickness, taken here as 10 mm.
  function built() {
    const s = state(), d = s.colorant === 'clear' ? GRID.map(() => 0) : colorants[s.colorant].map((v) => (v * s.conc) / 10);
    return pieces.map((p) => ({ ...p, poly: SHAPES[p.shape](p), glass: s.glass, density: d }));
  }

  function resize() {
    const cssW = canvas.clientWidth || 640;
    W = Math.min(900, Math.round(cssW * Math.min(2, devicePixelRatio || 1)));
    H = Math.round((W * SCENE[3]) / SCENE[2]); scale = W / SCENE[2];
    canvas.width = W; canvas.height = H;
    img = ctx.createImageData(W, H); reset();
  }
  function reset() { X = new Float32Array(W * H); Y = new Float32Array(W * H); Z = new Float32Array(W * H); rays = 0; }

  // Add the light of one straight run, decaying geometrically from w0 to w1 (Beer–Lambert).
  // Antialiased (Wu): step one pixel along the run's major axis and split each step between the two
  // pixels straddling it on the minor axis, so thin bundles of rays don't alias into stripes.
  function deposit(x0, y0, x1, y1, i, w0, w1) {
    let ax = x0 * scale - 0.5, ay = y0 * scale - 0.5, bx = x1 * scale - 0.5, by = y1 * scale - 0.5;
    const steep = Math.abs(by - ay) > Math.abs(bx - ax);
    if (steep) [ax, ay, bx, by] = [ay, ax, by, bx];
    const n = Math.max(1, Math.ceil(Math.abs(bx - ax))), [cx, cy, cz] = CMF_GRID[i];
    const len = Math.hypot(bx - ax, by - ay), per = len / n; // light laid per step, in pixel lengths
    const r = w0 > 0 ? w1 / w0 : 0;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n, u = ax + (bx - ax) * f, v = ay + (by - ay) * f;
      const pu = Math.round(u), pv = Math.floor(v), fv = v - pv, w = w0 * r ** f * per;
      add(steep ? pv : pu, steep ? pu : pv, w * (1 - fv), cx, cy, cz);
      add(steep ? pv + 1 : pu, steep ? pu : pv + 1, w * fv, cx, cy, cz);
    }
  }
  function add(px, py, w, cx, cy, cz) {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const j = py * W + px;
    X[j] += w * cx; Y[j] += w * cy; Z[j] += w * cz;
  }

  function render(lamp, scene) {
    // Normalize so the open beam has Y = BEAM_LEVEL: each ray lays about one unit per pixel it
    // crosses, rays spread across the beam's width, and a ray's expected XYZ is the lamp's white / N.
    const white = lamp.spd.reduce((s, v, i) => s + v * CMF_GRID[i][1], 0) / GRID.length;
    const k = (BEAM_LEVEL * beam.width * scale) / (Math.max(1, rays) * white);
    const M = displayMatrix(lamp.spd, lamp.adapt), d = img.data;
    for (let j = 0; j < W * H; j++) {
      const x = X[j] * k, y = Y[j] * k, z = Z[j] * k;
      for (let c = 0; c < 3; c++) {
        const v = AMBIENT + Math.max(0, M[c][0] * x + M[c][1] * y + M[c][2] * z);
        d[4 * j + c] = TONE[Math.min(TONE.length - 1, (v * TONE_STEPS) | 0)];
      }
      d[4 * j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(243,244,241,0.45)'; ctx.lineWidth = Math.max(1, scale * 0.25);
    for (const p of scene) {
      ctx.beginPath(); p.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale)));
      ctx.closePath(); ctx.stroke();
    }
    root.querySelector('.ls-count').textContent = `${(rays / 1000).toFixed(0)}k rays`;
  }

  function tick() {
    const s = state(), scene = built();
    if (rays < RAY_BUDGET) {
      // Trace as many rays as fit in about 20 ms, so slow phones stay responsive and fast ones converge.
      const t0 = performance.now();
      for (let n = 0; n < perFrame; n++) traceRay(scene, slitRay(beam, s.lamp.spd, Math.random), Math.random, deposit, SCENE);
      rays += perFrame;
      const dt = performance.now() - t0;
      perFrame = Math.round(Math.min(40000, Math.max(1000, (perFrame * 20) / Math.max(1, dt))));
      render(s.lamp, scene);
    }
    frame = requestAnimationFrame(tick);
  }

  const toScene = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * SCENE[2], ((e.clientY - r.top) / r.height) * SCENE[3]]; };
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toScene(e), k = built().findIndex((p) => inside(p.poly, x, y));
    if (k < 0) return;
    drag = { k, dx: pieces[k].x - x, dy: pieces[k].y - y }; canvas.setPointerCapture(e.pointerId);
    $('rot').value = Math.round((pieces[k].rot * 180) / Math.PI);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = toScene(e); pieces[drag.k].x = x + drag.dx; pieces[drag.k].y = y + drag.dy; reset();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  $('rot').addEventListener('input', () => { pieces[drag ? drag.k : 0].rot = (+$('rot').value * Math.PI) / 180; reset(); });
  $('preset').addEventListener('change', () => { ({ beam, pieces } = PRESETS[$('preset').value]()); $('rot').value = Math.round((pieces[0].rot * 180) / Math.PI); reset(); });
  for (const n of ['glass', 'colorant', 'conc', 'lamp']) $(n).addEventListener('input', reset);
  for (const [id, g] of Object.entries(GLASSES)) $('glass').add(new Option(g.label, id));
  $('glass').value = 'nsf11';
  $('rot').value = Math.round((pieces[0].rot * 180) / Math.PI);
  addEventListener('resize', resize);
  resize();
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
