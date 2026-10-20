// stage-fragility.js — stage 02′, long and short glasses. Ink diagrams only; no glass color here.
// Curves are MYEGA (fragility.js) with parameters from ViscNet (public/data/viscnet.json) and from
// fits to measured SciGlass melts (public/data/sciglass/fragility.json); both are fetched on approach.
import * as f from './fragility.js';
import * as b from './batch.js';
import * as ms from './measured.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
function axes({ x0, x1, y0, y1, L = 62, R = 18, T = 30, B = 44, W = 640, H }) {
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  const frame = svgEl('g', { class: 'axis' });
  frame.append(svgEl('line', { x1: L, y1: H - B, x2: W - R, y2: H - B }), svgEl('line', { x1: L, y1: T, x2: L, y2: H - B }));
  const tickY = (y, label) => frame.append(svgEl('line', { x1: L - 5, x2: L, y1: sy(y), y2: sy(y) }), svgEl('text', { x: L - 9, y: sy(y) + 4, class: 'ax-t', 'text-anchor': 'end' }, label));
  const tickX = (x, label) => frame.append(svgEl('line', { x1: sx(x), x2: sx(x), y1: H - B, y2: H - B + 5 }), svgEl('text', { x: sx(x), y: H - B + 18, class: 'ax-t', 'text-anchor': 'middle' }, label));
  return { sx, sy, frame, tickX, tickY, box: { L, R, T, B, W, H } };
}
const cross = (x, y, r, cls) => svgEl('path', { d: `M${x - r} ${y - r}L${x + r} ${y + r}M${x - r} ${y + r}L${x + r} ${y - r}`, class: cls });
const r0 = (x) => Math.round(x);

// Glasses the chips offer, in the order of the strong-to-fragile story.
const ORDER = ['silica', 'boro', 'float', 'nbs710', 'container', 'lead', 'b2o3'];
const ABOUT = {
  silica: 'Fused silica, the strongest common glass: every silicon bonded to four others through oxygen, so flow means breaking Si–O bonds at much the same cost at every temperature.',
  boro: 'Borosilicate keeps most of silica\'s connected network; the little soda it has goes mostly to turning boron triangles into tetrahedra rather than to breaking bonds.',
  float: 'Window glass. Its soda, lime and magnesia leave about 0.8 non-bridging oxygens per silicon; a broken network rearranges more as it warms, and the curve bends.',
  nbs710: 'NBS 710, the soda-potash-lime standard whose measured curve stage 00 draws.',
  container: 'Bottle glass: more lime and a little alumina against window glass.',
  lead: 'Lead crystal. Lead oxide breaks the network and softens it at every temperature.',
  b2o3: 'Boron oxide alone: a network of flat BO₃ triangles, many joined in three-membered boroxol rings that break up as the liquid is heated. It is a pure network former and still more fragile than silica.',
};
const SWEEP_LABEL = { Na2O: 'soda', K2O: 'potash', CaO: 'lime', MgO: 'magnesia', Al2O3: 'alumina', B2O3: 'boric oxide', PbO: 'lead oxide' };

