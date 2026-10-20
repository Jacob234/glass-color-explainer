// network3d.js — the Network lab island: a precomputed silicate glass (src/data/glass3d/) drawn in
// ink as a block you can turn and slice. Silicon is inked by Qⁿ, the number of its four oxygens it
// shares with another tetrahedron; oxygens that hang off one silicon are drawn open; sodium is a
// large open ring. Rings of tetrahedra of a chosen size are laid in as panes of colored glass,
// their colors computed from spectra like every other on the site. Analysis in ../network.js.
import * as net from '../network.js';

const files = import.meta.glob('../../data/glass3d/*.json');
const load = (id) => files[`../../data/glass3d/${id}.json`]().then((m) => m.default);

const PAPER = '#fafaf8', INK = '#141414';
const Q_FILL = ['#fafaf8', '#fafaf8', '#c9c9c6', '#6e6e6b', '#141414']; // Q⁰ … Q⁴
const SLABS = { thin: 6, thick: 12, whole: Infinity }; // Å

export function initNetworkViewer(root, tints) {
  const $ = (s) => root.querySelector(s);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const meters = $('.nv-meters'), read = $('.nv-read'), ringBox = $('.nv-rings');
  const depth = $('[name=depth]');
  const state = { glass: 'silica', rate: 'fast', slab: 'thin', ring: 0, yaw: 0.55, pitch: -0.35, zoom: 1 };
  const cache = new Map();
  let model = null, token = 0;

  // Everything the drawing needs, worked out once per glass: positions centered on the box,
  // each bond as a vector from its silicon, rings as closed paths unwrapped around the box.
  function prepare(d) {
    const s = net.decode(d), netw = net.network(s), rs = net.rings(netw);
    const c = s.L.map((L) => L / 2), p = new Float64Array(3 * s.n);
    for (let i = 0; i < s.n; i++) for (let a = 0; a < 3; a++) p[3 * i + a] = s.x[3 * i + a] - c[a];
    const bonds = [], v = [0, 0, 0];
    for (const [si, os] of netw.siO) for (const o of os) {
      net.delta(s, si, o, v);
      bonds.push({ si, o, d: [...v], nbo: netw.role[o] === 1 });
    }
    const rings = rs.map((ring) => {
      const pts = [[p[3 * ring[0]], p[3 * ring[0] + 1], p[3 * ring[0] + 2]]];
      for (let k = 1; k < ring.length; k++) {
        net.delta(s, ring[k - 1], ring[k], v);
        const q = pts[k - 1];
        pts.push([q[0] + v[0], q[1] + v[1], q[2] + v[2]]);
      }
      // bring the ring's middle back inside the box
      const m = [0, 1, 2].map((a) => pts.reduce((t, q) => t + q[a], 0) / pts.length);
      const shift = m.map((x, a) => -s.L[a] * Math.round(x / s.L[a]));
      return pts.map((q) => q.map((x, a) => x + shift[a]));
    });
    return { s, p, net: netw, bonds, rings, sum: net.summarize(s) };
  }

  async function select() {
    const id = `${state.glass}-${state.rate}`, mine = ++token;
    if (!cache.has(id)) cache.set(id, load(id).then(prepare));
    root.classList.add('loading');
    const m = await cache.get(id);
    if (mine !== token) return;
    model = m;
    root.classList.remove('loading');
    renderRings(); renderMeters(); draw();
  }

  /* ---------- the drawing ---------- */
  function rotation() {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    // yaw about the vertical, then pitch about the horizontal
    return [[cy, 0, sy], [sy * sp, cp, -cy * sp], [-sy * cp, sp, cy * cp]];
  }

  function draw() {
    if (!model) return;
    const w = canvas.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr); }
    const W = canvas.width, { s, p } = model, L = Math.max(...s.L);
    const R = rotation(), D = 3 * L, k = (W / (L * 1.85)) * state.zoom;
    const half = SLABS[state.slab] / 2, center = depth.valueAsNumber * L * 0.75;
    const proj = (x, y, z) => {
      const X = R[0][0] * x + R[0][1] * y + R[0][2] * z, Y = R[1][0] * x + R[1][1] * y + R[1][2] * z, Z = R[2][0] * x + R[2][1] * y + R[2][2] * z;
      const f = D / (D - Z);
      return [W / 2 + X * f * k, W / 2 - Y * f * k, Z, f];
    };
    const inSlab = (z) => Math.abs(z - center) <= half;
    const fade = (z) => (half === Infinity ? 0.35 + 0.65 * (z / L + 0.5) : 0.45 + 0.55 * ((z - center) / (2 * half) + 0.5));
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, W);

    // the box, as a faint wire cube
    ctx.strokeStyle = 'rgba(20,20,20,0.18)'; ctx.lineWidth = dpr;
    const corners = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(proj((x * s.L[0]) / 2, (y * s.L[1]) / 2, (z * s.L[2]) / 2));
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if ([1, 2, 4].includes(a ^ b)) {
      ctx.beginPath(); ctx.moveTo(corners[a][0], corners[a][1]); ctx.lineTo(corners[b][0], corners[b][1]); ctx.stroke();
    }

    const prims = [];
    // rings of the chosen size, as panes of glass
    if (state.ring) for (const ring of model.rings) {
      if (state.ring === 9 ? ring.length < 9 : ring.length !== state.ring) continue;
      const q = ring.map(([x, y, z]) => proj(x, y, z));
      const z = q.reduce((t, a) => t + a[2], 0) / q.length;
      if (inSlab(z)) prims.push({ z: z - 2, kind: 'ring', q });
    }
    for (const b of model.bonds) {
      const i = b.si;
      const a = proj(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      const o = proj(p[3 * i] + b.d[0], p[3 * i + 1] + b.d[1], p[3 * i + 2] + b.d[2]);
      if (!inSlab(a[2])) continue;
      prims.push({ z: (a[2] + o[2]) / 2 - 0.01, kind: 'bond', a, o });
      prims.push({ z: o[2], kind: b.nbo ? 'nbo' : 'bo', a: o });
    }
    for (let i = 0; i < s.n; i++) {
      const t = s.type[i];
      if (t === net.O) continue;
      const a = proj(p[3 * i], p[3 * i + 1], p[3 * i + 2]);
      if (!inSlab(a[2])) continue;
      prims.push({ z: a[2], kind: t === net.SI ? 'si' : 'na', a, q: model.net.q[i] });
    }
    prims.sort((u, v) => u.z - v.z);

    const tint = tints[Math.min(state.ring, 9)] ?? '#999';
    for (const pr of prims) {
      ctx.globalAlpha = fade(pr.z);
      if (pr.kind === 'ring') {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.5 + 0.35 * fade(pr.z);
        ctx.fillStyle = tint; ctx.strokeStyle = 'rgba(20,20,20,0.5)'; ctx.lineWidth = dpr;
        ctx.beginPath(); pr.q.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (pr.kind === 'bond') {
        // a paper-colored casing behind each bond keeps near bonds legible over far ones
        ctx.lineCap = 'round';
        ctx.strokeStyle = PAPER; ctx.lineWidth = 3.2 * dpr * pr.a[3];
        ctx.beginPath(); ctx.moveTo(pr.a[0], pr.a[1]); ctx.lineTo(pr.o[0], pr.o[1]); ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.3 * dpr * pr.a[3];
        ctx.stroke();
      } else if (pr.kind === 'bo') {
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(pr.a[0], pr.a[1], 1.5 * dpr * pr.a[3], 0, 2 * Math.PI); ctx.fill();
      } else if (pr.kind === 'nbo') {
        ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 1.3 * dpr;
        ctx.beginPath(); ctx.arc(pr.a[0], pr.a[1], 0.3 * k * pr.a[3], 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      } else if (pr.kind === 'si') {
        ctx.fillStyle = Q_FILL[Math.max(0, pr.q)]; ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.arc(pr.a[0], pr.a[1], 0.42 * k * pr.a[3], 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      } else {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.1 * dpr; ctx.setLineDash([2 * dpr, 2 * dpr]);
        ctx.beginPath(); ctx.arc(pr.a[0], pr.a[1], 0.62 * k * pr.a[3], 0, 2 * Math.PI); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the readouts ---------- */
  const pct = (v) => `${Math.round(v * 100)}%`;
  function renderMeters() {
    const { sum } = model;
    const rows = [
      ['density', `${sum.density.toFixed(2)} g/cm³`],
      ['Q⁴ · Q³ · Q²', `${pct(sum.qn[4])} · ${pct(sum.qn[3])} · ${pct(sum.qn[2])}`],
      ['oxygens bridging', pct(sum.bo)],
      ['Si–O–Si angle, commonest · mean', `${Math.round(sum.angle.peak)}° · ${Math.round(sum.angle.mean)}°`],
    ];
    if (sum.atoms.Na) rows.push(['oxygens around each Na', sum.naO.toFixed(1)]);
    meters.replaceChildren(...rows.map(([dt, dd]) => {
      const div = document.createElement('div');
      div.innerHTML = `<dt>${dt}</dt><dd>${dd}</dd>`;
      return div;
    }));
    const rate = state.rate === 'fast' ? '10¹⁴' : '10¹³';
    read.textContent = state.glass === 'silica'
      ? `Pure silica cooled at ${rate} K/s. Every silicon shares all four corners: the network is unbroken, and every oxygen is a bridge.`
      : `Na₂O·3SiO₂ cooled at ${rate} K/s. Each Na₂O brought an oxygen the network had no bridge for, so ${pct(sum.nbo)} of the oxygens now hang off a single silicon, drawn open, with the sodium beside them.`;
  }

  function renderRings() {
    const counts = {};
    for (const r of model.rings) { const n = Math.min(9, r.length); counts[n] = (counts[n] ?? 0) + 1; }
    for (const b of ringBox.querySelectorAll('button')) {
      const n = +b.dataset.n;
      b.setAttribute('aria-pressed', String(n === state.ring));
      const c = b.querySelector('small');
      if (c) c.textContent = n ? String(counts[n] ?? 0) : '';
    }
  }

  /* ---------- controls ---------- */
  for (const g of root.querySelectorAll('[data-key]')) {
    g.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = g.dataset.key, val = key === 'ring' ? +b.dataset.n : b.dataset.v;
      state[key] = val;
      for (const o of g.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
      if (key === 'glass' || key === 'rate') select(); else { renderRings(); draw(); }
    });
  }
  depth.addEventListener('input', draw);
  $('[name=reset]').addEventListener('click', () => { Object.assign(state, { yaw: 0.55, pitch: -0.35, zoom: 1 }); draw(); });

  // drag to turn; on touch screens a vertical drag scrolls the page (touch-action: pan-y), so touch turns about the vertical only
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.yaw += ((e.clientX - drag.x) / canvas.clientWidth) * Math.PI;
    state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch + ((e.clientY - drag.y) / canvas.clientWidth) * Math.PI));
    drag = { x: e.clientX, y: e.clientY };
    requestAnimationFrame(draw);
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.zoom = Math.max(0.6, Math.min(3, state.zoom * Math.exp(-e.deltaY * 0.001)));
    draw();
  }, { passive: false });
  new ResizeObserver(() => draw()).observe(canvas);
  select();
}
