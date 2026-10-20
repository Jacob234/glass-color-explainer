import { test } from 'node:test';
import assert from 'node:assert/strict';
import optics from '../src/data/optics.json' with { type: 'json' };
import * as s from '../src/scripts/spectra.js';
import { BAND_MODELS } from '../src/scripts/bands.js';

const DAY = s.toGrid(optics.wavelengths, optics.illuminants.find((i) => i.id === 'daylight').spd);
const colorant = (id) => optics.colorants.find((c) => c.id === id);
const at = (w) => s.GRID.indexOf(w);

test('neodymium keeps its 583 nm band on the 5 nm grid', () => {
  const d = s.colorantDensity(colorant('neodymium'), optics.wavelengths);
  assert.ok(d[at(585)] > 2, `density at 585 nm ${d[at(585)]}`);
  assert.ok(d[at(560)] < 0.1 && d[at(625)] < 0.05); // clear on both sides of the band
  assert.ok(d[at(610)] > 0.05 * d[at(585)]); // but its long-wavelength wing reaches the tube's red line
});

// JBK-951: real neodymium glass is lilac in daylight, pink under a bulb and blue-gray under a
// tri-phosphor tube. Hue in CIELAB (a*, b*) of the history pin's glass under each lamp.
test('neodymium turns blue under the fluorescent tube, lilac in daylight, pink under tungsten', async () => {
  const { LAMP, underLamp } = await import('../src/scripts/lamps.js');
  const f = await import('../src/scripts/fit.js');
  const T = s.transmission([[BAND_MODELS.neodymium(s.GRID), 1.6]]);
  const lab = (id) => f.linToLab(underLamp(T, LAMP[id]).lin);
  const [, ad, bd] = lab('daylight'), [, at_, bt] = lab('tungsten'), [, af, bf] = lab('tube');
  assert.ok(ad > 10 && bd < -20, `daylight a* ${ad}, b* ${bd}: lilac`);
  assert.ok(at_ > 15 && at_ > Math.abs(bt), `tungsten a* ${at_}, b* ${bt}: pink`);
  assert.ok(bf < -10 && af < 0, `tube a* ${af}, b* ${bf}: blue`);
  const hue = (a, b) => (Math.atan2(b, a) * 180) / Math.PI;
  assert.ok(hue(af, bf) < hue(ad, bd) - 30, 'the tube turns the hue from violet toward blue');
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

test('islands on optics-core, fed fineOptics, agree with the 5 nm engine', async () => {
  const core = await import('../src/scripts/optics-core.js');
  const fine = s.fineOptics(optics), by = (id) => fine.colorants.find((c) => c.id === id);
  const melt = [{ colorant: by('neodymium'), c: 0.5 }, { colorant: by('cobalt'), c: 0.2 }];
  const viaCore = core.transmittedColor(fine.wavelengths, core.mixedAbsorbance(melt, fine.wavelengths.length), fine.illuminants[0].spd);
  const T = s.transmission([['neodymium', 0.5], ['cobalt', 0.2]].map(([id, c]) => [s.colorantDensity(colorant(id), optics.wavelengths), c]));
  const viaEngine = s.spectrumColor(T, DAY).rgb.map((v) => Math.round(255 * v));
  const coreRgb = viaCore.match(/\d+/g).map(Number);
  coreRgb.forEach((v, i) => assert.ok(Math.abs(v - viaEngine[i]) <= 2, `${viaCore} vs ${viaEngine}`));
});
