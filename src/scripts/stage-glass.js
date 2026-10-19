// stage-glass.js — the instruments of stage 00, what glass is. Diagrams are drawn in ink; the
// only colour is the gather, which is clear soda-lime glass (its trace of iron) computed through
// the page's engine and relit with the page's lamp. Physics lives in glass.js.
import * as g from './glass.js';
import vis from '../data/viscosity.json' with { type: 'json' };

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const meters = (dl, rows) => {
  dl.replaceChildren(...rows.map(([dt, dd, v]) => {
    const d = document.createElement('div');
    d.innerHTML = `<dt></dt><dd></dd><i style="--v:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i>`;
    d.querySelector('dt').textContent = dt; d.querySelector('dd').textContent = dd;
    return d;
  }));
};
const sup = (n) => String(n).replace(/[-0-9.]/g, (c) => ({ '-': '⁻', '.': '·' }[c] ?? '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]));
const pow10 = (x, digits = 1) => `10${sup(Number(x.toFixed(digits)))}`;
function duration(s) {
  if (!isFinite(s)) return 'never';
  const units = [[3.156e7 * 1e9, 'billion years'], [3.156e7 * 1e6, 'million years'], [3.156e7, 'years'], [86400, 'days'], [3600, 'hours'], [60, 'minutes'], [1, 'seconds'], [1e-3, 'milliseconds'], [1e-6, 'microseconds']];
  for (const [u, name] of units) if (s >= u) { const v = s / u; return `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en')} ${v < 1.05 && v >= 0.95 ? name.replace(/s$/, '') : name}`; }
  return `${(s * 1e9).toFixed(0)} nanoseconds`;
}

/* ---------- the network ---------- */
const STD_X = g.modifierFraction(g.STANDARD);
const M = g.moles(g.STANDARD), SODA_SHARE = (M.Na2O + M.K2O) / (M.Na2O + M.K2O + M.CaO);

function network() {
  const svg = $('netSvg'), s = $('mods');
  const S = 30, W = 640, H = 400;
  const base = g.honeycomb(30, 14), glassy = g.disorder(base, { fraction: 0.55, seed: 11 });
  const nets = { crystal: base, glass: glassy };
  let order = 'glass';
  // Place each patch so its centre sits in the middle of the view.
  const place = (net) => {
    const xs = net.nodes.map((p) => p.x), ys = net.nodes.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return net.nodes.map((p) => [W / 2 + (p.x - cx) * S, H / 2 + (p.y - cy) * S]);
  };
  const pos = { crystal: place(base), glass: place(glassy) };
  // Bonds that may be broken, in a fixed order, so adding flux only ever adds breaks.
  const inside = (net, P) => net.bonds.map((b, i) => i).filter((i) => net.bonds[i].every((n) => P[n][0] > -10 && P[n][0] < W + 10 && P[n][1] > -10 && P[n][1] < H + 10));
  const rand = g.rng(5);
  const breakOrder = Object.fromEntries(Object.entries(nets).map(([k, net]) => [k, inside(net, pos[k]).map((i) => [i, rand(), rand()]).sort((a, b) => a[1] - b[1])]));
  const press = chipRow($('netOrder'), [['crystal', 'crystal (quartz)'], ['glass', 'glass (silica)']], (id) => { order = id; render(); });

  function render() {
    const x = s.valueAsNumber / 100, net = nets[order], P = pos[order];
    const nbo = g.nboPerT(x), cornerFrac = Math.min(1, nbo / 4);
    const visible = breakOrder[order], visibleSi = new Set(visible.flatMap(([i]) => net.bonds[i]));
    const nBreak = Math.min(visible.length, Math.round((cornerFrac * 3 * visibleSi.size) / 2));
    const broken = new Map(visible.slice(0, nBreak).map(([i, , r]) => [i, r < SODA_SHARE ? 'na' : 'ca']));
    // each Si's three corners: the shared midpoint, or pulled back toward it when the bridge is cut
    const corners = net.nodes.map(() => []);
    const gT = svgEl('g', { class: 'net-tri' }), gO = svgEl('g'), gM = svgEl('g');
    net.bonds.forEach(([a, b], i) => {
      const [ax, ay] = P[a], [bx, by] = P[b], cut = broken.get(i);
      if (!cut) {
        const m = [(ax + bx) / 2, (ay + by) / 2];
        corners[a].push(m); corners[b].push(m);
        gO.append(svgEl('circle', { cx: m[0], cy: m[1], r: 3.4, class: 'n-bo' }));
        return;
      }
      const t = 0.36, oa = [ax + (bx - ax) * t, ay + (by - ay) * t], ob = [bx + (ax - bx) * t, by + (ay - by) * t];
      corners[a].push(oa); corners[b].push(ob);
      for (const o of [oa, ob]) gO.append(svgEl('circle', { cx: o[0], cy: o[1], r: 3.4, class: 'n-nbo' }));
      const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len;
      if (cut === 'na') for (const k of [-1, 1]) gM.append(svgEl('circle', { cx: mx + nx * 6 * k, cy: my + ny * 6 * k, r: 4.2, class: 'n-na' }));
      else gM.append(svgEl('circle', { cx: mx, cy: my, r: 6.5, class: 'n-ca' }));
    });
    corners.forEach((c, i) => {
      if (c.length < 2) return;
      // order the corners around the silicon so the outline never crosses itself
      const [sx, sy] = P[i];
      const pts = [...c].sort((p, q) => Math.atan2(p[1] - sy, p[0] - sx) - Math.atan2(q[1] - sy, q[0] - sx));
      gT.append(svgEl(c.length === 3 ? 'polygon' : 'polyline', { points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ') }));
      gT.append(svgEl('circle', { cx: sx, cy: sy, r: 2.2, class: 'n-si' }));
    });
    svg.replaceChildren(gT, gO, gM);
    const bo = 1 - cornerFrac;
    $('modsOut').textContent = x === 0 ? 'none' : `${(x * 100).toFixed(1)} mol%`;
    meters($('netMeters'), [
      ['corners shared (bridging O)', `${Math.round(bo * 100)}%`, bo],
      ['non-bridging O per tetrahedron', nbo.toFixed(2), nbo / 4],
    ]);
    const std = Math.abs(x - STD_X) < 0.012;
    $('netRead').textContent = x === 0
      ? (order === 'crystal' ? 'Quartz-like order: every ring has six members, and the pattern repeats across the whole crystal.' : 'Silica glass: every corner is still shared, but the rings run to five, six and seven members and nothing repeats. Same chemistry as quartz, no lattice.')
      : std ? 'NBS standard glass No. 710, a soda-potash-lime window glass: about one corner in five is cut. This is the glass whose viscosity is plotted below.'
      : x < STD_X ? 'Each unit of soda or lime cuts one bridge. The network stays connected, but every cut is a place where it can shear when hot.'
      : nbo < 2 ? 'More flux than a window glass. It melts and works cooler but is less durable, and the network is loosening toward sheets and chains.'
      : 'Two non-bridging oxygens per tetrahedron: the network has fallen apart into chains and rings. Melts like this crystallize readily instead of forming glass.';
    press(order);
  }
  $('modsStd').addEventListener('click', () => { s.value = String((STD_X * 100).toFixed(1)); render(); });
  s.addEventListener('input', render);
  render();
}

function chipRow(box, items, onPick) {
  const buttons = items.map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip chip-plain'; b.textContent = label; b.dataset.id = id;
    b.addEventListener('click', () => onPick(id));
    box.append(b);
    return b;
  });
  return (cur) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === cur)));
}

