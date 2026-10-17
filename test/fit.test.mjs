import { test } from 'node:test';
import assert from 'node:assert/strict';
import optics from '../src/data/optics.json' with { type: 'json' };
import * as f from '../src/scripts/fit.js';

const fitter = f.makeFitter(optics);
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('CIEDE2000 matches the Sharma, Wu & Dalal test pairs', () => {
  // Pairs 1, 7 and 17 of the published 34-pair test set.
  near(f.deltaE00([50, 2.6772, -79.7751], [50, 0, -82.7485]), 2.0425, 1e-4);
  near(f.deltaE00([50, 0, 0], [50, -1, 2]), 2.3669, 1e-4);
  near(f.deltaE00([50, 2.5, 0], [73, 25, -18]), 27.1492, 1e-4);
  assert.equal(f.deltaE00([40, 10, -5], [40, 10, -5]), 0);
});

test('hex and Lab conversions: white is L 100, black is L 0, round trips survive', () => {
  near(f.hexToLab('#ffffff')[0], 100, 1e-3);
  near(f.hexToLab('#000000')[0], 0, 1e-9);
  for (const hex of ['#2c60ab', '#ef5db6', '#008484']) assert.equal(f.linToHex(f.hexToLin(hex)), hex);
});

test('the fast forward model agrees with spectra.js under both lamps', () => {
  const parts = [['cobalt', 0.6], ['chromium', 1]];
  for (const [lamp, illum] of [['day', 'daylight'], ['lamp', 'incandescent']]) {
    const a = fitter.lin(parts, lamp), b = f.referenceLin(optics, parts, illum);
    for (let k = 0; k < 3; k++) near(a[k], b[k], 1e-9);
  }
});

test('a single-colorant glass is recovered with its amount', () => {
  const hex = f.linToHex(f.referenceLin(optics, [['gold-colloid', 1.1]]));
  const { best } = fitter.fit(hex);
  assert.deepEqual(best.parts.map(([id]) => id), ['gold-colloid']);
  near(best.parts[0][1], 1.1, 0.05);
  assert.ok(best.dE < 0.5);
});

test('a two-colorant glass is matched, and it is not the only match', () => {
  const hex = f.linToHex(f.referenceLin(optics, [['cobalt', 0.6], ['chromium', 1]]));
  const r = fitter.fit(hex);
  assert.ok(r.best.dE <= f.MATCH);
  assert.ok(r.matches > 1, 'one colour should admit several recipes');
  assert.ok(r.alternatives.length > 0);
  for (const a of r.alternatives) {
    assert.ok(a.dE <= f.MATCH);
    assert.notDeepEqual(a.parts.map(([id]) => id).sort(), r.best.parts.map(([id]) => id).sort());
  }
  // Ranked by how far they part company under the second lamp.
  for (let i = 1; i < r.alternatives.length; i++) assert.ok(r.alternatives[i - 1].split >= r.alternatives[i].split);
});

test('the headline recipe is the simplest match', () => {
  const r = fitter.fit(f.linToHex(f.referenceLin(optics, [['cobalt', 0.5]])));
  assert.equal(r.best.parts.length, 1);
  assert.ok(r.best.dE <= f.MATCH);
});

test('a fit restricted to the label uses only the label, within the concentration bounds', () => {
  const { best } = fitter.fit('#2c60ab', { only: ['cobalt'] });
  assert.deepEqual(best.parts.map(([id]) => id), ['cobalt']);
  assert.ok(best.parts[0][1] >= f.C_MIN && best.parts[0][1] <= f.C_MAX);
});
