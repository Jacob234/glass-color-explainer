// stage-batch.js — the oxide bench in stage 01, the batch. Diagrams are drawn in ink; the only
// color is the slab, the same iron as the slab above with its Fe²⁺ share set by this batch.
// Composition models live in batch.js.
import * as b from './batch.js';
import * as m from './measured.js';
import { GLASSES, index, abbe, LINES } from './dispersion.js';
import sheffield from '../data/durability.json' with { type: 'json' };
import batchData from '../data/batch.json' with { type: 'json' };
import * as qn from './qn.js';
import * as qp from './qn-plot.js';

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
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
function axes({ x0, x1, y0, y1, L = 62, R = 18, T = 26, B = 44, W = 640, H }) {
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  const frame = svgEl('g', { class: 'axis' });
  frame.append(svgEl('line', { x1: L, y1: H - B, x2: W - R, y2: H - B }), svgEl('line', { x1: L, y1: T, x2: L, y2: H - B }));
  return { sx, sy, frame, box: { L, R, T, B, W, H } };
}
const signed = (x, digits = 0) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`;

// The oxides a slider moves: everything but silica, which is the balance, and iron, which has its own slider.
const MOVED = b.OXIDES.filter((o) => o.max);
const SILICA_MIN = 40; // wt%
const ROLE = {
  Na2O: 'Soda is the flux. It breaks the silica network into non-bridging oxygens, so the batch melts at a temperature a furnace can reach; the broken network also expands more when heated and is attacked faster by water. In the iron model an alkaline melt favors Fe³⁺, so more soda pales the green toward yellow.',
  K2O: 'Potash acts like soda, a little more strongly. Soda and potash together soften the glass at low temperature more than either alone, the mixed-alkali effect, which lengthens the working range. Medieval forest glass was fluxed with potash from wood and fern ash.',
  CaO: 'Lime mends the network soda broke: without it a soda-silica glass dissolves in water, and in the durability fit below each mol% of lime cancels about 1.1 mol% of soda. In Fluegel\'s model a mol% of lime in place of silica lowers the melting end of the curve (−17 °C at 10¹·⁵ Pa·s) but raises the annealing end (+7 °C at 10¹² Pa·s). The curve steepens and the gather sets fast. Glassmakers call this a short glass.',
  MgO: 'Magnesia comes in with dolomite, which float glass uses for part of its lime. It stiffens the annealing end far less than lime does, and float makers use it partly to keep crystals from forming as the sheet cools.',
  Al2O3: 'Alumina joins the network as tetrahedra, each taking an alkali ion to balance its charge, so it mends the breaks soda made. The glass grows stiffer at every temperature and more durable: in the durability fit below a mol% of alumina cancels 2.3 mol% of soda. Bottle glass carries more of it than window glass.',
  B2O3: 'Boric oxide is a second network former. Borosilicate expands about a third as much as window glass, so it survives going from oven to cold water. Its effect is not simply additive: at first boron takes up the soda and stiffens the glass, and past a point it softens it again, the boron anomaly. Appen\'s boron factor follows this through the ratio of modifiers to boron.',
  PbO: 'Lead oxide softens the glass over a long range, which is why lead crystal is easy to cut. Here the index rises because lead packs more matter into each cubic centimeter, not because it bends more light per gram: Young and Finn\'s specific refraction for PbO is the lowest of any oxide on this bench. Dispersion rises faster than index, so the Abbe number falls and cut lead crystal throws color (stage 07′).',
};

export function batchStage({ colorOf, onLamp }) {
  if (!$('oxides')) return;
  const iron = $('iron');
  const round = (x) => Math.round(x * 10) / 10;
  const presetWt = (p) => Object.fromEntries(MOVED.map((o) => [o.id, round(p.wt[o.id] ?? 0)]));
  let wt = presetWt(b.BASE), preset = 'float', touched = null;
  const molOf = (w) => b.fromWt(w);
  const base = b.properties(molOf(presetWt(b.BASE)));

  /* sliders */
  const box = $('bSliders'), inputs = {}, outs = {};
  const silica = document.createElement('dl'); silica.className = 'meters';
  box.append(silica);
  for (const o of MOVED) {
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    ctl.innerHTML = `<label class="mono" for="ox-${o.id}"><span></span><output></output></label><input id="ox-${o.id}" type="range" min="0" max="${o.max}" step="0.1" />`;
    ctl.querySelector('span').textContent = `${o.label} ${o.name}`;
    inputs[o.id] = ctl.querySelector('input'); outs[o.id] = ctl.querySelector('output');
    inputs[o.id].addEventListener('input', () => {
      const others = Object.entries(wt).filter(([k]) => k !== o.id).reduce((s, [, v]) => s + v, 0);
      wt[o.id] = round(Math.min(inputs[o.id].valueAsNumber, 100 - SILICA_MIN - others));
      preset = null; touched = o.id; render();
    });
    box.append(ctl);
  }

  /* presets */
  const chipBox = $('bPresets');
  const chipButtons = b.PRESETS.map((p) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chip chip-plain'; btn.textContent = p.label; btn.dataset.id = p.id;
    btn.addEventListener('click', () => { wt = presetWt(p); preset = p.id; touched = null; render(); });
    chipBox.append(btn);
    return btn;
  });

  /* the viscosity curve */
  const vs = $('bViscSvg'), VX0 = 350, VX1 = 1650, VY0 = 0, VY1 = 14, VH = 380;
  const V = axes({ x0: VX0, x1: VX1, y0: VY0, y1: VY1, H: VH, R: 24, T: 30 });
  V.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'log₁₀ viscosity, Pa·s'));
  for (let y = 0; y <= VY1; y += 2) V.frame.append(svgEl('line', { x1: V.box.L - 5, x2: V.box.L, y1: V.sy(y), y2: V.sy(y) }), svgEl('text', { x: V.box.L - 9, y: V.sy(y) + 4, class: 'ax-t', 'text-anchor': 'end' }, String(y)));
  for (let T = 400; T <= 1600; T += 300) V.frame.append(svgEl('line', { x1: V.sx(T), x2: V.sx(T), y1: VH - V.box.B, y2: VH - V.box.B + 5 }), svgEl('text', { x: V.sx(T), y: VH - V.box.B + 18, class: 'ax-t', 'text-anchor': 'middle' }, `${T} °C`));
  const vcurve = (v, lo, hi) => {
    const pts = [];
    for (let i = 0; i <= 120; i++) { const L = lo + ((hi - lo) * i) / 120, T = v.tempAt(L); if (T >= VX0 && T <= VX1) pts.push([V.sx(T), V.sy(L)]); }
    return pathOf(pts);
  };
  const ghost = svgEl('g'), live = svgEl('g');
  ghost.append(svgEl('path', { d: vcurve(base.viscosity, VY0, VY1), class: 'ln dash' }));
  vs.replaceChildren(V.frame, ghost, live);
  const POINTS = [['melting', 1], ['working', 3], ['softening', 6.6], ['annealing', 12]];

  /* the Abbe diagram: index against Abbe number, with the cold shop's glasses */
  const as = $('bAbbeSvg'), AX0 = 90, AX1 = 20, AY0 = 1.44, AY1 = 1.82, AH = 380;
  const A = axes({ x0: AX0, x1: AX1, y0: AY0, y1: AY1, H: AH, T: 30 });
  A.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'refractive index, yellow d line'), svgEl('text', { x: A.box.W - A.box.R, y: 18, class: 'ax-l', 'text-anchor': 'end' }, 'Abbe number, falling →'));
  for (let y = 1.45; y <= 1.81; y += 0.05) A.frame.append(svgEl('line', { x1: A.box.L - 5, x2: A.box.L, y1: A.sy(y), y2: A.sy(y) }), svgEl('text', { x: A.box.L - 9, y: A.sy(y) + 4, class: 'ax-t', 'text-anchor': 'end' }, y.toFixed(2)));
  for (let x = 80; x >= 20; x -= 20) A.frame.append(svgEl('line', { x1: A.sx(x), x2: A.sx(x), y1: AH - A.box.B, y2: AH - A.box.B + 5 }), svgEl('text', { x: A.sx(x), y: AH - A.box.B + 18, class: 'ax-t', 'text-anchor': 'middle' }, String(x)));
  // The usual crown–flint line: ν = 50 below n_d 1.60, ν = 55 above.
  const fixed = svgEl('g');
  fixed.append(svgEl('path', { d: pathOf([[A.sx(50), A.sy(AY0)], [A.sx(50), A.sy(1.6)], [A.sx(55), A.sy(1.6)], [A.sx(55), A.sy(AY1)]]), class: 'ln faint dash' }),
    svgEl('text', { x: A.sx(55) - 10, y: A.sy(1.7), class: 'lab faint', 'text-anchor': 'end' }, 'crowns'),
    svgEl('text', { x: A.sx(55) + 10, y: A.sy(1.7), class: 'lab faint' }, 'flints'));
  // Glasses that sit on one spot (SF11 and its lead-free twin) share a ring and a label.
  const placed = [];
  for (const g of GLASSES) {
    const nd = g.nd ?? index(g, LINES.d), vd = g.vd ?? abbe(g);
    if (!(vd <= AX0 && vd >= AX1)) continue;
    const twin = placed.find((q) => Math.abs(q.nd - nd) < 0.005 && Math.abs(q.vd - vd) < 0.3);
    if (twin) { twin.label.textContent = twin.label.textContent.split(' ')[0] + ' and ' + g.label.split(',')[0]; continue; }
    // Window glass and BK7 sit beside the batch's own dot, so their labels go to the left of their rings.
    const right = vd < 40 || g.id === 'sodalime' || g.id === 'bk7', below = g.id === 'sodalime' ? 18 : g.id === 'bk7' ? -8 : 4;
    const label = svgEl('text', { x: A.sx(vd) + (right ? -9 : 9), y: A.sy(nd) + below, class: 'lab faint', 'text-anchor': right ? 'end' : 'start' }, g.label);
    fixed.append(svgEl('circle', { cx: A.sx(vd), cy: A.sy(nd), r: 5, class: 'ring' }), label);
    placed.push({ nd, vd, label });
  }
  const alive = svgEl('g');
  as.replaceChildren(A.frame, fixed, alive);

  const cross = (x, y, r, cls) => svgEl('path', { d: `M${x - r} ${y - r}L${x + r} ${y + r}M${x - r} ${y + r}L${x + r} ${y - r}`, class: cls });

  /* durability: weight lost in an hour's boil against the soda the other oxides leave free */
  const ds = $('bDurSvg'), DX0 = -12, DX1 = 36, DY0 = -1.3, DY1 = 2.15, DH = 380, lg = Math.log10;
  const D = axes({ x0: DX0, x1: DX1, y0: DY0, y1: DY1, H: DH, T: 30 });
  D.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'weight lost in an hour\'s boil, %'),
    svgEl('text', { x: D.box.W - D.box.R, y: DH - 6, class: 'ax-l', 'text-anchor': 'end' }, 'free soda, mol% →'));
  for (const v of [0.1, 0.3, 1, 3, 10, 30, 100]) D.frame.append(svgEl('line', { x1: D.box.L - 5, x2: D.box.L, y1: D.sy(lg(v)), y2: D.sy(lg(v)) }), svgEl('text', { x: D.box.L - 9, y: D.sy(lg(v)) + 4, class: 'ax-t', 'text-anchor': 'end' }, String(v)));
  for (let x = -10; x <= 30; x += 10) D.frame.append(svgEl('line', { x1: D.sx(x), x2: D.sx(x), y1: DH - D.box.B, y2: DH - D.box.B + 5 }), svgEl('text', { x: D.sx(x), y: DH - D.box.B + 18, class: 'ax-t', 'text-anchor': 'middle' }, String(x)));
  const dCurve = [];
  for (let i = 0; i <= 160; i++) { const F = DX0 + ((DX1 - DX0) * i) / 160; dCurve.push([D.sx(F), D.sy(lg(batchData.durability.floor + b.dissolved(F)))]); }
  // Each measured glass at its own free soda, its loss brought to the 500–700 µm grains of the main series.
  const dFixed = svgEl('g');
  dFixed.append(svgEl('path', { d: pathOf(dCurve), class: 'ln' }));
  for (const g of sheffield.glasses) {
    const F = b.freeSoda(g.mol), y = lg(g.loss) - (batchData.durability.grain[g.grain] ?? 0);
    if (F >= DX0 && F <= DX1) dFixed.append(cross(D.sx(F), D.sy(Math.min(DY1, y)), 3.5, 'x'));
  }
  const ws = b.freeSoda(b.PRESET.float.mol), wl = b.toMol({ SiO2: 67.9, Na2O: 32.1 });
  dFixed.append(svgEl('text', { x: D.sx(b.freeSoda(wl)) - 10, y: D.sy(2) + 4, class: 'lab faint', 'text-anchor': 'end' }, 'dissolved'),
    svgEl('line', { x1: D.box.L, x2: D.box.W - D.box.R, y1: D.sy(lg(batchData.durability.floor)), y2: D.sy(lg(batchData.durability.floor)), class: 'ln faint dash' }),
    svgEl('text', { x: D.box.W - D.box.R, y: D.sy(lg(batchData.durability.floor)) - 8, class: 'lab faint', 'text-anchor': 'end' }, 'floor of the test'));
  const dLive = svgEl('g');
  ds.replaceChildren(D.frame, dFixed, dLive);

  /* measured melts from SciGlass, fetched once the bench is near the screen */
  let sg = null, sgState = 'idle';
  const loadMeasured = () => {
    if (sgState !== 'idle') return;
    sgState = 'loading';
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/data/sciglass/bench.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { sg = d; sgState = 'ready'; render(); })
      .catch(() => { sgState = 'failed'; render(); });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadMeasured(); } }, { rootMargin: '600px' });
    io.observe($('oxides'));
  } else loadMeasured();
  const vGlass = svgEl('g'), aGlass = svgEl('g');
  vs.insertBefore(vGlass, live); as.insertBefore(aGlass, alive);

  /* the network: Qⁿ against non-bridging oxygens per silicon, for this batch's modifiers at its own Tg */
  const NX1 = 2.5, NF = qp.frame({ x0: 0, x1: NX1, ticks: [0, 0.5, 1, 1.5, 2, 2.5], fmt: (t) => t.toFixed(1), xlabel: 'non-bridging oxygens per silicon' });
  const netLive = svgEl('g');
  $('bNetSvg').replaceChildren(NF.g, netLive);
  const baseNet = qn.batchNetwork(b.BASE.mol);
  const randomRows = Array.from({ length: 51 }, (_, i) => ({ x: (i * NX1) / 50, Q: qn.random((i * NX1) / 50) }));
  const randomLines = qp.curves(NF, randomRows, { cls: 'ln faint dash', label: false, species: [0, 1, 2, 3] });

  /* the slab */
  const slabSvg = $('bSlab'), face = slabSvg.querySelector('.face'), cast = slabSvg.querySelector('.cast'), edges = slabSvg.querySelectorAll('.edge');

  function render() {
    chipButtons.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === preset)));
    for (const o of MOVED) { inputs[o.id].value = String(wt[o.id]); outs[o.id].textContent = `${wt[o.id].toFixed(1)} wt%`; }
    const mol = molOf(wt), p = b.properties(mol), sio2 = 100 - Object.values(wt).reduce((s, v) => s + v, 0);
    meters(silica, [['SiO₂ silica, the balance', `${sio2.toFixed(1)} wt%`, sio2 / 100]]);

    // viscosity
    const v = p.viscosity, items = [svgEl('path', { d: vcurve(v, 1.5, 12), class: 'ln bold' }), svgEl('path', { d: vcurve(v, VY0, 1.5), class: 'ln' }), svgEl('path', { d: vcurve(v, 12, VY1), class: 'ln' })];
    for (const [L, T] of b.isokoms(mol)) if (T >= VX0 && T <= VX1) items.push(svgEl('circle', { cx: V.sx(T), cy: V.sy(L), r: 5, class: 'ring' }));
    // Fluegel as published, faint and dashed, wherever the SciGlass alumina–magnesia term moves the curve.
    const shift = Math.max(...b.LEVELS.map((L) => Math.abs(b.correction(mol, L))));
    if (shift >= 2) {
      const fv = b.fluegelViscosity(mol), x1 = V.box.W - V.box.R, y = V.box.T + 14;
      items.unshift(svgEl('path', { d: vcurve(fv, 1.5, 12), class: 'ln faint dash' }),
        svgEl('line', { x1: x1 - 30, x2: x1, y1: y, y2: y, class: 'ln faint dash' }),
        svgEl('text', { x: x1 - 38, y: y + 4, class: 'lab faint', 'text-anchor': 'end' }, 'Fluegel as published'));
    }
    for (const [id, L] of POINTS) {
      const T = p[id]; if (!(T >= VX0 && T <= VX1)) continue;
      items.push(svgEl('circle', { cx: V.sx(T), cy: V.sy(L), r: 2.6, class: 'dot' }),
        svgEl('text', { x: V.sx(T) + (id === 'melting' ? -6 : 9), y: V.sy(L) - (id === 'melting' ? 12 : 6), class: 'lab', 'text-anchor': id === 'melting' ? 'end' : 'start' }, `${id} ${Math.round(T)} °C`));
    }
    const yr = VH - V.box.B - 10, xs = V.sx(Math.max(VX0, p.softening)), xw = V.sx(Math.min(VX1, p.working));
    items.push(svgEl('line', { x1: xs, x2: xw, y1: yr, y2: yr, class: 'ln bold' }),
      svgEl('text', { x: (xs + xw) / 2, y: yr - 8, class: 'lab', 'text-anchor': 'middle' }, `working range ${Math.round(p.range)} °C`));
    live.replaceChildren(...items);

    // measured melts: crosses at each nearby glass's measured points, the nearest drawn heavier
    const nearV = sg ? m.nearest(mol, sg, { has: ['visc'] }) : [], nearA = sg ? m.nearest(mol, sg, { has: ['nd', 'vd'] }) : [];
    vGlass.replaceChildren(...nearV.toReversed().flatMap((g) => g.visc.filter(([, T]) => T >= VX0 && T <= VX1)
      .map(([L, T]) => cross(V.sx(T), V.sy(L), g === nearV[0] ? 5 : 3.5, g === nearV[0] ? 'x' : 'x faint'))));
    aGlass.replaceChildren(...nearA.toReversed().filter((g) => g.vd <= AX0 && g.vd >= AX1 && g.nd >= AY0 && g.nd <= AY1)
      .map((g) => cross(A.sx(g.vd), A.sy(g.nd), g === nearA[0] ? 5 : 3.5, g === nearA[0] ? 'x' : 'x faint')));
    $('bMeasured').textContent = measuredText(nearV, nearA);

    // Abbe
    alive.replaceChildren(
      svgEl('circle', { cx: A.sx(base.vd), cy: A.sy(base.nd), r: 4, class: 'mark' }),
      svgEl('circle', { cx: A.sx(Math.max(AX1, Math.min(AX0, p.vd))), cy: A.sy(Math.max(AY0, Math.min(AY1, p.nd))), r: 6.5, class: 'dot' }),
      svgEl('text', { x: A.sx(p.vd) + 10, y: A.sy(p.nd) - 9, class: 'lab' }, 'this batch'),
    );

    // iron: the slider above sets how much, this batch sets how much of it is Fe²⁺
    const c = (iron.valueAsNumber / 100) ** 1.5 * 0.6, parts = [['iron-ferrous', c * p.ferrous], ['iron-ferric', c * (1 - p.ferrous)]];
    const fc = colorOf(parts, 0.5).css; face.setAttribute('fill', fc); cast.setAttribute('fill', fc);
    for (const e of edges) e.setAttribute('fill', colorOf(parts, 20).css);

    // Expansion: lehr stress and thermal shock both scale with α, everything else held at window
    // glass. Pilkington ATS-129 gives float glass a thermal stress of 0.62 MPa per °C of difference
    // and a mean breaking strength of 41 MPa (annealed, weathered).
    const stress = p.alpha / base.alpha, shock = 41 / (0.62 * stress), du = p.durability;
    meters($('bMeters'), [
      ['density', `${p.rho.toFixed(2)} g/cm³`, (p.rho - 2.1) / 1.4],
      ['refractive index, yellow d line', p.nd.toFixed(3), (p.nd - 1.45) / 0.2],
      ['Abbe number', p.vd.toFixed(0), p.vd / 80],
      ['expansion', `${p.alpha.toFixed(1)} ppm/K`, p.alpha / 12],
      ['lehr stress, window glass = 1', `× ${stress.toFixed(2)}`, stress / 1.5],
      ['iron as Fe²⁺', `${Math.round(p.ferrous * 100)}%`, p.ferrous],
      ['lost to boiling water, 1 h', du.atFloor ? `under ${du.loss.toFixed(1)}%` : `${du.loss < 10 ? du.loss.toFixed(1) : Math.round(du.loss)}%`, (lg(du.loss) - lg(0.2)) / (2 - lg(0.2))],
    ]);

    // durability
    const dx = D.sx(Math.max(DX0, Math.min(DX1, du.free))), dy = D.sy(lg(du.loss));
    dLive.replaceChildren(
      svgEl('circle', { cx: D.sx(ws), cy: D.sy(lg(base.durability.loss)), r: 4, class: 'mark' }),
      svgEl('circle', { cx: dx, cy: dy, r: 6.5, class: 'dot' }),
      svgEl('text', { x: dx + (du.free > 12 ? 12 : 10), y: dy + (du.free > 12 ? 22 : -10), class: 'lab', 'text-anchor': 'start' }, 'this batch'),
    );
    $('bDurRead').textContent = durText(du, mol);

    renderNet(mol);

    const molSi = mol.SiO2, R2O = mol.Na2O + mol.K2O;
    const warn = molSi < 43 || molSi > 89 || mol.B2O3 > 17 || mol.Al2O3 > 10
      ? ' This batch is outside the glasses the viscosity model was fitted to, so its curve is a guess.'
      : mol.Al2O3 >= 2 && mol.Al2O3 > 0.5 * R2O
        ? ' This batch carries more than half as much alumina as alkali. SciGlass melts like it are stiffer than even the corrected model, by a median 13 °C at the annealing end and 37 °C at the melting end: alumina is taking up the alkali that keeps the network broken, and the model\'s terms do not follow that to its end.'
        : '';
    const lead = touched ? ROLE[touched] : preset ? b.PRESET[preset].about : '';
    const cmp = preset === 'float' && !touched ? 'Window glass, the reference for everything below.'
      : `Against window glass its melting point moves ${signed(p.melting - base.melting)} °C, its annealing point ${signed(p.annealing - base.annealing)} °C, its working range ${signed(p.range - base.range)} °C and its index ${signed(p.nd - base.nd, 3)}.`;
    $('bRead').textContent = `${lead} ${cmp} A sheet of it would survive a sudden temperature jump of about ${Math.round(shock)} °C.${warn}`;
  }
  function durText(du, mol) {
    const free = du.free >= 0 ? `The other oxides leave ${du.free.toFixed(1)} mol% of the soda free.`
      : `The other oxides could take up ${Math.abs(du.free).toFixed(1)} mol% more soda than the batch has.`;
    const bare = ['CaO', 'MgO', 'Al2O3', 'PbO', 'B2O3'].every((k) => (mol[k] ?? 0) < 0.5);
    let t = du.atFloor
      ? `${free} Boiling water would take less from this glass than the 1920s test could measure, about 0.2% of its weight in an hour as grains.`
      : `${free} Boiled as grains for an hour, it would lose about ${du.loss < 10 ? du.loss.toFixed(1) : Math.round(du.loss)}% of its weight${du.dissolved > 90 ? ': it dissolves' : ''}.`;
    if (bare && !du.atFloor) t += ' Nothing in it holds the soda; this is the glass lime is there to prevent.';
    if (!du.fitted && !du.atFloor) t += ' Its composition is outside the glasses the durability fit saw, so the number is a guess.';
    return t;
  }
  function renderNet(mol) {
    const n = qn.batchNetwork(mol), pct = (v) => `${Math.round(v * 100)}%`;
    const rows = qn.trajectory(NX1, n.mix, n.Tf);
    const items = [...randomLines, ...qp.curves(NF, rows, { cls: 'ln', species: [0, 1, 2, 3] })];
    const x = Math.min(NX1, n.q), far = Math.abs(n.q - baseNet.q) > 0.08;
    if (far) items.push(...qp.rule(NF, baseNet.q, 'window', { faint: true, anchor: baseNet.q > n.q ? 'start' : 'end' }));
    items.push(...qp.rule(NF, x, 'this batch', { anchor: far && baseNet.q > n.q ? 'end' : 'start' }));
    n.Q.slice(0, 4).forEach((v, i) => { if (v > 0.005) items.push(svgEl('circle', { cx: NF.sx(x), cy: NF.sy(v), r: 3.2, class: 'dot' })); });
    netLive.replaceChildren(...items);
    const rows2 = [
      ['Q⁴, four bridges', pct(n.Q[0]), n.Q[0]],
      ['Q³, three', pct(n.Q[1]), n.Q[1]],
      ['Q², two: chains', pct(n.Q[2]), n.Q[2]],
      ['non-bridging O per Si', n.q.toFixed(2), n.q / 2.5],
    ];
    if (n.N4 != null) rows2.push(['boron as BO₄', pct(n.N4), n.N4]);
    meters($('bNetMeters'), rows2);
    const r = qn.random(n.q);
    let t = n.q < 0.005
      ? `No modifier is left over to break the silicate network: ${n.toAl > 0.25 ? `alumina takes ${n.toAl.toFixed(1)} mol% of it to balance its tetrahedra` : ''}${n.toAl > 0.25 && n.toB > 0.25 ? ' and ' : ''}${n.toB > 0.25 ? `boron takes ${n.toB.toFixed(1)} mol% to turn ${pct(n.N4)} of its triangles into tetrahedra` : ''}. Every silicon is Q⁴, as in silica.`
      : `${pct(n.Q[0])} of the silicons keep all four bridges and ${pct(n.Q[1])} have three. If every bridge were equally likely to break, the same ${n.q.toFixed(2)} cuts per silicon would leave ${pct(r[0])} and ${pct(r[1])}, with ${pct(r[2] + r[3] + r[4])} at two or fewer; the model's enthalpies make a modifier prefer a silicon that is still whole, so the cuts spread out.`;
    if (n.q >= 0.005 && (n.toAl > 0.25 || n.toB > 0.25)) t += ` Before that, ${[n.toAl > 0.25 && `alumina takes ${n.toAl.toFixed(1)} mol% of the modifier`, n.toB > 0.25 && `boron takes ${n.toB.toFixed(1)} mol% (${pct(n.N4)} of it four-coordinated)`].filter(Boolean).join(' and ')}, mending rather than breaking.`;
    if (n.q >= 0.005 && n.assumed > 0.05) t += ` ${pct(n.assumed)} of the breaking modifier is lime, magnesia or lead oxide, which the model has no fitted values for; it is counted as soda.`;
    t += far ? ` ${n.q < baseNet.q ? 'More bridges make a stiffer network' : 'Fewer bridges make a network that rearranges at lower temperature'}: this batch anneals at ${Math.round(n.Tf - 273.15)} °C against window glass's ${Math.round(baseNet.Tf - 273.15)} °C${n.q < baseNet.q && n.Tf < baseNet.Tf ? ', though here other oxides pull the other way' : n.q > baseNet.q && n.Tf > baseNet.Tf ? ', though here other oxides pull the other way' : ''}.` : ` This batch anneals at ${Math.round(n.Tf - 273.15)} °C, the temperature its network froze at.`;
    $('bNetRead').textContent = t;
  }
  function measuredText(nearV, nearA) {
    if (sgState === 'loading' || sgState === 'idle') return 'Fetching measured melts from SciGlass…';
    if (sgState === 'failed') return 'The measured melts from SciGlass did not load, so the models stand alone here.';
    if (!nearV.length) return 'SciGlass holds no measured viscosity for a melt of only these oxides within 3 mol% of this batch, so the curve has nothing beside it to check against.';
    const g = nearV[0], gaps = m.viscGaps(g, b.viscosity(m.molOf(g, sg.oxides))).filter((x) => Number.isFinite(x.gap));
    const abs = gaps.map((x) => Math.abs(x.gap)).sort((p, q) => p - q), worst = gaps.reduce((w, x) => (Math.abs(x.gap) > Math.abs(w.gap) ? x : w), gaps[0]);
    const median = abs[Math.floor(abs.length / 2)];
    let t = `The crosses are measured melts from SciGlass within 3 mol% of this batch, ${nearV.length === 6 ? 'the nearest six' : nearV.length === 1 ? 'one glass' : `${nearV.length} glasses`}. The heavy ones are ${m.cite(sg, g)}, ${g.d < 0.05 ? 'this batch itself' : `${g.d.toFixed(1)} mol% away`}. Run on that glass's own composition, the model misses its ${gaps.length === 1 ? 'one measured point' : `${gaps.length} measured points`} by ${gaps.length === 1 ? `${signed(worst.gap)} °C` : `${Math.round(median)} °C at the median and ${signed(worst.gap)} °C at worst, at 10${sup(worst.L)} Pa·s`}.`;
    if (nearA.length) {
      const a = nearA[0], o = b.optics(m.molOf(a, sg.oxides));
      t += ` On the index plot the nearest measured glass is ${m.cite(sg, a)}: n = ${a.nd.toFixed(3)} measured against ${o.nd.toFixed(3)} from the model, Abbe number ${Math.round(a.vd)} against ${Math.round(o.vd)}.`;
    }
    return t;
  }
  const SUP = { '-': '⁻', '.': '·', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = (L) => String(L).split('').map((c) => SUP[c] ?? c).join('');

  iron.addEventListener('input', render); onLamp(render);
  render();
}