/* ---------- plots ---------- */
function axes(svg, { x0, x1, y0, y1, L = 62, R = 18, T = 26, B = 44, W = 640, H }) {
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  const frame = svgEl('g', { class: 'axis' });
  frame.append(svgEl('line', { x1: L, y1: H - B, x2: W - R, y2: H - B }), svgEl('line', { x1: L, y1: T, x2: L, y2: H - B }));
  return { sx, sy, frame, box: { L, R, T, B, W, H } };
}
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/* ---------- the glass transition ---------- */
function transition() {
  const svg = $('vtSvg'), s = $('rate');
  const X0 = 350, X1 = 1100, H = 360;
  const { sx, sy, frame, box } = axes(svg, { x0: X0, x1: X1, y0: 0, y1: 1, H, T: 40 });
  const TL = 1000; // liquidus, schematic
  const aL = 0.00075, aG = aL / 3, Vl = (T) => 0.38 + aL * (T - X0);
  const Vc = (T) => 0.12 + aG * 0.9 * (T - X0);
  const softplus = (z) => (z > 30 ? z : Math.log1p(Math.exp(z)));
  const glassV = (T, Tg, w = 8) => { const Tf = Tg + w * softplus((T - Tg) / w); return Vl(Tf) + aG * (T - Tf); };
  const curve = (f, a = X0, b = X1) => pathOf(Array.from({ length: 121 }, (_, i) => { const T = a + ((b - a) * i) / 120; return [sx(T), sy(f(T))]; }));
  const st = svgEl('g');
  frame.append(svgEl('text', { x: box.W - box.R, y: H - box.B - 8, class: 'ax-l', 'text-anchor': 'end' }, 'temperature →'), svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'volume (schematic)'));
  for (const T of [400, 600, 800, 1000]) frame.append(svgEl('line', { x1: sx(T), x2: sx(T), y1: H - box.B, y2: H - box.B + 5 }), svgEl('text', { x: sx(T), y: H - box.B + 18, class: 'ax-t', 'text-anchor': 'middle' }, `${T} °C`));
  const fixed = svgEl('g');
  fixed.append(
    svgEl('path', { d: curve(Vl, TL, X1), class: 'ln' }),
    svgEl('path', { d: curve(Vl, X0, TL), class: 'ln thin' }),
    svgEl('path', { d: curve(Vc, X0, TL), class: 'ln faint' }),
    svgEl('line', { x1: sx(TL), x2: sx(TL), y1: sy(Vc(TL)), y2: sy(Vl(TL)), class: 'ln faint dash' }),
    svgEl('text', { x: sx(1040), y: sy(Vl(1040)) - 10, class: 'lab', 'text-anchor': 'middle' }, 'liquid'),
    svgEl('text', { x: sx(TL) - 6, y: sy(Vc(TL)) - 10, class: 'lab faint', 'text-anchor': 'end' }, 'liquidus (schematic)'),
    svgEl('text', { x: sx(X0) + 6, y: sy(Vc(X0)) + 18, class: 'lab faint' }, 'crystal, had it crystallized'),
    svgEl('text', { x: sx(910), y: sy(Vl(910)) + 24, class: 'lab', 'text-anchor': 'middle' }, 'supercooled liquid'),
  );
  // the slowest and fastest glasses, as ghosts
  for (const q of [1e-4, 1e6]) fixed.append(svgEl('path', { d: curve((T) => glassV(T, g.glassTransition(q).T), X0, Math.min(X1, g.glassTransition(q).T + 60)), class: 'ln ghost' }));
  svg.replaceChildren(frame, fixed, st);
  function render() {
    const lq = s.valueAsNumber, q = 10 ** lq, t = g.glassTransition(q);
    st.replaceChildren(
      svgEl('path', { d: curve((T) => glassV(T, t.T), X0, Math.min(X1, t.T + 60)), class: 'ln bold' }),
      svgEl('line', { x1: sx(t.T), x2: sx(t.T), y1: sy(Vl(t.T)) - 12, y2: H - box.B, class: 'ln dash' }),
      svgEl('text', { x: sx(t.T), y: sy(Vl(t.T)) - 18, class: 'lab', 'text-anchor': 'middle' }, `Tg ${Math.round(t.T)} °C`),
      svgEl('text', { x: sx(X0) + 6, y: sy(glassV(X0, t.T)) - 8, class: 'lab' }, 'glass'),
    );
    const perMin = q * 60;
    $('rateOut').textContent = perMin >= 1e4 ? `${pow10(lq, 1)} K/s` : perMin >= 1 ? `${perMin < 10 ? perMin.toFixed(1) : Math.round(perMin)} K/min` : `${(perMin * 60).toPrecision(2)} K/hour`;
    s.setAttribute('aria-valuetext', $('rateOut').textContent);
    meters($('tgMeters'), [
      ['glass transition', `${Math.round(t.T)} °C`, (t.T - 450) / 400],
      ['relaxation time there', duration(t.tau), (Math.log10(t.tau) + 6) / 11],
    ]);
    const span = duration(100 / q);
    $('tgRead').textContent = `At this rate it takes ${span} to cool 100 °C. Near ${Math.round(t.T)} °C the melt needs ${duration(t.tau)} to relax, as long as the cooling gives it, so its structure freezes in there. `
      + (lq < -2.5 ? 'This slow, the fit is extrapolated well below its range; a real melt held this long near its liquidus would also risk crystallizing.'
        : lq > 3 ? `Quenched this hard, the glass keeps the structure of a ${Math.round(t.T)} °C liquid: less dense than the same glass annealed.`
        : Math.abs(t.T - 546) < 12 ? 'This is close to the measured annealing point, which is why the annealing point is often taken as Tg.' : '');
  }
  s.addEventListener('input', render);
  render();
}

