// tools/qn/validate.mjs — the numbers the Qⁿ model's write-ups quote: root-mean-square miss, in
// percentage points, of each model against the Maekawa et al. NMR in src/data/qn.json, with the
// fictive temperature from the bench's viscosity model and, for sensitivity, held at 800 K.
//   node tools/qn/validate.mjs
import * as qn from '../../src/scripts/qn.js';
import * as b from '../../src/scripts/batch.js';

const miss = (ox, Q) => {
  let se = 0, n = 0;
  for (const [x, ...pct] of qn.NMR[ox]) {
    const got = Q(x, (2 * x) / (100 - x));
    for (let i = 0; i < 5; i++) { se += (100 * got[i] - pct[i]) ** 2; n++; }
  }
  return Math.sqrt(se / n).toFixed(1);
};
for (const ox of ['Na2O', 'K2O']) {
  const m = ox === 'K2O' ? 'K' : 'Na', tg = (x) => b.isokom({ SiO2: 100 - x, [ox]: x }, 12) + 273.15;
  console.log(ox, {
    statmech_benchTg: miss(ox, (x, q) => qn.speciate(q, { [m]: 1 }, tg(x))),
    statmech_800K: miss(ox, (x, q) => qn.speciate(q, { [m]: 1 }, 800)),
    random: miss(ox, (x, q) => qn.random(q)),
    binary: miss(ox, (x, q) => qn.binary(q)),
    tg_at_20: Math.round(tg(20) - 273.15), tg_at_50: Math.round(tg(50) - 273.15),
  });
}
for (const p of b.PRESETS) {
  const n = qn.batchNetwork(p.mol);
  console.log(p.id, { nboPerSi: +n.q.toFixed(2), TgC: Math.round(n.Tf - 273.15), Q: n.Q.map((v) => +(100 * v).toFixed(1)), N4: n.N4 && +n.N4.toFixed(2), assumedAsSoda: +n.assumed.toFixed(2) });
}
