import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAMPS, LAMP, lines, underLamp, fineSpd } from '../src/scripts/lamps.js';
import { GRID, spectrumColor, upsample, bandEdge } from '../src/scripts/spectra.js';
import { LENSES, luminousT } from '../src/scripts/flare.js';

const ones = GRID.map(() => 1);

test('every lamp is a non-negative spectrum on GRID', () => {
  for (const l of LAMPS) {
    assert.equal(l.spd.length, GRID.length, l.id);
    assert.ok(l.spd.every((v) => Number.isFinite(v) && v >= 0), l.id);
    assert.ok(l.adapt >= 0 && l.adapt <= 1, l.id);
  }
});

test('binned emission lines keep their total power', () => {
  const spd = lines([[588.995, 2 / 3], [589.592, 1 / 3]]);
  assert.ok(Math.abs(spd.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(spd.every((v, i) => v === 0 || GRID[i] === 585 || GRID[i] === 590));
});

test('white paper is white under daylight, and tinted under a lamp the eye only partly adapts to', () => {
  assert.equal(underLamp(ones, LAMP.daylight).css, 'rgb(255, 255, 255)');
  const [r, g, b] = underLamp(ones, LAMP.candle).rgb;
  assert.ok(r > g && g > b, 'candlelight is warm');
});

test('partial adaptation runs between the lamp color (0) and full adaptation (1)', () => {
  const spd = LAMP.tungsten.spd;
  assert.deepEqual(spectrumColor(ones, spd, 1).rgb, spectrumColor(ones, spd).rgb);
  const b = (d) => spectrumColor(ones, spd, d).rgb[2];
  assert.ok(b(0) < b(0.5) && b(0.5) < b(1));
});

test('under a sodium lamp there is no hue: every glass is the lamp color, lighter or darker', () => {
  const ratio = (T) => { const [r, g] = underLamp(T, LAMP.sodium).lin; return g / r; };
  const ref = ratio(ones);
  for (const eV of [1.8, 2.1, 2.4]) {
    const T = bandEdge(eV);
    // the doublet is binned into the 585 and 590 nm samples, so a steep edge can tilt it by a few percent
    if (underLamp(T, LAMP.sodium).lin[0] > 1e-4) assert.ok(Math.abs(ratio(T) / ref - 1) < 0.03, `edge ${eV} eV`);
  }
});

test('didymium passes most daylight but almost none of a sodium street lamp', () => {
  const T = LENSES.didymium.T;
  assert.ok(luminousT(T, fineSpd(LAMP.daylight)) > 0.4);
  assert.ok(luminousT(T, fineSpd(LAMP.sodium)) < 0.05);
});

test('spectral upsampling reproduces a photo color under daylight', () => {
  for (const rgb of [[0.2, 0.4, 0.8], [0.9, 0.7, 0.1], [0.5, 0.5, 0.5], [0.8, 0.1, 0.3]]) {
    const back = spectrumColor(upsample(rgb, LAMP.daylight.spd), LAMP.daylight.spd).rgb;
    back.forEach((v, i) => assert.ok(Math.abs(v - rgb[i]) < 0.01, `${rgb} → ${back}`));
  }
});
