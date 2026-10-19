import { test } from 'node:test';
import assert from 'node:assert/strict';
import vis from '../src/data/viscosity.json' with { type: 'json' };
import * as g from '../src/scripts/glass.js';

test('the Fulcher fit reproduces the temperatures Napolitano and Hawkins tabulate to within a few degrees', () => {
  // their table is in poise; tempAt takes Pa·s
  for (const [logP, T] of vis.fitted) assert.ok(Math.abs(g.tempAt(logP - 1) - T) < 4, `${logP}: ${g.tempAt(logP - 1)} vs ${T}`);
  for (const T of [600, 900, 1300]) assert.ok(Math.abs(g.tempAt(g.logEta(T)) - T) < 1e-9);
});

test('the fit lands near the measured softening and annealing points, and misses the strain point below its range', () => {
  const at = (id) => vis.points.find((p) => p.id === id);
  assert.ok(Math.abs(g.tempAt(at('softening').logPas) - at('softening').measured) < 5);
  assert.ok(Math.abs(g.tempAt(at('annealing').logPas) - at('annealing').measured) < 12);
  assert.ok(g.tempAt(at('strain').logPas) - at('strain').measured > 20, 'the page says the fit runs hot at the strain point');
  assert.equal(g.logEta(20), Infinity, 'below T0 the fit has no value');
});

test('the glass transition at 10 K/min sits near the annealing point and rises with cooling rate', () => {
  const tg = g.glassTransition(10 / 60).T;
  assert.ok(Math.abs(tg - 546) < 15, String(tg));
  let last = -Infinity;
  for (let lq = -4; lq <= 6; lq++) { const T = g.glassTransition(10 ** lq).T; assert.ok(T > last); last = T; }
});

test('the standard glass has about 0.73 non-bridging oxygens per tetrahedron', () => {
  const x = g.modifierFraction(g.STANDARD);
  assert.ok(Math.abs(g.nboPerT(x) - 0.73) < 0.01, String(g.nboPerT(x)));
  assert.equal(g.nboPerT(0), 0);
});

test('bond switching keeps every atom three-bonded and leaves no ring smaller than five', () => {
  const base = g.honeycomb(30, 14), net = g.disorder(base, { fraction: 0.55, seed: 11 });
  assert.equal(net.bonds.length, base.bonds.length);
  const deg = (n) => { const d = n.nodes.map(() => 0); for (const [a, b] of n.bonds) { d[a]++; d[b]++; } return d; };
  assert.deepEqual(deg(net), deg(base));
  assert.ok(net.switches > 20, `only ${net.switches} switches`);
  const rings = g.ringSizes(net).filter((r) => r != null);
  assert.ok(Math.min(...rings) >= 5);
  assert.ok(rings.some((r) => r !== 6), 'the glass is not still a honeycomb');
  assert.ok(g.ringSizes(base).every((r) => r == null || r === 6), 'the crystal has only six-rings');
});
