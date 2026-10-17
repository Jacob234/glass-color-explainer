import { test } from 'node:test';
import assert from 'node:assert/strict';
import optics from '../src/data/optics.json' with { type: 'json' };
import * as s from '../src/scripts/spectra.js';
import { BAND_MODELS } from '../src/scripts/bands.js';

const DAY = s.toGrid(optics.wavelengths, optics.illuminants.find((i) => i.id === 'daylight').spd);
const colorant = (id) => optics.colorants.find((c) => c.id === id);
const at = (w) => s.GRID.indexOf(w);

test('neodymium keeps its 585 nm band on the 5 nm grid', () => {
  const d = s.colorantDensity(colorant('neodymium'), optics.wavelengths);
  assert.ok(d[at(585)] > 4, `density at 585 nm ${d[at(585)]}`);
  assert.ok(d[at(560)] < 0.3 && d[at(620)] < 0.1); // clear on both sides of the band
});

test('neodymium glass reads lilac: red above green, blue highest', () => {
  const [r, g, b] = s.spectrumColor(s.transmission([[BAND_MODELS.neodymium(s.GRID), 1]]), DAY).rgb;
  assert.ok(b > r && r > g, `rgb ${[r, g, b]}`);
});

test('cobalt reads blue, not violet: its red leak sits beyond 680 nm', () => {
  const d = s.colorantDensity(colorant('cobalt'), optics.wavelengths), T = s.transmission([[d, 1]]);
  assert.ok(T[at(600)] < 0.06 && T[at(630)] < 0.1, `T(600) ${T[at(600)]}, T(630) ${T[at(630)]}`);
  assert.ok(T[at(720)] > 0.8); // the deep-red window is real
  const [r, g, b] = s.spectrumColor(T, DAY).rgb;
  assert.ok(b > 0.9 && r < 0.05 && g > r, `rgb ${[r, g, b]}`);
});

test('the coarse cobalt curve in optics.json matches its band model', () => {
  const model = BAND_MODELS.cobalt(optics.wavelengths).map((d) => 1 - 10 ** -d);
  colorant('cobalt').absorbance.forEach((a, i) => assert.ok(Math.abs(a - model[i]) < 0.006, `${optics.wavelengths[i]} nm`));
});
