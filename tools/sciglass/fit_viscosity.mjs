// Fit the bench's alumina–magnesia correction to Fluegel's isokoms on SciGlass melts (JBK-1011).
//
// Fluegel (2007) carries an Al2O3×MgO term only at 10^1.5 Pa·s. Run on SciGlass melts holding
// 5–10 mol% alumina, his model is ~20 °C too cold at the median, and the misses gather in
// magnesia-rich sodium aluminosilicates, mostly cover-glass patents from after his data. This adds
// c·Al2O3·MgO (mol%) to each of the three isokoms and fits the three c to every measured point
// from 10^1 to 10^12 Pa·s of melts with alumina, short of charge balance (Al2O3 < 0.9·(Na2O + K2O)),
// through the same Fulcher curve the page draws. Huber loss (40 °C), Nelder–Mead.
// Held-out errors come from five folds split by source.
//
//     node tools/sciglass/fit_viscosity.mjs
//
// Reads public/data/sciglass/bench.json (ODbL 1.0) and prints the JSON for batch.json's
// viscosity.correction.terms.
import fs from 'node:fs';
import * as b from '../../src/scripts/batch.js';

const d = JSON.parse(fs.readFileSync(new URL('../../public/data/sciglass/bench.json', import.meta.url)));
const TERM = 'Al2O3*MgO', x = (m) => m.Al2O3 * m.MgO;
const R2O = (m) => m.Na2O + m.K2O;
const G = [];
for (const g of d.glasses) {
  const pts = (g.visc ?? []).filter(([L]) => L >= 1 && L <= 12);
  if (!pts.length) continue;
  const mol = Object.fromEntries(d.oxides.map((k, i) => [k, g.mol[i]]));
  G.push({ mol, src: g.src, pts, iso: b.LEVELS.map((L) => b.fluegelIsokom(mol, L)) });
}
const curve = (g, c) => b.fulcher(b.LEVELS.map((L, i) => [L, g.iso[i] + c[i] * x(g.mol)]));
const misses = (gs, c) => gs.flatMap((g) => { const v = curve(g, c); return g.pts.map(([L, T]) => ({ g, r: v.tempAt(L) - T })); });
const huber = (r, k = 40) => (!Number.isFinite(r) ? 1e4 : Math.abs(r) <= k ? (r * r) / 2 : k * (Math.abs(r) - k / 2));
const loss = (gs, c) => misses(gs, c).reduce((s, e) => s + huber(e.r), 0);

function nelderMead(f, x0, step = 0.5, iters = 300) {
  let S = [x0, ...x0.map((_, i) => x0.map((v, j) => v + (i === j ? step : 0)))].map((p) => [p, f(p)]);
  const n = x0.length;
  for (let k = 0; k < iters; k++) {
    S.sort((a, b) => a[1] - b[1]);
    const c = x0.map((_, j) => S.slice(0, n).reduce((s, p) => s + p[0][j], 0) / n), w = S[n][0];
    const at = (t) => c.map((v, j) => v + t * (v - w[j]));
    const r = at(1), fr = f(r);
    if (fr < S[0][1]) { const e = at(2), fe = f(e); S[n] = fe < fr ? [e, fe] : [r, fr]; }
    else if (fr < S[n - 1][1]) S[n] = [r, fr];
    else {
      const ct = at(-0.5), fc = f(ct);
      if (fc < S[n][1]) S[n] = [ct, fc];
      else S = S.map((p, i) => { if (!i) return p; const q = p[0].map((v, j) => S[0][0][j] + 0.5 * (v - S[0][0][j])); return [q, f(q)]; });
    }
  }
  return S.sort((a, b) => a[1] - b[1])[0][0];
}

const train = (gs) => gs.filter((g) => g.mol.Al2O3 > 0.3 && g.mol.Al2O3 < 0.9 * R2O(g.mol));
const fold = (g) => ((g.src * 2654435761) % 4294967296) % 5;
const c = nelderMead((c) => loss(train(G), c), [0, 0, 0]);
const held = [];
for (let k = 0; k < 5; k++) {
  const ck = nelderMead((q) => loss(train(G.filter((g) => fold(g) !== k)), q), c, 0.2, 150);
  held.push(...misses(G.filter((g) => fold(g) === k), ck));
}
const before = misses(G, [0, 0, 0]);
const median = (a) => { const s = a.filter(Number.isFinite).sort((p, q) => p - q); return s[s.length >> 1]; };
const CLASSES = {
  'soda-lime': (m) => m.Al2O3 < 2 && m.B2O3 < 0.1 && m.PbO < 0.1 && m.CaO > 3,
  '2–5 mol% alumina': (m) => m.Al2O3 >= 2 && m.Al2O3 < 5,
  '5–10 mol% alumina': (m) => m.Al2O3 >= 5,
  '5–10, short of balance': (m) => m.Al2O3 >= 5 && m.Al2O3 < 0.9 * R2O(m),
  'alumina + ≥4 mol% MgO': (m) => m.Al2O3 >= 2 && m.MgO >= 4,
  borosilicate: (m) => m.B2O3 >= 5,
  lead: (m) => m.PbO >= 5,
  all: () => true,
};
console.log('class'.padEnd(26), 'points', ' Fluegel median, |median|', ' corrected (held out)');
for (const [k, f] of Object.entries(CLASSES)) {
  const a = before.filter((e) => f(e.g.mol)).map((e) => e.r), h = held.filter((e) => f(e.g.mol)).map((e) => e.r);
  console.log(k.padEnd(26), String(a.length).padStart(6), `${median(a).toFixed(1)}, ${median(a.map(Math.abs)).toFixed(1)}`.padStart(18), `${median(h).toFixed(1)}, ${median(h.map(Math.abs)).toFixed(1)}`.padStart(18));
}
const n = train(G);
console.log(`fitted on ${n.length} melts, ${n.reduce((s, g) => s + g.pts.length, 0)} points, ${new Set(n.map((g) => g.src)).size} sources`);
console.log(JSON.stringify(Object.fromEntries(b.LEVELS.map((L, i) => [L.toFixed(1), { [TERM]: Number(c[i].toFixed(4)) }]))));
