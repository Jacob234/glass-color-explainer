import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/scripts/uranium.js';
import { LAMP, underLamp } from '../src/scripts/lamps.js';
import { GRID } from '../src/scripts/spectra.js';

const zeros = GRID.map(() => 0);

test('the emission comb peaks near 527 nm and sums to one photon', () => {
  assert.ok(Math.abs(GRID[u.EMISSION.indexOf(Math.max(...u.EMISSION))] - 527) <= 5);
  assert.ok(Math.abs(u.EMISSION.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('fluorescence never gives out more photons than the glass absorbs', () => {
  for (const l of [LAMP.daylight, LAMP.black, LAMP.tungsten]) {
    let absorbed = 0, emitted = 0;
    u.EXT.forEach((w, i) => { absorbed += l.ext[i] * (1 - 10 ** -u.density(w)) * w; });
    u.fluorescence(l.ext).forEach((e, i) => { emitted += e * GRID[i]; });
    assert.ok(emitted <= absorbed * u.YIELD + 1e-9, l.id);
  }
});

test('a sodium lamp, with no ultraviolet or blue, makes no glow', () => {
  const peak = (l) => Math.max(...u.fluorescence(l.ext)) / Math.max(...l.spd);
  assert.ok(peak(LAMP.sodium) < 1e-4 * peak(LAMP.daylight));
});

test('in daylight uranium glass is a yellow filter; under the black light it is green light', () => {
  const T = u.transmissionOnGrid();
  const [r, g, b] = underLamp(T, LAMP.daylight, u.fluorescence(LAMP.daylight.ext)).rgb;
  assert.ok(b < g - 0.15 && r > 0.8, 'yellow in daylight');
  const glow = underLamp(T, LAMP.black, u.fluorescence(LAMP.black.ext)).rgb, dark = underLamp(T, LAMP.black).rgb;
  assert.ok(glow[1] > 0.8 && glow[1] > glow[0] + 0.5, 'green under the black light');
  assert.ok(Math.max(...dark) < 0.05, 'nothing to see without the glow');
  assert.ok(Math.max(...underLamp(zeros.map(() => 1), LAMP.black).rgb) < 0.1, 'the room stays dark');
});