/* ---------- the viscosity curve and the gather ---------- */
function viscosity({ colorOf, onLamp }) {
  const svg = $('viscSvg'), s = $('vTemp'), gs = $('gatherSvg');
  const X0 = 400, X1 = 1500, Y0 = 0, Y1 = 16, H = 380;
  const { sx, sy, frame, box } = axes(svg, { x0: X0, x1: X1, y0: Y0, y1: Y1, H, R: 24, T: 48 });
  const clampY = (y) => Math.max(Y0, Math.min(Y1, y));
  frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'log₁₀ viscosity, Pa·s'));
  for (let y = 0; y <= 16; y += 2) frame.append(svgEl('line', { x1: box.L - 5, x2: box.L, y1: sy(y), y2: sy(y) }), svgEl('text', { x: box.L - 9, y: sy(y) + 4, class: 'ax-t', 'text-anchor': 'end' }, String(y)));
  for (let T = 400; T <= 1500; T += 200) frame.append(svgEl('line', { x1: sx(T), x2: sx(T), y1: H - box.B, y2: H - box.B + 5 }), svgEl('text', { x: sx(T), y: H - box.B + 18, class: 'ax-t', 'text-anchor': 'middle' }, `${T} °C`));
  const seg = (a, b) => pathOf(Array.from({ length: 160 }, (_, i) => { const T = a + ((b - a) * i) / 159; return [sx(T), sy(clampY(g.logEta(T)))]; }));
  const tLow = g.tempAt(Y1), [f0, f1] = g.FIT;
  const curve = svgEl('g');
  curve.append(svgEl('path', { d: seg(Math.max(X0, tLow), f0), class: 'ln dash' }), svgEl('path', { d: seg(f0, f1), class: 'ln bold' }), svgEl('path', { d: seg(f1, X1), class: 'ln dash' }));
  // named points: a tick on the curve, a label at the left, and the measured value as a ring
  const pts = svgEl('g');
  for (const p of vis.points) {
    const T = g.tempAt(p.logPas), y = sy(p.logPas);
    pts.append(svgEl('line', { x1: box.L, x2: sx(T), y1: y, y2: y, class: 'ln faint dash' }));
    pts.append(svgEl('circle', { cx: sx(T), cy: y, r: 2.6, class: 'dot' }));
    const last = p.id === 'melting';
    pts.append(svgEl('text', { x: sx(T) + (last ? -4 : 8), y: y - (last ? 12 : 6), class: 'lab', 'text-anchor': last ? 'end' : 'start' }, p.label));
    if (p.measured) pts.append(svgEl('circle', { cx: sx(p.measured), cy: y, r: 5, class: 'ring' }));
  }
  // the studio along the top
  const studio = svgEl('g');
  vis.studio.forEach((st, i) => {
    const x = sx(st.T);
    studio.append(svgEl('line', { x1: x, x2: x, y1: box.T + 4, y2: sy(clampY(g.logEta(st.T))), class: 'ln faint' }));
    studio.append(svgEl('text', { x: x + (i === 0 ? 4 : i === 1 ? -4 : 0), y: box.T - 6, class: 'lab studio', 'text-anchor': i === 0 ? 'start' : i === 1 ? 'end' : 'middle' }, st.label));
  });
  const marker = svgEl('g');
  svg.replaceChildren(frame, pts, studio, curve, marker);
  svg.addEventListener('click', (e) => {
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * box.W;
    const T = X0 + ((x - box.L) / (box.W - box.L - box.R)) * (X1 - X0);
    if (T >= X0 && T <= X1) { s.value = String(Math.round(T)); render(); }
  });

  // the gather: clear soda-lime glass with its trace of iron, seen through about 6 cm of it
  const clear = () => colorOf([['iron-ferrous', 0.12 * 0.6], ['iron-ferric', 0.12 * 0.4]], 8).css;
  let fill = clear();
  function gather(sag) {
    // sag: 0 holds its shape, 1 has sagged its own radius in one second held still
    const cx = 210, cy = 62, R = 44, d = Math.min(1.6, sag) * R, neck = Math.max(0.35, 1 - sag * 0.45);
    const body = `M${cx - R} ${cy} C${cx - R} ${cy - R * 0.75} ${cx - R * 0.45} ${cy - R} ${cx} ${cy - R} C${cx + R * 0.45} ${cy - R} ${cx + R} ${cy - R * 0.75} ${cx + R} ${cy}`
      + ` C${cx + R} ${cy + R * 0.6 + d * 0.3} ${cx + R * neck} ${cy + R * 0.7 + d} ${cx} ${cy + R + d}`
      + ` C${cx - R * neck} ${cy + R * 0.7 + d} ${cx - R} ${cy + R * 0.6 + d * 0.3} ${cx - R} ${cy}Z`;
    const drip = sag > 1.6 ? [svgEl('ellipse', { cx, cy: cy + R + d + 18, rx: 7, ry: 9, fill })] : [];
    gs.replaceChildren(
      svgEl('rect', { x: 0, y: cy - 4, width: cx - R + 12, height: 8, rx: 2, class: 'pipe' }),
      svgEl('path', { d: body, fill, class: 'glob' }),
      ...drip,
      svgEl('text', { x: 6, y: 222, class: 'lab' }, 'a 10 cm gather after one second held still'),
    );
  }
  function render() {
    const T = s.valueAsNumber, le = g.logEta(T), ts = g.sagTime(T);
    $('vTempOut').textContent = String(Math.round(T));
    s.setAttribute('aria-valuetext', `${Math.round(T)} degrees Celsius`);
    const y = sy(clampY(le)), x = sx(Math.max(X0, T));
    marker.replaceChildren(...(T >= X0 && isFinite(le) && le <= Y1 ? [svgEl('circle', { cx: x, cy: y, r: 6.5, class: 'mark' }), svgEl('line', { x1: x, x2: x, y1: y, y2: H - box.B, class: 'ln dash' })] : []));
    gather(isFinite(ts) ? 1 / ts : 0);
    meters($('viscMeters'), [
      ['viscosity', isFinite(le) && le < 30 ? `${pow10(le)} Pa·s` : 'no value', Math.min(1, (isFinite(le) ? le : 16) / 16)],
      ['sags its own size in', isFinite(ts) && le < 30 ? duration(ts) : 'never', Math.min(1, Math.max(0, (Math.log10(isFinite(ts) ? ts : 1e20) + 2) / 20))],
    ]);
    const at = (id) => g.tempAt(vis.points.find((p) => p.id === id).logPas);
    $('viscRead').textContent = T < 300 ? `Room temperature is below the fit's own limit of ${Math.round(g.T_DIVERGE)} °C, where it goes to infinity. The fit cannot say how stiff the glass is here, only that nothing in the studio would ever see it move.`
      : T < g.FIT[0] ? `Below ${g.FIT[0]} °C the curve is extrapolated. The lehr works here: held near the annealing point the glass relaxes its stress, then it is cooled slowly past the strain point so no new stress freezes in.`
      : T < at('softening') ? 'Between softening and annealing. Too stiff to shape, soft enough that stress relaxes and a piece slowly slumps under its own weight. Kilns slump and fuse here.'
      : T < at('working') ? 'Between working and softening: the glass holds its shape on the pipe for a few seconds, long enough to marver, blow and tool.'
      : T < 1250 ? 'The working range. Left still for a second the gather runs off the pipe, which is why a glassblower never stops turning it.'
      : 'Melting range. The glass is runny enough for bubbles to rise out of it, which is how a batch is fined.';
  }
  onLamp(() => { fill = clear(); render(); });
  s.addEventListener('input', render);
  render();
}

export function glassStage(engine) {
  if (!$('glass')) return;
  network(); transition(); viscosity(engine);
}
