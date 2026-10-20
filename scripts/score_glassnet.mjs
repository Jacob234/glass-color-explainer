// Scores GlassNet (public/data/glassnet.json) and the bench's own models against the measured SciGlass
// melts in public/data/sciglass/bench.json, split by whether GlassNet saw each melt in training.
// Prints the numbers quoted in the bench's "How this was computed" note and in methods/JBK-1021.md.
//   node scripts/score_glassnet.mjs
import { readFileSync } from 'node:fs';
import * as b from '../src/scripts/batch.js';
import * as gn from '../src/scripts/glassnet.js';
import * as m from '../src/scripts/measured.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));
const sg = read('sciglass/bench.json'), net = read('glassnet.json');
const models = (g) => {
  const mol = m.molOf(g, sg.oxides);
  return { tempAt: b.viscosity(mol).tempAt, nd: b.properties(mol).nd };
};
const fmt = (s) => `viscosity n=${s.visc.n} GlassNet ${s.visc.glassnet} °C, bench ${Math.round(s.visc.bench)} °C | ` +
  `liquidus n=${s.liq.n} GlassNet ${s.liq.glassnet} °C (median signed ${s.liq.bias}) | ` +
  `nd n=${s.nd.n} GlassNet ${s.nd.glassnet?.toFixed(4)}, bench ${s.nd.bench?.toFixed(4)}`;
console.log('splits', net.model.splits);
for (const [name, only] of [['all', null], ['training set', ['t']], ['holdout', ['h']], ['neither', ['n']], ['holdout + neither', ['h', 'n']]])
  console.log(name.padEnd(18), fmt(gn.score(sg, net, models, { only })));
