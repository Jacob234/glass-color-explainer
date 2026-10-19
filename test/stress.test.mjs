import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../src/scripts/stress.js';
import { GRID } from '../src/scripts/spectra.js';
import { LAMP, underLamp } from '../src/scripts/lamps.js';

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('the stress-optic coefficient converts Pilkington\'s rule to about 2.62 nm per mm per MPa', () => {
  const psiPerMPa = 1 / 0.006895, mmPerIn = 25.4;
  assert.ok(near(s.GLASS.C, (psiPerMPa / 2.18) / mmPerIn, 0.01));
  assert.ok(near(s.DIFFUSIVITY, 0.426, 0.005));
});

test('the frozen profile balances: no net force, faces at twice the core', () => {
  const d = 8, dT = 10, n = 2000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += s.faceStress(-d / 2 + ((i + 0.5) * d) / n, d, dT) * (d / n);
  assert.ok(Math.abs(sum) < 1e-6 * s.coreStress(d, dT) * d);
  assert.ok(s.surfaceStress(d, dT) < 0 && s.coreStress(d, dT) > 0);
  assert.ok(near(s.surfaceStress(d, dT), -2 * s.coreStress(d, dT)));
});

test('stress grows with cooling rate and with the square of thickness', () => {
  assert.ok(near(s.frozenDifference(20, 8), 2 * s.frozenDifference(10, 8)));
  assert.ok(near(s.frozenDifference(10, 16), 4 * s.frozenDifference(10, 8)));
});

test('a lehr-cooled foot is near zero retardation face on, a bench-cooled one reaches first-order colors', () => {
  const { R, d } = s.FOOT;
  const slow = Math.abs(s.planRetardation(R, R, d, s.frozenDifference(1, d)));
  const fast = Math.abs(s.planRetardation(R, R, d, s.frozenDifference(300, d)));
  assert.ok(slow < 5, `lehr ${slow} nm`);
  assert.ok(fast > 400 && fast < 1200, `bench ${fast} nm`);
  assert.equal(s.planRetardation(0, R, d, 50), -0);
});

test('a plane polariscope gives sin²2φ · sin²(πΓ/λ)', () => {
  for (const [phi, G] of [[0.3, 200], [Math.PI / 4, 550], [1.1, -900]]) {
    const I = s.polariscope('plane', phi, G);
    GRID.forEach((w, i) => assert.ok(near(I[i], Math.sin(2 * phi) ** 2 * Math.sin((Math.PI * G) / w) ** 2, 1e-12)));
  }
  assert.ok(s.polariscope('plane', 0, 800).every((v) => v < 1e-20), 'stress axis along the polarizer: dark (the isoclinic cross)');
});

test('a circular polariscope removes the cross and keeps a dark field', () => {
  const a = s.polariscope('circular', 0.1, 300), b = s.polariscope('circular', 1.2, 300);
  a.forEach((v, i) => assert.ok(near(v, b[i], 1e-12)));
  assert.ok(s.polariscope('circular', 0.4, 0).every((v) => v < 1e-20));
});

test('the tint plate turns no stress magenta, and small stress shifts it two ways by orientation', () => {
  const look = (I) => underLamp(I, LAMP.daylight).rgb;
  const [r, g, b] = look(s.polariscope('tint', 0.3, 0));
  assert.ok(r > g && b > g, 'magenta background');
  const plus = look(s.polariscope('tint', Math.PI / 4, 60)), minus = look(s.polariscope('tint', -Math.PI / 4, 60));
  assert.ok(plus[2] / plus[0] > b / r && minus[2] / minus[0] < b / r, 'one way bluer, the other yellower');
});

test('Michel-Lévy: 550 nm of retardation between crossed polarizers is first-order red-violet', () => {
  const [r, g, b] = underLamp(s.polariscope('plane', Math.PI / 4, 550), LAMP.daylight).lin;
  assert.ok(r > g && b > g, `${r} ${g} ${b}`);
  const dark = underLamp(s.polariscope('plane', Math.PI / 4, 0), LAMP.daylight).lin;
  assert.ok(Math.max(...dark) < 1e-9);
});

test('seen through the edge, the in-plane pattern drops out and the face-to-core profile remains', () => {
  const { R, d } = s.FOOT, dT = 20;
  assert.ok(near(s.edgeRetardation(0, d / 2, R, d, dT), s.GLASS.C * 2 * R * s.surfaceStress(d, dT)));
  assert.equal(s.edgeRetardation(R + 1, 0, R, d, dT), 0);
});
