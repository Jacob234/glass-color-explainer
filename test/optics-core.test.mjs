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
