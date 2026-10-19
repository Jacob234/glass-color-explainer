// FormingSim: a gather on a blowpipe, in the dark of the shop. The physics is forming.js; this file
// draws it. The glass is drawn as a section, shell by shell, each shell glowing at its own
// temperature through the gather's own emissivity (Kirchhoff, as at the glory hole), so a chilled
// skin shows as a dimmer rim around a hotter core.
import optics from '../../data/optics.json';
import vis from '../../data/viscosity.json';
import F from '../../data/forming.json';
import { colorantDensity, transmission, glow, glowStrength, emissivity, luminousEmissivity, spectrumColor } from '../spectra.js';
import { LAMP } from '../lamps.js';
import * as f from '../forming.js';

const DENS = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
const IRON = [['iron-ferrous', 0.03], ['iron-ferric', 0.03]]; // the glory hole's clear gather (Kirchhoff stage)
export const BATCHES = { // cobalt first, as at the glory hole
  cobalt: { label: 'cobalt', parts: [...IRON, ['cobalt', 1]], kappa1: F.absorption.band1.clear },
  clear: { label: 'clear (trace iron)', parts: IRON, kappa1: F.absorption.band1.clear },
  green: { label: 'green bottle (0.5% iron)', parts: IRON.map(([id, c]) => [id, c * 6]), kappa1: F.absorption.band1.green },
  copper: { label: 'copper', parts: [...IRON, ['copper', 1]], kappa1: F.absorption.band1.clear },
  chromium: { label: 'chromium', parts: [...IRON, ['chromium', 1]], kappa1: F.absorption.band1.clear },
};
const GLORY = vis.studio.find((s) => s.id === 'glory').T, FURNACE = vis.studio.find((s) => s.id === 'furnace').T;
const HOT = [1, 0.82, 0.45], SOOT = [0.047, 0.035, 0.027];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, Math.max(0, v * k)))).join(',')})`;

export function initFormingSim(root) {
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const $ = (n) => root.querySelector(`[name=${n}]`), out = (n) => root.querySelector(`[data-out=${n}]`);
  let W, H, dpr, scale = 0, g, batch, trail = [], blowing = false, last = 0, raf = 0, visible = true;

  const opts = () => ({
    where: root.querySelector('[name=where]:checked').value,
    omega: 2 * Math.PI * +$('turn').value, tilt: (+$('tilt').value * Math.PI) / 180,
    dp: blowing ? 1000 * +$('breath').value : 0, Tglory: GLORY,
  });
  function fresh() {
    batch = BATCHES[$('batch').value];
    g = f.newGather({ T: FURNACE, kappa1: batch.kappa1 });
    trail = []; show();
  }

  // ---- colour ----
  // The gather's visible emissivity for the path a sight line takes through it (both walls at the
  // middle), in optics.json's reference thickness (10 mm), and its cold colour under daylight.
  function looks() {
    const path = Math.max(0.05, (2 * f.wall(g) * 1000) / 10), T = transmission(batch.parts.map(([id, c]) => [DENS[id], c]), path);
    return { eps: emissivity(T), cold: spectrumColor(T, LAMP.daylight.spd).rgb };
  }
  // A shell's colour at t °C: its glow (strength on the page's log scale times the cube root of its
  // luminous emissivity, as at the glory hole) over the faint cold colour the shop lamps show.
  function shade(t, { eps, cold }, bg = null) {
    const tK = t + 273.15, gl = glow(tK, 1423, eps), epsY = luminousEmissivity(eps, tK);
    const a = glowStrength(gl.luminance) * epsY ** (1 / 3);
    const hot = lerp(gl.rgb, HOT, a ** 3 * 0.45).map((v) => v * a);
    const base = bg ? bg.map((v) => v * (1 - epsY)) : cold.map((v) => v * 0.22 * (1 - a));
    return base.map((v, i) => v + hot[i]);
  }

  // ---- layout ----
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.round(canvas.clientWidth * dpr); H = Math.round(canvas.clientHeight * dpr);
    canvas.width = W; canvas.height = H; draw();
  }
  const side = () => { const col = Math.max(128 * dpr, W * 0.2); return { w: W - col, col }; };

  // Outline of a spheroid of volume-radius r around the gather's centre, in the pipe's frame
  // (x along the pipe, away from the blower), bent down by the sag toward the far end.
  function outline(r, droop, cOuter) {
    const c = f.along(g, r) * scale, e = f.across(g, r) * scale, pts = [];
    for (let k = 0; k <= 64; k++) {
      const t = (k / 64) * 2 * Math.PI, x = c * Math.cos(t), y = e * Math.sin(t);
      pts.push([x, y + droop * Math.max(0, x / cOuter) ** 2]);
    }
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  }

  function draw() {
    if (!g || !W) return;
    const o = opts(), { w } = side(), r = f.edges(g), look = looks();
    // zoom: a first gather fills about a quarter of the height; zoom out as it grows
    const fit = Math.min((0.3 * H) / f.across(g, g.b), (0.32 * w) / f.along(g, g.b), (0.24 * H) / F.gather.radius);
    scale = scale ? scale + (fit - scale) * 0.15 : fit;
    ctx.fillStyle = rgb(SOOT); ctx.fillRect(0, 0, W, H);
    const cx = w * 0.6, cy = H * 0.5;
    // the glory hole: a chamber glowing like a black body at its own temperature
    let bg = null;
    if (o.where === 'glory') {
      const bb = glow(GLORY + 273.15), k = glowStrength(bb.luminance);
      bg = lerp(bb.rgb, HOT, k ** 3 * 0.45).map((v) => v * k);
      const R = Math.min(H * 0.46, w * 0.42);
      ctx.fillStyle = '#1a100b'; ctx.beginPath(); ctx.arc(cx, cy, R + 10 * dpr, 0, 7); ctx.fill();
      ctx.fillStyle = rgb(bg); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.tilt);
    // the pipe, from off the left edge to the bubble
    ctx.fillStyle = '#6d6862'; ctx.fillRect(-W, -8 * dpr, W - g.a * scale * 0.6, 16 * dpr);
    ctx.fillStyle = '#9b958d'; ctx.fillRect(-W, -8 * dpr, W - g.a * scale * 0.6, 4 * dpr);
    const droop = g.drop[1] * scale, cOuter = f.along(g, g.b) * scale;
    // shells, outermost first, every other one
    for (let j = f.N; j >= 2; j -= 2) {
      ctx.fillStyle = rgb(shade(g.T[j - 1], look, bg));
      outline(r[j], droop, cOuter); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,240,220,0.18)'; ctx.lineWidth = dpr; outline(g.b, droop, cOuter); ctx.stroke();
    // the bubble
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; outline(g.a, droop, cOuter); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,220,0.22)'; ctx.stroke();
    // three stripes on the glass, to show it turning: a stripe at angle ψ round the pipe sits at
    // e·cos ψ and faces you while sin ψ > 0
    const c = cOuter, e = f.across(g, g.b) * scale;
    for (let k = 0; k < 3; k++) {
      const psi = g.spin + (k * 2 * Math.PI) / 3, face = Math.sin(psi);
      if (face <= 0) continue;
      ctx.strokeStyle = `rgba(20,10,5,${0.35 * face})`; ctx.lineWidth = 2 * dpr; ctx.beginPath();
      for (let q = 0; q <= 40; q++) {
        const x = -c + (2 * c * q) / 40, half = e * Math.sqrt(Math.max(0, 1 - (x / c) ** 2));
        const y = half * Math.cos(psi) + droop * Math.max(0, x / c) ** 2;
        q ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    drawInset(o); drawScale(); drawRuler(w);
    if (g.status) drawStatus(w);
  }

  // End on, looking down the pipe: the far end's offset from the pipe's axis, magnified.
  function drawInset(o) {
    const R = 34 * dpr, x0 = 14 * dpr + R, y0 = 14 * dpr + R, mag = 5, e = f.across(g, g.b);
    const k = R / (e * 1.25);
    ctx.save(); ctx.beginPath(); ctx.arc(x0, y0, R, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill();
    ctx.strokeStyle = 'rgba(185,171,156,0.35)'; ctx.lineWidth = dpr; ctx.stroke(); ctx.clip();
    ctx.strokeStyle = 'rgba(185,171,156,0.5)';
    if (trail.length > 1) { ctx.beginPath(); trail.forEach(([x, y], i) => { const px = x0 + x * mag * k, py = y0 + y * mag * k; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
    const [dx, dy] = g.drop;
    ctx.strokeStyle = 'rgba(255,200,140,0.8)'; ctx.beginPath(); ctx.arc(x0 + dx * mag * k, y0 + dy * mag * k, e * k, 0, 7); ctx.stroke();
    ctx.fillStyle = '#9b958d'; ctx.beginPath(); ctx.arc(x0, y0, 3 * dpr, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(185,171,156,0.8)'; ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText('end on, sag ×5', x0, y0 + R + 13 * dpr);
  }

  // The viscosity of every shell on the NBS 710 scale, against the glass's fixed points.
  function drawScale() {
    const { w, col } = side(), x = w + Math.max(42 * dpr, col * 0.3), top = 26 * dpr, bot = H - 22 * dpr;
    const y = (L) => top + ((Math.min(15, L) - 1) / 14) * (bot - top);
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(w, 0, col, H);
    ctx.font = `${(W / dpr < 520 ? 9 : 10) * dpr}px "IBM Plex Mono", monospace`; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(185,171,156,0.12)'; ctx.fillRect(x - 5 * dpr, y(3), 10 * dpr, y(6.6) - y(3));
    ctx.strokeStyle = 'rgba(185,171,156,0.5)'; ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    ctx.fillStyle = 'rgba(185,171,156,0.85)';
    ctx.fillText('log η, Pa·s', w + 8 * dpr, 14 * dpr);
    for (const p of vis.points) {
      const yy = y(p.logPas);
      ctx.beginPath(); ctx.moveTo(x - 4 * dpr, yy); ctx.lineTo(x + 4 * dpr, yy); ctx.stroke();
      ctx.fillText(`${p.logPas} ${p.label}`, x + 8 * dpr, yy + 3 * dpr);
    }
    // every shell, then the skin and the inner wall marked
    for (let i = 0; i < f.N; i++) {
      ctx.strokeStyle = 'rgba(255,190,120,0.55)'; ctx.beginPath();
      const yy = y(f.logEtaAt(g.T[i])); ctx.moveTo(x - 10 * dpr, yy); ctx.lineTo(x - 4 * dpr, yy); ctx.stroke();
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffd7a8';
    const ys = y(f.logEtaAt(g.T[f.N - 1])), yi = y(f.logEtaAt(g.T[0]));
    ctx.fillText('skin', x - 12 * dpr, ys + 3 * dpr);
    ctx.fillText('core', x - 12 * dpr, Math.abs(yi - ys) < 11 * dpr ? ys - 9 * dpr : yi + 3 * dpr);
  }
  function drawRuler(w) {
    const L = 0.05 * scale, x0 = w - 16 * dpr - L, y0 = H - 16 * dpr;
    ctx.strokeStyle = 'rgba(185,171,156,0.7)'; ctx.lineWidth = dpr; ctx.beginPath();
    ctx.moveTo(x0, y0 - 4 * dpr); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0); ctx.lineTo(x0 + L, y0 - 4 * dpr); ctx.stroke();
    ctx.fillStyle = 'rgba(185,171,156,0.85)'; ctx.textAlign = 'center'; ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
    ctx.fillText('5 cm', x0 + L / 2, y0 - 6 * dpr);
  }
  function drawStatus(w) {
    ctx.fillStyle = 'rgba(12,9,7,0.6)'; ctx.fillRect(0, H * 0.82, w, 30 * dpr);
    ctx.fillStyle = '#ffd7a8'; ctx.textAlign = 'center'; ctx.font = `${13 * dpr}px "IBM Plex Sans", sans-serif`;
    ctx.fillText(g.status === 'burst' ? 'Blown out: the wall thinned to nothing.' : 'Off the pipe: the far end sagged well past its own radius.', w / 2, H * 0.82 + 20 * dpr);
  }

  // ---- readouts ----
  const fmt = (v, d = 0) => v.toFixed(d);
  function show() {
    const o = opts(), r = f.readings(g, o.tilt, o.omega), mm = (v) => fmt(v * 1000, v < 0.01 ? 1 : 0);
    out('time').textContent = `${fmt(g.t, 1)} s`;
    out('skin').textContent = `${fmt(r.skin)} °C`;
    out('core').textContent = `${fmt(r.inner)} °C`;
    out('size').textContent = `${mm(r.diameter)} × ${mm(r.length)} mm`;
    out('wall').textContent = `${mm(r.wall)} mm`;
    out('blow').textContent = `10^${fmt(r.logBlow, 1)} Pa·s`;
    out('sag').textContent = r.sagRate * 1000 >= 0.1 ? `${fmt(r.sagRate * 1000, 1)} mm/s` : 'set';
    out('emis').textContent = fmt(r.emissivity, 2);
    out('power').textContent = `${r.power > 0 ? '+' : ''}${fmt(r.power)} W`;
    out('note').textContent = note(r, o);
  }
  function note(r, o) {
    if (g.status === 'burst') return 'The bubble ran away: as the wall thins it gets easier to stretch, so constant breath blows it faster and faster. Blowers blow in short puffs and let the wall set between them. Start a new gather.';
    if (g.status === 'dropped') return 'Without turning, the sag only adds up. Start a new gather and keep the pipe turning.';
    if (r.logBlow > 6.6) return 'Too stiff to blow: the glass next to the bubble is past its softening point. Back into the glory hole.';
    if (blowing && g.b > 2.5 * F.gather.radius && r.wall < 2e-3) return 'The bubble has run away. Its wall is thin enough now to chill fast, and once it sets no breath will move it.';
    if (o.omega === 0 && r.sagRate > 1e-3) return 'The pipe has stopped and the gather is falling. Turn it.';
    if (blowing) return `Blowing at ${$('breath').value} kPa. The glass next to the bubble does almost all of the stretching, so the core's heat, not the skin's, decides how fast it moves.`;
    if (o.where === 'glory') return 'In the glory hole the gather takes back heat by the same bands it loses it in. Near the walls’ temperature it almost vanishes against them.';
    return r.skin < r.inner - 40 ? 'Out of the fire the skin chills first. A chilled skin carries the bending, so it holds the gather straight while the core is still soft enough to blow.' : 'Fresh from the furnace, the gather is runny. Keep it turning.';
  }

  // ---- loop ----
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000) * +$('speed').value; last = now;
    if (!g.status && dt > 0) {
      f.step(g, dt, opts());
      trail.push([...g.drop]); if (trail.length > 90) trail.shift();
    }
    draw(); show();
    if (visible) raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!raf && visible) { last = 0; raf = requestAnimationFrame(frame); } };

  const blow = root.querySelector('.fs-blow');
  const press = (on) => (e) => { if (e.type === 'pointerdown') blow.setPointerCapture?.(e.pointerId); blowing = on; blow.classList.toggle('on', on); };
  blow.addEventListener('pointerdown', press(true));
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) blow.addEventListener(ev, press(false));
  blow.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press(true)(e); } });
  blow.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') press(false)(e); });
  blow.addEventListener('contextmenu', (e) => e.preventDefault());
  root.querySelector('.fs-new').addEventListener('click', fresh);
  $('batch').addEventListener('change', fresh);
  for (const el of root.querySelectorAll('input')) el.addEventListener('input', () => {
    for (const o of root.querySelectorAll('[data-show]')) o.textContent = { breath: `${$('breath').value} kPa`, turn: `${$('turn').value} rev/s`, tilt: `${$('tilt').value}°` }[o.dataset.show];
  });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(canvas);
  fresh(); resize(); start();
}