export function fragilityStage() {
  if (!$('fragility')) return;
  let net = null, frag = null, state = 'idle', pick = 'float', sweepOx = 'Na2O';

  /* 1. the Angell plot: log η against Tg/T */
  const as = $('fAngell'), AH = 400;
  const A = axes({ x0: 0, x1: 1, y0: -4, y1: 12.5, H: AH, R: 24 });
  A.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'log₁₀ viscosity, Pa·s'),
    svgEl('text', { x: A.box.W - A.box.R, y: AH - 8, class: 'ax-l', 'text-anchor': 'end' }, 'Tg / T: each glass scaled by its own Tg →'));
  for (let y = -4; y <= 12; y += 4) A.tickY(y, String(y));
  for (let x = 0; x <= 1.001; x += 0.2) A.tickX(x, x.toFixed(1));
  // The strong limit: under MYEGA with log η∞ fixed, a straight line from η∞ to 10¹² Pa·s at Tg.
  const strong = svgEl('g');
  strong.append(svgEl('path', { d: pathOf([[A.sx(0), A.sy(f.A_UNIVERSAL)], [A.sx(1), A.sy(12)]]), class: 'ln faint dash' }),
    svgEl('text', { x: A.sx(0.03), y: A.sy(10.5), class: 'lab faint' }, `dashed: straight line, m = ${f.strongest().toFixed(1)}`));
  const aOthers = svgEl('g'), aMeasured = svgEl('g'), aLive = svgEl('g');
  as.replaceChildren(A.frame, strong, aOthers, aMeasured, aLive);
  const angellPath = (p) => { const pts = []; for (let i = 0; i <= 100; i++) { const x = i / 100, L = f.angell(x, p); if (L >= -4 && L <= 12.5) pts.push([A.sx(x), A.sy(L)]); } return pathOf(pts); };

  /* chips */
  const chipBox = $('fGlasses');
  const chips = ORDER.map((id) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chip chip-plain'; btn.dataset.id = id;
    btn.addEventListener('click', () => { pick = id; render(); });
    chipBox.append(btn);
    return btn;
  });

  /* 2. what m does to the working range, at window glass's Tg */
  const ws = $('fWork'), WH = 340, WX0 = 450, WX1 = 1500;
  const W = axes({ x0: WX0, x1: WX1, y0: 0, y1: 13, H: WH, R: 24 });
  W.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'log₁₀ viscosity, Pa·s'));
  for (let y = 0; y <= 12; y += 3) W.tickY(y, String(y));
  for (let T = 600; T <= 1500; T += 300) W.tickX(T, `${T} °C`);
  const band = svgEl('g');
  for (const L of [f.WORKING, f.SOFTENING]) band.append(svgEl('line', { x1: W.box.L, x2: W.box.W - W.box.R, y1: W.sy(L), y2: W.sy(L), class: 'ln ghost' }));
  band.append(svgEl('text', { x: W.box.W - W.box.R, y: W.sy(f.WORKING) - 6, class: 'lab faint', 'text-anchor': 'end' }, 'working point, 10³'),
    svgEl('text', { x: W.box.W - W.box.R, y: W.sy(f.SOFTENING) - 6, class: 'lab faint', 'text-anchor': 'end' }, 'softening point, 10⁶·⁶'));
  const wLive = svgEl('g');
  ws.replaceChildren(W.frame, band, wLive);
  const mIn = $('fM'), mOut = $('fMOut');
  mIn.addEventListener('input', () => renderWork());

  /* 3. fragility as one oxide replaces silica in window glass */
  const ss = $('fSweep'), SH = 340;
  const S = axes({ x0: 0, x1: 30, y0: 10, y1: 60, H: SH, R: 24 });
  S.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'fragility m'),
    svgEl('text', { x: S.box.W - S.box.R, y: SH - 8, class: 'ax-l', 'text-anchor': 'end' }, 'mol% added in place of silica →'));
  for (let y = 10; y <= 60; y += 10) S.tickY(y, String(y));
  for (let x = 0; x <= 30; x += 10) S.tickX(x, String(x));
  const sLive = svgEl('g');
  ss.replaceChildren(S.frame, sLive);
  const sweepBox = $('fOxides');
  const sweepChips = Object.entries(SWEEP_LABEL).map(([ox, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chip chip-plain'; btn.dataset.id = ox; btn.textContent = label;
    btn.addEventListener('click', () => { sweepOx = ox; renderSweep(); });
    sweepBox.append(btn);
    return btn;
  });

  /* 4. ViscNet against the measured fits */
  const cs = $('fCompare'), CH = 400;
  const C = axes({ x0: 15, x1: 70, y0: 15, y1: 70, H: CH, W: 440, R: 18 });
  C.frame.append(svgEl('text', { x: 14, y: 18, class: 'ax-l' }, 'm from ViscNet'),
    svgEl('text', { x: C.box.W - C.box.R, y: CH - 8, class: 'ax-l', 'text-anchor': 'end' }, 'm fitted to the measured curve →'));
  for (let v = 20; v <= 70; v += 10) { C.tickY(v, String(v)); C.tickX(v, String(v)); }
  const cLive = svgEl('g');
  cs.replaceChildren(C.frame, svgEl('path', { d: pathOf([[C.sx(15), C.sy(15)], [C.sx(70), C.sy(70)]]), class: 'ln faint dash' }), cLive);

  /* data, fetched once the stage is near the screen */
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const load = () => {
    if (state !== 'idle') return;
    state = 'loading';
    const get = (p) => fetch(`${base}/data/${p}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
    Promise.all([get('viscnet.json'), get('sciglass/fragility.json')])
      .then(([n, g]) => { net = n; frag = g; state = 'ready'; renderAll(); })
      .catch(() => { state = 'failed'; renderAll(); });
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '600px' });
    io.observe($('fragility'));
  } else load();

  const named = (id) => net.named.find((n) => n.id === id);
  const P = (n) => ({ A: n.logEtaInf, Tg: n.Tg, m: n.m });
  const molOf = (n) => ms.molOf(n, net.oxides);

  function render() {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === pick)));
    if (state !== 'ready') {
      chips.forEach((c) => { c.textContent = c.dataset.id; });
      $('fRead').textContent = state === 'failed' ? 'The precomputed curves did not load, so this stage has nothing to draw.' : 'Fetching ViscNet predictions and measured melts…';
      return;
    }
    chips.forEach((c) => { c.textContent = named(c.dataset.id).label; });
    const n = named(pick), p = P(n);
    aOthers.replaceChildren(...ORDER.filter((id) => id !== pick).map((id) => svgEl('path', { d: angellPath(P(named(id))), class: 'ln faint' })));
    // Measured melts nearest this glass, each placed on the axis by its own fitted Tg.
    const near = ms.nearest(molOf(n), frag, { has: ['visc'] });
    aMeasured.replaceChildren(...near.toReversed().flatMap((g) => g.visc.map(([L, T]) => {
      const x = (g.fit.Tg + f.K) / (T + f.K);
      return cross(A.sx(x), A.sy(L), g === near[0] ? 5 : 3.5, g === near[0] ? 'x' : 'x faint');
    })));
    aLive.replaceChildren(svgEl('path', { d: angellPath(p), class: 'ln bold' }),
      svgEl('circle', { cx: A.sx(1), cy: A.sy(12), r: 4, class: 'dot' }),
      svgEl('text', { x: A.sx(0.97), y: A.sy(-2.6), class: 'lab', 'text-anchor': 'end' }, `bold: ${n.label}, m = ${r0(p.m)}`));

    const fits = near.map((g) => g.fit.m), wr = f.workingRange(p);
    let t = `${ABOUT[pick]} ViscNet puts its glass transition at ${r0(p.Tg)} °C and its fragility at m = ${r0(p.m)} (the network's own 95% spread is ${r0(n.mBand[0])} to ${r0(n.mBand[1])}); on that curve it takes ${r0(wr)} °C to cool from the working point to the softening point.`;
    t += near.length
      ? ` The crosses are the ${near.length === 1 ? 'one measured melt' : `${near.length} measured melts`} in SciGlass within 3 mol% of it, each placed by its own fitted Tg; fitted, they give m = ${near.length === 1 ? r0(fits[0]) : `${r0(Math.min(...fits))} to ${r0(Math.max(...fits))}`}.`
      : ' SciGlass holds no melt within 3 mol% of it with a curve long enough to fit.';
    const tgFit = f.median(near.map((g) => g.fit.Tg));
    if (near.length && Math.abs(tgFit - p.Tg) > 100) t += ` Here ViscNet fails: the measured melts put Tg at ${r0(tgFit)} °C, ${r0(Math.abs(tgFit - p.Tg))} °C from its prediction. A pure oxide sits at the edge of the compositions it learned from, and the Angell plot hides the miss because it divides Tg out.`;
    // The bench's own model gives a fragility too: the slope of its Fulcher curve at 10¹² Pa·s.
    if (b.PRESET[pick]) { const fl = f.fulcherFragility(b.viscosity(b.PRESET[pick].mol)); t += ` The stage 01 bench's Fulcher curve, a different model, gives m = ${r0(fl.m)}.`; }
    $('fRead').textContent = t;
  }

  function renderWork() {
    const m = mIn.valueAsNumber, Tg = state === 'ready' ? named('float').Tg : 550;
    const p = { A: f.A_UNIVERSAL, Tg, m };
    mOut.textContent = `m = ${m}`;
    const pts = []; for (let i = 0; i <= 160; i++) { const L = 13 * (i / 160), T = f.tempAt(L, p); if (T >= WX0 && T <= WX1) pts.push([W.sx(T), W.sy(L)]); }
    const tw = f.tempAt(f.WORKING, p), tsft = f.tempAt(f.SOFTENING, p), y = W.sy(1.2);
    const items = [svgEl('path', { d: pathOf(pts), class: 'ln bold' })];
    if (tw <= WX1) items.push(svgEl('line', { x1: W.sx(tsft), x2: W.sx(tw), y1: y, y2: y, class: 'ln bold' }),
      svgEl('line', { x1: W.sx(tsft), x2: W.sx(tsft), y1: W.sy(f.SOFTENING), y2: y, class: 'ln ghost' }),
      svgEl('line', { x1: W.sx(tw), x2: W.sx(tw), y1: W.sy(f.WORKING), y2: y, class: 'ln ghost' }),
      svgEl('text', { x: (W.sx(tsft) + W.sx(tw)) / 2, y: y - 8, class: 'lab', 'text-anchor': 'middle' }, `${r0(tw - tsft)} °C to work it`));
    wLive.replaceChildren(...items);
    const s = f.workingRange({ ...p, m: f.strongest() + 0.01 });
    $('fWorkRead').textContent = `Every curve here passes through 10¹² Pa·s at ${r0(Tg)} °C, window glass's Tg from ViscNet, and shares the high-temperature limit 10⁻²·⁹³ Pa·s; only m changes. At m = ${m} the glass takes ${r0(tw - tsft)} °C to go from the working point to the softening point, against ${r0(s)} °C for the strongest curve MYEGA allows at the same Tg. A fragile glass of the same Tg stays runny longer as it cools, then sets over a short span: a short glass.`;
  }

  function renderSweep() {
    sweepChips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === sweepOx)));
    if (state !== 'ready') { sLive.replaceChildren(); $('fSweepRead').textContent = ''; return; }
    const items = [];
    for (const [ox, rows] of Object.entries(net.sweeps)) {
      if (ox === sweepOx) continue;
      items.push(svgEl('path', { d: pathOf(rows.map(([x, m]) => [S.sx(x), S.sy(m)])), class: 'ln faint' }));
    }
    const rows = net.sweeps[sweepOx];
    // The network's spread as a thin outline, then its curve, then the bench's Fulcher model.
    items.push(svgEl('path', { d: pathOf([...rows.map((r) => [S.sx(r[0]), S.sy(r[4])]), ...rows.toReversed().map((r) => [S.sx(r[0]), S.sy(r[5])])]) + 'Z', class: 'spread' }),
      svgEl('path', { d: pathOf(rows.map(([x, m]) => [S.sx(x), S.sy(m)])), class: 'ln bold' }));
    const fl = rows.map(([x]) => {
      const c = { ...b.BASE.mol }; c[sweepOx] = (c[sweepOx] ?? 0) + x; c.SiO2 -= x;
      const inside = c.SiO2 >= 43 && (c.B2O3 ?? 0) <= 17 && (c.Al2O3 ?? 0) <= 10;
      return [x, f.fulcherFragility(b.viscosity(c)).m, inside];
    }).filter(([, m]) => m >= 10 && m <= 60);
    const flIn = fl.filter((r) => r[2]);
    if (flIn.length) items.push(svgEl('path', { d: pathOf(flIn.map(([x, m]) => [S.sx(x), S.sy(m)])), class: 'ln dash' }));
    const end = rows[rows.length - 1];
    items.push(svgEl('text', { x: S.sx(end[0]) - 4, y: S.sy(end[1]) - 10, class: 'lab', 'text-anchor': 'end' }, `ViscNet, ${SWEEP_LABEL[sweepOx]}`));
    if (flIn.length) { const e = flIn[flIn.length - 1]; items.push(svgEl('text', { x: S.sx(e[0]) - 4, y: S.sy(e[1]) + 18, class: 'lab', 'text-anchor': 'end' }, 'Fluegel (bench), dashed')); }
    sLive.replaceChildren(...items);
    const m0 = rows[0][1], m1 = end[1], f0 = fl[0]?.[1], fe = flIn[flIn.length - 1];
    $('fSweepRead').textContent = `Adding ${end[0]} mol% ${SWEEP_LABEL[sweepOx]} to window glass in place of silica takes ViscNet's m from ${r0(m0)} to ${r0(m1)}.` +
      (fe ? ` The bench's Fluegel model, read as a Fulcher curve, goes from ${r0(f0)} to ${r0(fe[1])} over ${fe[0] === end[0] ? 'the same range' : `the first ${fe[0]} mol%, where it stays inside the glasses it was fitted to`}.` : '') +
      ' Where the two lines part, the models disagree, and neither is a measurement.';
  }

  function renderCompare() {
    if (state !== 'ready') { cLive.replaceChildren(); $('fCompareRead').textContent = ''; return; }
    const { pairs, medianMiss, bias, curveMiss } = f.compare(frag, net);
    cLive.replaceChildren(...pairs.filter((q) => q.fit <= 70 && q.net <= 70 && q.fit >= 15 && q.net >= 15).map((q) => svgEl('circle', { cx: C.sx(q.fit), cy: C.sy(q.net), r: 1.8, class: 'speck' })));
    $('fCompareRead').textContent = `Each point is one of the ${pairs.length} measured melts: its fitted m across, ViscNet's down. On the dashed line they agree. The median gap is ${medianMiss.toFixed(1)}, and ViscNet runs ${bias >= 0 ? 'high' : 'low'} by ${Math.abs(bias).toFixed(1)} at the median. The two are not quite like for like: the fits hold η∞ at 10⁻²·⁹³ Pa·s, while ViscNet sets its own, mostly lower. Read on viscosity itself, ViscNet's curves miss the measured points by ${curveMiss.toFixed(2)} decades at the median. This is not an independent test: ViscNet was trained on SciGlass, so many of these melts were in its training set.`;
  }

  function renderAll() { render(); renderWork(); renderSweep(); renderCompare(); }
  renderAll();
}
