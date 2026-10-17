import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/scripts/optics-core.js';
import * as spectrum from '../src/scripts/islands/spectrum.js';

const W = [380, 405, 430, 455, 480, 505, 530, 555, 580, 605, 630, 655, 680, 705, 730, 755, 780];
const flat = W.map(() => 1);
const zeros = W.map(() => 0);
const rgb = (s) => s.match(/\d+/g).map(Number);
// Absorptance curve that absorbs everywhere except a window around `center`.
const passband = (center) => W.map((w) => (Math.abs(w - center) <= 40 ? 0.05 : 0.95));

test('cmf: matches tabulated CIE 1931 values at landmark wavelengths', () => {
  assert.ok(Math.abs(core.cmf(555)[1] - 1.0) < 0.02); // y-bar peak
  assert.ok(Math.abs(core.cmf(600)[0] - 1.062) < 0.03); // x-bar main lobe
  assert.ok(Math.abs(core.cmf(445)[2] - 1.78) < 0.06); // z-bar peak
});

test('transmittedColor returns an rgb() string', () => {
  assert.match(core.transmittedColor(W, zeros, flat), /^rgb\(\d+, \d+, \d+\)$/);
});

test('clear glass renders white under any illuminant (white balance)', () => {
  const warm = W.map((w) => (w - 370) / 410); // incandescent-like ramp
  for (const spd of [flat, warm]) assert.deepEqual(rgb(core.transmittedColor(W, zeros, spd)), [255, 255, 255]);
});

test('uniform absorption renders neutral gray, darker as it rises', () => {
  const [r1, g1, b1] = rgb(core.transmittedColor(W, W.map(() => 0.5), flat));
  const [r2] = rgb(core.transmittedColor(W, W.map(() => 0.9), flat));
  assert.ok(Math.max(r1, g1, b1) - Math.min(r1, g1, b1) <= 3);
  assert.ok(r2 < r1);
});

test('a passband renders the hue it transmits', () => {
  const [rb, gb, bb] = rgb(core.transmittedColor(W, passband(455), flat));
  assert.ok(bb > rb && bb > gb, 'blue window -> blue');
  const [rg, gg, bg] = rgb(core.transmittedColor(W, passband(530), flat));
  assert.ok(gg > rg && gg > bg, 'green window -> green');
  const [rr, gr, br] = rgb(core.transmittedColor(W, passband(700), flat));
  assert.ok(rr > gr && rr > br, 'red window -> red');
});

test('spectrum.js re-exports the core transmittedColor', () => {
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

test('mixedAbsorbance follows Beer–Lambert: doubling c or thickness squares transmittance', () => {
  const once = core.mixedAbsorbance([{ colorant: co, c: 1 }], 3);
  const twiceC = core.mixedAbsorbance([{ colorant: co, c: 2 }], 3);
  const twiceL = core.mixedAbsorbance([{ colorant: co, c: 1 }], 3, 2);
  for (let j = 0; j < 3; j++) {
    const t = 1 - once[j];
    assert.ok(Math.abs(1 - twiceC[j] - t * t) < 1e-12);
    assert.ok(Math.abs(twiceL[j] - twiceC[j]) < 1e-12);
  }
});

test('mixedAbsorbance is commutative', () => {
  const ab = core.mixedAbsorbance([{ colorant: co, c: 0.6 }, { colorant: cr, c: 0.3 }], 3);
  const ba = core.mixedAbsorbance([{ colorant: cr, c: 0.3 }, { colorant: co, c: 0.6 }], 3);
  for (let j = 0; j < 3; j++) assert.ok(Math.abs(ab[j] - ba[j]) < 1e-12);
});

test('mixedAbsorbance is monotone in concentration and thickness', () => {
  const lo = core.mixedAbsorbance([{ colorant: co, c: 0.2 }, { colorant: cr, c: 0.5 }], 3);
  const hi = core.mixedAbsorbance([{ colorant: co, c: 0.8 }, { colorant: cr, c: 0.5 }], 3);
  const thick = core.mixedAbsorbance([{ colorant: co, c: 0.2 }, { colorant: cr, c: 0.5 }], 3, 3);
  for (let j = 0; j < 3; j++) assert.ok(hi[j] >= lo[j] && thick[j] >= lo[j]);
});

test('mixedAbsorbance stays in [0,1] when stacking strong colorants', () => {
  const strong = { absorbance: [0.95, 0.98, 0.99] };
  const melts = Array.from({ length: 4 }, () => ({ colorant: strong, c: 1 }));
  for (const v of core.mixedAbsorbance(melts, 3, 4)) assert.ok(v >= 0 && v <= 1);
});

test('glow: hotter glass is brighter and yellower; luminance is 1 at the reference', () => {
  const hot = core.glow(1423), warm = core.glow(1073);
  assert.ok(Math.abs(hot.luminance - 1) < 1e-12);
  assert.ok(warm.luminance < hot.luminance / 100);
  assert.ok(hot.rgb[1] > warm.rgb[1], 'more green in the hotter glow');
  assert.equal(hot.rgb[0], 255);
});
