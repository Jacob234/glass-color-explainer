import { test } from 'node:test';
import assert from 'node:assert/strict';
import optics from '../src/data/optics.json' with { type: 'json' };
import { GRID, colorantDensity, transmission } from '../src/scripts/spectra.js';
import { LAMPS, LAMP, underLamp } from '../src/scripts/lamps.js';
import { EYES, EYE, cones, lensDensity, mediaTransmission, seenBy, dichromat } from '../src/scripts/observers.js';
import { linToLab, deltaE00 } from '../src/scripts/fit.js';

const ones = GRID.map(() => 1);
const dens = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
const glass = (id, c = 1) => transmission([[dens[id], c]]);
const dE = (a, b) => deltaE00(linToLab(a.lin), linToLab(b.lin));
const peakAt = (curve) => GRID[curve.indexOf(Math.max(...curve))];

test('the page’s eye here is the page’s eye everywhere else, under every lamp', () => {
  for (const lamp of LAMPS.filter((l) => !l.dark)) {
    for (const id of ['cobalt', 'neodymium', 'gold-colloid', 'chromium']) {
      assert.ok(dE(underLamp(glass(id), lamp), seenBy(glass(id), lamp, EYE.standard)) < 0.05, `${id} under ${lamp.id}`);
    }
  }
});

test('CIE 2006 cone fundamentals peak where Stockman & Sharpe put them', () => {
  // 2° energy fundamentals: L ≈ 570, M ≈ 545, S ≈ 445 nm on a 5 nm grid
  const [L, M, S] = cones();
  assert.deepEqual([peakAt(L), peakAt(M), peakAt(S)], [570, 545, 445]);
  assert.ok(cones()[2].every((v, i) => GRID[i] <= 615 || v === 0), 'S is zero beyond the table');
  assert.ok(cones().every((c) => c[0] === 0 && c[1] === 0), 'nothing below 390 nm');
});

test('the lens darkens with age, fastest after 60, and mostly in the blue', () => {
  const d = (age) => lensDensity(age)[GRID.indexOf(420)];
  assert.ok(d(20) < d(32) && d(32) < d(60) && d(60) < d(80));
  assert.ok(d(80) - d(60) > d(60) - d(40), 'faster after 60');
  const t70 = mediaTransmission({ age: 70 });
  assert.ok(t70[GRID.indexOf(420)] < 0.2 && t70[GRID.indexOf(650)] > 0.8);
});

test('every eye sees white paper as white in daylight', () => {
  for (const eye of EYES) for (const age of [20, 50, 80]) {
    assert.equal(seenBy(ones, LAMP.daylight, eye, { age }).css, 'rgb(255, 255, 255)', `${eye.id} at ${age}`);
  }
});

test('a dichromat keeps the white and the anchors, and loses one cone signal', () => {
  const white = [1, 0.9, 0.8];
  assert.deepEqual(dichromat(white, white, 0, [475, 575]).map((v) => +v.toFixed(12)), white.map((v) => +v.toFixed(12)));
  // two lights that differ only in the missing cone collapse onto one colour
  for (const [missing, anchors] of [[0, [475, 575]], [1, [475, 575]], [2, [485, 660]]]) {
    const a = [0.6, 0.5, 0.4], b = a.slice(); b[missing] += 0.1;
    const pa = dichromat(a, white, missing, anchors), pb = dichromat(b, white, missing, anchors);
    pa.forEach((v, i) => assert.ok(Math.abs(v - pb[i]) < 1e-12, `missing ${missing}`));
  }
});

test('red–green dichromats lose the red–green axis; tritans the blue–yellow one; trichromat eyes barely move a glass', () => {
  const pieces = [['cobalt', 0.9], ['gold-colloid', 1.1], ['cds', 1], ['chromium', 1.2], ['copper', 1], ['manganese', 1.3], ['neodymium', 1]];
  const spread = (eye, k) => {
    const v = pieces.map(([id, c]) => linToLab(seenBy(glass(id, c), LAMP.daylight, eye).lin)[k]);
    return Math.max(...v) - Math.min(...v);
  };
  for (const id of ['protan', 'deutan']) assert.ok(spread(EYE[id], 1) < spread(EYE.standard, 1) / 2, `${id} a*`);
  assert.ok(spread(EYE.tritan, 2) < spread(EYE.standard, 2) / 2, 'tritan b*');
  const ruby = glass('gold-colloid', 1.1);
  for (const age of [20, 70]) assert.ok(dE(seenBy(ruby, LAMP.daylight, EYE.standard), seenBy(ruby, LAMP.daylight, EYE.cones, { age })) < 5);
});
