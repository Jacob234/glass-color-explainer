// qn-plot.js — the Qⁿ diagram, drawn in ink: share of silicons with n bridging oxygens against how
// much modifier the glass holds. Used by the oxide bench (stage 01) and the Structure Lab.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
export const SPECIES = ['Q⁴', 'Q³', 'Q²', 'Q¹', 'Q⁰'];

// Static frame for a plot of width W, height H with x from x0 to x1; returns scales and the frame group.
export function frame({ x0, x1, ticks, fmt = String, xlabel, W = 640, H = 340, L = 54, R = 18, T = 40, B = 44 }) {
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => H - B - y * (H - T - B);
  const g = el('g', { class: 'axis' });
  g.append(el('line', { x1: L, y1: H - B, x2: W - R, y2: H - B }), el('line', { x1: L, y1: T, x2: L, y2: H - B }),
    el('text', { x: 14, y: 18, class: 'ax-l' }, 'share of silicons'),
    el('text', { x: W - R, y: H - 6, class: 'ax-l', 'text-anchor': 'end' }, xlabel));
  for (let y = 0.25; y <= 0.751; y += 0.25) g.append(el('line', { x1: L - 5, x2: L, y1: sy(y), y2: sy(y) }), el('text', { x: L - 9, y: sy(y) + 4, class: 'ax-t', 'text-anchor': 'end' }, `${Math.round(y * 100)}%`));
  for (const t of ticks) g.append(el('line', { x1: sx(t), x2: sx(t), y1: H - B, y2: H - B + 5 }), el('text', { x: sx(t), y: H - B + 18, class: 'ax-t', 'text-anchor': 'middle' }, fmt(t)));
  return { sx, sy, g, box: { L, R, T, B, W, H } };
}

// Curves for each species from rows of { x, Q }; cls styles the line. Labels go at each curve's peak
// (or at its right end for Q⁴, which only falls), skipped where the peak is below `labelMin`.
export function curves(F, rows, { cls = 'ln', label = true, labelMin = 0.12, species = [0, 1, 2, 3, 4] } = {}) {
  const out = [];
  for (const i of species) {
    const pts = rows.map((r) => [F.sx(r.x), F.sy(r.Q[i])]);
    out.push(el('path', { d: pathOf(pts), class: cls }));
    if (!label) continue;
    let k = 0;
    rows.forEach((r, j) => { if (r.Q[i] > rows[k].Q[i]) k = j; });
    if (i === 0) k = rows.findIndex((r) => r.Q[0] < 0.5); // Q⁴ is labelled where it crosses half
    if (k < 0 || rows[k].Q[i] < labelMin) continue;
    out.push(el('text', { x: F.sx(rows[k].x) + (i === 0 ? 8 : 0), y: F.sy(rows[k].Q[i]) - 8, class: 'lab', 'text-anchor': i === 0 ? 'start' : 'middle' }, SPECIES[i]));
  }
  return out;
}

// A vertical rule at x, with a label at the top; bold for this glass, faint for the reference.
export function rule(F, x, text, { faint = false, anchor = 'start' } = {}) {
  const X = F.sx(x), dx = anchor === 'end' ? -6 : 6;
  return [el('line', { x1: X, x2: X, y1: F.box.T, y2: F.box.H - F.box.B, class: faint ? 'ln faint dash' : 'ln thin' }),
    el('text', { x: X + dx, y: F.box.T + 10, class: faint ? 'lab faint' : 'lab', 'text-anchor': anchor }, text)];
}

// Measured points: a small open circle per species per glass.
export const points = (F, rows) => rows.flatMap(([x, ...pct]) => pct.map((p, i) => (p > 0 ? el('circle', { cx: F.sx(x), cy: F.sy(p / 100), r: 3.4, class: 'ring' }) : null)).filter(Boolean));
