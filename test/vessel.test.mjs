import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../src/scripts/vessel.js';

test('a chord through a disc is its diameter on axis and zero outside it', () => {
  assert.equal(v.chord(5, 0), 10);
  assert.equal(v.chord(5, 5), 0);
  assert.equal(v.chord(5, 7), 0);
  assert.ok(Math.abs(v.chord(5, 3) - 8) < 1e-12);
});

test('the bowl is thin at the rim and heavy at the base, and the slider scales the wall', () => {
  const r = v.bowlReadings();
  assert.ok(r.rim < r.wall && r.wall < r.base, JSON.stringify(r));
  assert.ok(Math.abs(v.bowlReadings({ blow: 2 }).rim - 2 * r.rim) < 1e-9);
  for (let y = v.BOWL.foot; y <= v.BOWL.H; y += 5) {
    const p = v.profile(y);
    assert.ok(p.r < p.R && p.skinR <= p.R && p.skinR > p.r, `profile at ${y}`);
  }
  assert.equal(v.profile(-1), null);
  assert.equal(v.profile(v.BOWL.H + 1), null);
});

test('seen against the light, the outline crosses more glass than the middle', () => {
  const y = 60, { R } = v.profile(y);
  assert.ok(v.bowlPath(R - 0.5, y) > 3 * v.bowlPath(0, y));
  assert.equal(v.bowlPath(-20, y), v.bowlPath(20, y));
  assert.equal(v.bowlPath(20, y, { back: true }), v.bowlPath(20, y) / 2);
});

test('casing evens out the colour: rim and base cross about the same skin', () => {
  const rim = v.bowlPath(0, v.BOWL.H - 1, { cased: true }), low = v.bowlPath(0, v.BOWL.foot + 15, { cased: true });
  assert.ok(Math.abs(rim - low) / rim < 0.5, `${rim} vs ${low}`);
  const solidRim = v.bowlPath(0, v.BOWL.H - 1), solidLow = v.bowlPath(0, v.BOWL.foot + 15);
  assert.ok(solidLow / solidRim > 2);
  assert.equal(v.bowlPath(0, 2, { cased: true }), 0); // the clear foot
});

test('a solid cane is darkest down the middle, a cased one at its edges', () => {
  const { R } = v.CANE;
  assert.ok(v.canePath(0) > v.canePath(R - 0.3));
  assert.ok(v.canePath(0, true) < v.canePath(R - 0.3, true));
  assert.ok(Math.abs(v.canePath(0, true) - 2 * v.CANE.skin) < 1e-9);
});
