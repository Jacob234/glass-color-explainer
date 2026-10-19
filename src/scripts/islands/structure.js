// structure.js — the Structure Lab island: 400 atoms on the table, melted, then cooled at a rate
// the reader chooses. Atoms that sit in an ordered hexagonal patch are inked solid; the rest are
// drawn open. Beside them, volume or energy against temperature traced as the run cools (earlier
// runs stay as ghosts), and the pair distribution g(r). Physics lives in ../md.js.
import * as md from '../md.js';

const T_HI = 1.4, T_LO = 0.1;
const MELT_STEPS = 3000; // 15 τ at T_HI is enough to forget any crystal
const DASH = ['', '6 4', '2 3', '8 3 2 3']; // one line style per remembered run
// Argon in Lennard-Jones units, for scale only (textbook values): ε/k ≈ 120 K, σ ≈ 0.34 nm, τ ≈ 2.2 ps.
const ARGON = { K: 120, ps: 2.15 };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};
const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
const sup = (n) => String(n).replace(/[-0-9]/g, (c) => (c === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]));
const pow10 = (v) => { const e = Math.floor(Math.log10(v)), m = v / 10 ** e; return `${m.toFixed(1)} × 10${sup(e)}`; };

export function initStructureSim(root) {
  const $ = (sel) => root.querySelector(sel);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const plot = $('.ss-plot'), rdfSvg = $('.ss-rdf');
  const mis = $('[name=mismatch]'), rate = $('[name=rate]');
  const coolBtn = $('[name=cool]'), meltBtn = $('[name=melt]');
  const qtyBox = $('.ss-qty'), meters = $('.ss-meters'), read = $('.ss-read'), runs = $('.ss-runs');

  let sys, phase, steps, run, pending = false, ghosts = [], liquidG = null, gAcc = [], ord = null, qty = 'volume';
  let acc = { t: 0, a: 0, h: 0, n: 0 };
  const rateOf = () => 10 ** rate.valueAsNumber;
  const misOf = () => mis.valueAsNumber / 100;

  function build() {
    sys = md.createSystem({ pairs: md.mismatch(misOf()), T: T_HI, seed: 3 });
    ghosts = []; liquidG = null; melt();
  }
  function melt() {
    sys.T = T_HI; phase = 'melting'; steps = 0; run = null; gAcc = []; pending = false;
  }
  // Cooling always starts from the melt: from anything else, melt first and cool when molten.
  function cool() {
    if (phase !== 'liquid') { if (phase !== 'melting') melt(); pending = true; return; }
    run = { rate: rateOf(), pts: [], every: Math.max(5, Math.round((T_HI - T_LO) / (rateOf() * md.DT) / 150)) };
    phase = 'cooling'; steps = 0; acc = { t: 0, a: 0, h: 0, n: 0 };
  }
  // Enthalpy per atom, H = U + K + P·A: the energy the bath must take away to cool the system.
  const enthalpy = () => (sys.U + (sys.n - 1) * md.kineticT(sys) + sys.P * sys.L * sys.L) / sys.n;

  /* ---------- the table ---------- */
  function draw() {
    const w = canvas.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr); }
    const k = canvas.width / sys.L, R = [0.5, 0.5 * (1 + misOf())].map((r) => r * 0.94 * k);
    ctx.fillStyle = '#fafaf8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = '#141414';
    const W = canvas.width;
    const disk = (x, y, r, solid) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
      if (solid) { ctx.fillStyle = '#141414'; ctx.fill(); } else { ctx.fillStyle = '#fafaf8'; ctx.fill(); ctx.stroke(); }
    };
    for (let i = 0; i < sys.n; i++) {
      const x = sys.x[i] * k, y = sys.y[i] * k, r = R[sys.type[i]], solid = ord?.crystal[i];
      // periodic box: an atom over an edge is drawn on both sides
      for (const dx of x < r ? [0, W] : x > W - r ? [0, -W] : [0])
        for (const dy of y < r ? [0, W] : y > W - r ? [0, -W] : [0]) disk(x + dx, y + dy, r, solid);
    }
  }

  /* ---------- volume or energy against temperature ---------- */
  const PW = 640, PH = 300, PL = 58, PR = 16, PT = 22, PB = 40;
  const T0 = 0, T1 = T_HI;
  const sx = (T) => PL + ((T - T0) / (T1 - T0)) * (PW - PL - PR);
  function renderPlot() {
    const key = qty === 'volume' ? 1 : 2;
    const all = [...ghosts, ...(run ? [run] : [])].flatMap((r) => r.pts.map((p) => p[key]));
    let y0 = Math.min(...all), y1 = Math.max(...all);
    if (!all.length) { y0 = qty === 'volume' ? 1.2 : -1; y1 = y0 + 0.4; }
    const pad = (y1 - y0) * 0.08 || 0.05; y0 -= pad; y1 += pad;
    const sy = (v) => PH - PB - ((v - y0) / (y1 - y0)) * (PH - PT - PB);
    const g = [svgEl('line', { x1: PL, y1: PH - PB, x2: PW - PR, y2: PH - PB, class: 'ax' }), svgEl('line', { x1: PL, y1: PT, x2: PL, y2: PH - PB, class: 'ax' })];
    for (let T = 0; T <= 1.4001; T += 0.2) g.push(svgEl('line', { x1: sx(T), x2: sx(T), y1: PH - PB, y2: PH - PB + 5, class: 'ax' }), svgEl('text', { x: sx(T), y: PH - PB + 18, class: 'tk', 'text-anchor': 'middle' }, T.toFixed(1)));
    g.push(svgEl('text', { x: PW - PR, y: PH - PB - 8, class: 'lb', 'text-anchor': 'end' }, 'temperature, ε/k →'));
    g.push(svgEl('text', { x: 6, y: 14, class: 'lb' }, qty === 'volume' ? 'area per atom, σ²' : 'enthalpy per atom, ε'));
    const span = y1 - y0, stepY = 10 ** Math.floor(Math.log10(span / 3)) * ([1, 2, 5].find((m) => span / (10 ** Math.floor(Math.log10(span / 3)) * m) <= 6) ?? 10);
    for (let v = Math.ceil(y0 / stepY) * stepY; v <= y1; v += stepY) g.push(svgEl('line', { x1: PL - 5, x2: PL, y1: sy(v), y2: sy(v), class: 'ax' }), svgEl('text', { x: PL - 8, y: sy(v) + 4, class: 'tk', 'text-anchor': 'end' }, v.toFixed(stepY < 0.1 ? 2 : 1)));
    ghosts.forEach((r, i) => {
      if (r.pts.length < 2) return;
      g.push(svgEl('path', { d: pathOf(r.pts.map((p) => [sx(p[0]), sy(p[key])])), class: 'ghost', 'stroke-dasharray': DASH[i] }));
    });
    if (run?.pts.length > 1) g.push(svgEl('path', { d: pathOf(run.pts.map((p) => [sx(p[0]), sy(p[key])])), class: 'live' }));
    const now = qty === 'volume' ? md.areaPerAtom(sys) : enthalpy();
    if (phase !== 'melting') g.push(svgEl('circle', { cx: sx(Math.min(T1, md.kineticT(sys))), cy: sy(Math.max(y0, Math.min(y1, now))), r: 5, class: 'dot' }));
    plot.replaceChildren(...g);
    runs.replaceChildren(...ghosts.map((r, i) => {
      const li = document.createElement('li'), key = svgEl('svg', { viewBox: '0 0 28 8', width: 28, height: 8, 'aria-hidden': 'true' });
      key.append(svgEl('line', { x1: 0, x2: 28, y1: 4, y2: 4, stroke: '#8d908a', 'stroke-width': 1.4, 'stroke-dasharray': DASH[i] }));
      li.append(key, r.label);
      return li;
    }));
  }

  /* ---------- g(r) ---------- */
  const GW = 640, GH = 220, GL = 40, GR = 16, GT = 34, GB = 34, RMAX = 4;
  function renderRdf() {
    if (!gAcc.length) return;
    const n = gAcc.length, g = gAcc[0].g.map((_, b) => gAcc.reduce((a, s) => a + s.g[b], 0) / n), r = gAcc[0].r;
    const ymax = Math.max(4, Math.ceil(Math.max(...g)));
    const sx2 = (v) => GL + (v / RMAX) * (GW - GL - GR), sy2 = (v) => GH - GB - (v / ymax) * (GH - GT - GB);
    const e = [svgEl('line', { x1: GL, y1: GH - GB, x2: GW - GR, y2: GH - GB, class: 'ax' }), svgEl('line', { x1: GL, y1: GT, x2: GL, y2: GH - GB, class: 'ax' })];
    for (let v = 0; v <= RMAX; v++) e.push(svgEl('text', { x: sx2(v), y: GH - GB + 18, class: 'tk', 'text-anchor': 'middle' }, String(v)));
    for (let v = 0; v <= ymax; v += ymax > 6 ? 2 : 1) e.push(svgEl('text', { x: GL - 8, y: sy2(v) + 4, class: 'tk', 'text-anchor': 'end' }, String(v)));
    e.push(svgEl('line', { x1: GL, x2: GW - GR, y1: sy2(1), y2: sy2(1), class: 'ax faint' }));
    e.push(svgEl('text', { x: GW - GR, y: GH - GB - 8, class: 'lb', 'text-anchor': 'end' }, 'distance, σ →'));
    e.push(svgEl('text', { x: 6, y: 14, class: 'lb' }, 'g(r): neighbours at each distance, against a gas'));
    if (liquidG) e.push(svgEl('path', { d: pathOf(liquidG.r.map((v, b) => [sx2(v), sy2(Math.min(ymax, liquidG.g[b]))])), class: 'ghost' }));
    e.push(svgEl('path', { d: pathOf(r.map((v, b) => [sx2(v), sy2(Math.min(ymax, g[b]))])), class: 'live' }));
    rdfSvg.replaceChildren(...e);
  }

  /* ---------- readouts ---------- */
  function readouts() {
    const T = md.kineticT(sys), cf = ord ? ord.fraction : 0;
    const rows = [
      ['temperature', `${T.toFixed(2)} ε/k  ·  ${Math.round(T * ARGON.K)} K as argon`],
      ['area per atom', `${md.areaPerAtom(sys).toFixed(3)} σ²`],
      ['in ordered patches', `${Math.round(cf * 100)}%`],
      ['simulated time', `${Math.round(sys.t)} τ  ·  ${(sys.t * ARGON.ps / 1000).toFixed(2)} ns as argon`],
    ];
    meters.replaceChildren(...rows.map(([dt, dd]) => { const d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>'; d.firstChild.textContent = dt; d.lastChild.textContent = dd; return d; }));
    const m = Math.round(misOf() * 100);
    read.textContent = phase === 'melting' && pending ? 'Melting first, so every run starts from the same liquid; cooling starts when it is molten.'
      : phase === 'melting' ? 'Melting: the atoms diffuse, and any order from the last run is being lost.'
      : phase === 'liquid' ? `A liquid at ${T_HI} ε/k. Choose a cooling rate and press cool.`
      : phase === 'cooling' ? (cf > 0.25 ? 'Ordered patches are growing: the liquid is crystallising as it cools.' : T > 0.6 ? 'Cooling. The atoms still swap places freely; watch for solid patches to appear.' : 'The atoms have almost stopped swapping places. Whatever order exists now is being frozen in.')
      : cf > 0.75 ? `A crystal, with ${m === 0 ? 'every atom alike' : 'both sizes'} packed into hexagonal order. Melt it and quench, then compare the curves.`
      : cf > 0.35 ? 'Part crystal, part glass: ordered grains separated by disordered seams. A slower cool usually gives bigger grains.'
      : 'A glass: the atoms are as disordered as in the liquid, but they no longer move. Compare its g(r) with the faint liquid curve.';
    coolBtn.disabled = phase === 'cooling' || pending;
    $('.ss-rate').textContent = `${rateOf() >= 0.1 ? rateOf().toFixed(1) : rateOf().toFixed(3)} ε/k per τ  ·  about ${pow10(rateOf() * ARGON.K / (ARGON.ps * 1e-12))} K/s as argon`;
    $('.ss-mis').textContent = `${Math.round(misOf() * 100)}%`;
  }

  /* ---------- the loop ---------- */
  let frame = 0, visible = true;
  function tick() {
    if (visible && !document.hidden) {
      const t0 = performance.now();
      let done = 0;
      const budget = phase === 'frozen' ? 40 : 600;
      while (done < budget && performance.now() - t0 < 9) {
        const k = Math.min(10, budget - done);
        if (phase === 'cooling') {
          md.cool(sys, run.rate, T_LO, k);
          // plotted against the atoms' own temperature, which lags the bath's on a fast cool
          acc.t += md.kineticT(sys) * k; acc.a += md.areaPerAtom(sys) * k; acc.h += enthalpy() * k; acc.n += k;
          if (acc.n >= run.every) { run.pts.push([acc.t / acc.n, acc.a / acc.n, acc.h / acc.n]); acc = { t: 0, a: 0, h: 0, n: 0 }; }
          if (sys.T <= T_LO) {
            steps += k;
            if (steps > 1000) finish();
          }
        } else {
          md.step(sys, k); steps += k;
          if (phase === 'melting' && steps > MELT_STEPS) { phase = 'liquid'; liquidG = md.rdf(sys, RMAX); if (pending) { pending = false; cool(); } }
        }
        done += k;
      }
      frame++;
      if (frame % 4 === 0) ord = md.order(sys);
      if (frame % 8 === 0) { gAcc.push(md.rdf(sys, RMAX)); if (gAcc.length > 6) gAcc.shift(); renderRdf(); }
      draw();
      if (frame % 6 === 0) { renderPlot(); readouts(); }
    }
    requestAnimationFrame(tick);
  }
  function finish() {
    ord = md.order(sys);
    const r = run.rate;
    run.label = `cooled at ${r >= 0.1 ? r.toFixed(1) : r.toFixed(3)} ε/k per τ: ${Math.round(ord.fraction * 100)}% in ordered patches`;
    ghosts.push(run); if (ghosts.length > 4) ghosts.shift();
    run = null; phase = 'frozen'; renderPlot(); readouts();
  }

  coolBtn.addEventListener('click', () => { cool(); readouts(); });
  meltBtn.addEventListener('click', () => { melt(); readouts(); });
  mis.addEventListener('change', build);
  mis.addEventListener('input', () => { $('.ss-mis').textContent = `${mis.value}%`; });
  rate.addEventListener('input', readouts);
  for (const b of qtyBox.querySelectorAll('button')) b.addEventListener('click', () => {
    qty = b.dataset.q; qtyBox.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b))); renderPlot();
  });
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }).observe(root);

  build(); readouts(); renderPlot();
  requestAnimationFrame(tick);
}
