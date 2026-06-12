import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/scripts/optics-core.js';
import * as spectrum from '../src/scripts/islands/spectrum.js';

test('wavelengthToRgb: 555 nm is green-dominant', () => {
  const [r, g, b] = core.wavelengthToRgb(555);
  assert.ok(g > r && g > b);
});

test('wavelengthToRgb: 430 nm is blue-dominant', () => {
  const [r, g, b] = core.wavelengthToRgb(430);
  assert.ok(b > r && b > g);
});

test('transmittedColor returns an rgb() string', () => {
  const color = core.transmittedColor([380, 580, 780], [0, 0, 0], [1, 1, 1]);
  assert.match(color, /^rgb\(\d+, \d+, \d+\)$/);
});

test('spectrum.js re-exports the core functions (extraction is behavior-preserving)', () => {
  assert.equal(spectrum.wavelengthToRgb, core.wavelengthToRgb);
  assert.equal(spectrum.transmittedColor, core.transmittedColor);
});

const co = { absorbance: [0.2, 0.9, 0.05] };
const cr = { absorbance: [0.7, 0.1, 0.8] };

test('mixedAbsorbance: empty melt is clear glass (all zeros)', () => {
  assert.deepEqual(core.mixedAbsorbance([], 3), [0, 0, 0]);
});

test('mixedAbsorbance: single colorant at c=1 equals its raw curve', () => {
  const out = core.mixedAbsorbance([{ colorant: co, c: 1 }], 3);
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(out[j] - co.absorbance[j]) < 1e-12);
});

test('mixedAbsorbance is commutative', () => {
  const ab = core.mixedAbsorbance([{ colorant: co, c: 0.6 }, { colorant: cr, c: 0.3 }], 3);
  const ba = core.mixedAbsorbance([{ colorant: cr, c: 0.3 }, { colorant: co, c: 0.6 }], 3);
  assert.deepEqual(ab, ba);
});

test('mixedAbsorbance is monotone in concentration', () => {
  const lo = core.mixedAbsorbance([{ colorant: co, c: 0.2 }, { colorant: cr, c: 0.5 }], 3);
  const hi = core.mixedAbsorbance([{ colorant: co, c: 0.8 }, { colorant: cr, c: 0.5 }], 3);
  for (let j = 0; j < 3; j++) assert.ok(hi[j] >= lo[j]);
});

test('mixedAbsorbance stays in [0,1] when stacking strong colorants', () => {
  const strong = { absorbance: [0.95, 0.98, 0.99] };
  const melts = Array.from({ length: 4 }, () => ({ colorant: strong, c: 1 }));
  const out = core.mixedAbsorbance(melts, 3);
  for (const v of out) assert.ok(v >= 0 && v <= 1);
});
