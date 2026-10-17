import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../src/scripts/flare.js';

const at = (w) => f.FINE.indexOf(w);

test('FINE spans 380–1400 nm in 1 nm steps', () => {
  assert.equal(f.FINE[0], 380);
  assert.equal(f.FINE.at(-1), 1400);
  assert.equal(f.FINE[f.VIS_END], 780);
});

test('the sodium doublet keeps its energy and lands at 589–590 nm', () => {
  const line = f.lineSpectrum();
  const total = line.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(line[at(589)] > 0.5 && line[at(590)] > 0.1);
  assert.ok(line[at(588)] < 0.01 && line[at(591)] === 0);
});

test('didymium cuts the sodium flare to about 1% and passes most other light', () => {
  const { didymium } = f.LENSES, line = f.lineSpectrum();
  const flareT = f.xyz(line, didymium.T)[1] / f.xyz(line)[1];
  assert.ok(flareT < 0.02 && flareT > 0.002, `flare transmission ${flareT}`);
  assert.ok(didymium.T[at(550)] > 0.85 && didymium.T[at(620)] > 0.85); // between the bands
  const lum = f.luminousT(didymium.T, f.planck(1423));
  assert.ok(lum > 0.5 && lum < 0.85, `luminous transmission ${lum}`);
});

test('the notch comes from both twins: Nd³⁺ at 585 nm and Pr³⁺ at 590 nm', () => {
  const { nd, pr } = f.DENSITY;
  assert.ok(nd[at(585)] > 1 && pr[at(590)] > 0.5);
  assert.ok(nd[at(585)] > nd[at(550)] * 10);
});

test('didymium leaves the near infrared alone; ferrous glass removes it', () => {
  const bb = f.planck(1423), ir = (k) => f.power(bb, f.LENSES[k].T) / f.power(bb);
  assert.ok(ir('didymium') > 0.85);
  assert.ok(ir('shade') < 0.06);
  assert.ok(f.luminousT(f.LENSES.shade.T, bb) > 0.4); // costs little visible light
});

test('almost all of a 1150 °C gather’s radiation up to 1400 nm is infrared', () => {
  const bb = f.planck(1423);
  assert.ok(f.power(bb, undefined, 380, 780) / f.power(bb, undefined, 380, 1400) < 0.02);
});

test('flareSpectrum scales the line to the requested luminance ratio', () => {
  const T = 1300, ratio = 4, fl = f.flareSpectrum(T, ratio);
  assert.ok(Math.abs(f.xyz(fl)[1] / f.xyz(f.planck(T))[1] - ratio) < 1e-9);
});

test('a sodium line renders orange-yellow', () => {
  const [r, g, b] = f.lightColor(f.xyz(f.lineSpectrum()));
  assert.ok(r > 0.999);
  assert.ok(g > 0.4 && g < 0.75 && b < 0.05);
});
