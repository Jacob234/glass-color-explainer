import { test } from 'node:test';
import assert from 'node:assert/strict';
import optics from '../src/data/optics.json' with { type: 'json' };
import measured from '../src/data/measured.json' with { type: 'json' };
import library from '../src/data/library.json' with { type: 'json' };
import * as m from '../src/scripts/measured.js';
import * as s from '../src/scripts/spectra.js';
import { linToLab } from '../src/scripts/fit.js';

const near = (a, b, tol, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} vs ${b}`);
const DAY = s.toGrid(optics.wavelengths, optics.illuminants.find((i) => i.id === 'daylight').spd);
const colorant = (id) => optics.colorants.find((c) => c.id === id);

test("Volotinen's band widths are σ: her Fe³⁺ bands sum to her stated 1.19 (cm·mol%)⁻¹ at 380 nm", () => {
  near(m.sigmaBands(measured.colorants['iron-ferric'].bands, 380), 1.19, 0.01);
});

test('every colorant says where its curve comes from, and measured ones cite a library source', () => {
  const ids = new Set(library.sources.map((x) => x.id));
  for (const c of optics.colorants) {
    assert.ok(['measured', 'measured-shape', 'illustrative'].includes(c.basis), c.id);
    if (c.basis !== 'illustrative') assert.ok(ids.has(c.source), `${c.id}: ${c.source}`);
    assert.equal(c.basis !== 'illustrative', Boolean(measured.colorants[c.id]), c.id);
  }
});

test('the coarse curves in optics.json are the measured curves, resampled', () => {
  for (const id of Object.keys(measured.colorants)) {
    const model = m.MEASURED_MODELS[id](optics.wavelengths).map((d) => 1 - 10 ** -d);
    colorant(id).absorbance.forEach((a, i) => near(a, model[i], 0.001, `${id} ${optics.wavelengths[i]} nm`));
  }
});

test('the 5 nm engine uses the measured curves', () => {
  for (const id of Object.keys(measured.colorants)) {
    const d = s.colorantDensity(colorant(id), optics.wavelengths), want = m.MEASURED_MODELS[id](s.GRID);
    d.forEach((v, i) => near(v, want[i], 1e-12, id));
  }
});

test("the iron taken out of the cobalt glass leaves cobalt's own bands, clear where cobalt is clear", () => {
  const { coefficients } = m.background('cobalt'), clean = m.cleaned('cobalt');
  assert.ok(coefficients.every((k) => k >= 0) && coefficients.some((k) => k > 0), `${coefficients}`);
  m.MEASURED_WAVELENGTHS.forEach((w, i) => { if (w <= 450 || w >= 720) assert.ok(clean[i] < 0.04, `${w} nm: ${clean[i]}`); });
  const peak = m.MEASURED_WAVELENGTHS[clean.indexOf(Math.max(...clean))];
  assert.ok(peak >= 590 && peak <= 650, `peak at ${peak} nm`);
});

test('measured ferric iron is a faint yellow-green, measured copper a pale blue', () => {
  const lab = (id) => linToLab(s.spectrumColor(s.transmission([[s.colorantDensity(colorant(id), optics.wavelengths), 1]]), DAY).lin);
  const [, a, b] = lab('iron-ferric');
  assert.ok(b > 0 && a < 0, `Fe³⁺ a* ${a}, b* ${b}`);
  const [, a2, b2] = lab('copper');
  assert.ok(b2 < 0 && a2 < 0, `Cu²⁺ a* ${a2}, b* ${b2}`);
});

test('each basis line names its source and, for absolute curves, the amount at ×1', () => {
  assert.match(m.basisLine('copper'), /Volotinen 2007.*0\.11 mol% Cu²⁺ through 10 mm/);
  assert.match(m.basisLine('cobalt'), /Meulebroeck et al\. 2016/);
  assert.match(m.basisLine('manganese'), /^Illustrative/);
});
