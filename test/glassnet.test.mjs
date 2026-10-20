import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as gn from '../src/scripts/glassnet.js';
import * as b from '../src/scripts/batch.js';

// A tiny stand-in for public/data/glassnet.json: every preset has isokoms falling 50 °C per decade from
// 1400 °C, and soda (0–20 wt%, 3 steps) lowers every temperature 2 °C per wt%, lime raises them 1 °C.
const sliders = { Na2O: 20, K2O: 20, CaO: 20, MgO: 8, Al2O3: 8, B2O3: 20, PbO: 40 };
const flat = { ...Object.fromEntries(gn.LEVELS.map((n) => [`T${n}`, 1400 - 50 * n])), liquidus: 1000, Tg: 550, nd: 1.5, vd: 58, rho: 2.5 };
const line = (slope, max) => Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, [0, 0.5, 1].map((f) => v + slope * f * max)]));
const named = {}, sweeps = {};
for (const p of b.PRESETS) {
  const base = gn.presetWt({ sliders }, p);
  named[p.id] = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v - 2 * base.Na2O + base.CaO]));
  sweeps[p.id] = Object.fromEntries(Object.keys(sliders).map((o) => [o, line(0, sliders[o])]));
  sweeps[p.id].Na2O = Object.fromEntries(Object.entries(line(-2, 20)).map(([k, ys]) => [k, ys.map((y) => y + base.CaO)]));
  sweeps[p.id].CaO = Object.fromEntries(Object.entries(line(1, 20)).map(([k, ys]) => [k, ys.map((y) => y - 2 * base.Na2O)]));
}
const fake = { sliders, steps: 3, named, sweeps, melts: { a: ['t', [1100, null], 1010, 1.51, null], b: ['h', null, 980, null, null] } };
const floatWt = gn.presetWt(fake, b.PRESET.float);

test('a preset gets GlassNet\'s own numbers, and one moved slider follows its sweep', () => {
  const f = gn.predict(fake, floatWt);
  assert.equal(f.anchor, 'float');
  assert.deepEqual(f.moved, []);
  assert.equal(f.T3, named.float.T3);
  const g = gn.predict(fake, { ...floatWt, Na2O: floatWt.Na2O + 1 });
  assert.deepEqual(g.moved, ['Na2O']);
  assert.ok(Math.abs(g.T3 - (named.float.T3 - 2)) < 1e-9);
});

test('two moved sliders add their changes', () => {
  const g = gn.predict(fake, { ...floatWt, Na2O: floatWt.Na2O + 1, CaO: floatWt.CaO + 2 });
  assert.ok(Math.abs(g.liquidus - named.float.liquidus) < 1e-9, `${g.liquidus}`);
});

test('a batch is anchored to the nearest preset', () => {
  const lead = gn.presetWt(fake, b.PRESET.lead);
  assert.equal(gn.anchor(fake, { ...lead, PbO: lead.PbO - 1 }).id, 'lead');
  assert.equal(gn.anchor(fake, { ...lead, PbO: lead.PbO - 1 }, 'float').id, 'float');
});

test('the viscosity curve passes through the isokoms and inverts', () => {
  const v = gn.curve(gn.LEVELS.map((n) => 1400 - 50 * n));
  assert.equal(v.tempAt(3), 1250);
  assert.equal(v.tempAt(3.5), 1225);
  assert.ok(Math.abs(v.logEta(1225) - 3.5) < 1e-9);
});

test('isokoms out of order are clamped so the curve never turns back', () => {
  const bent = { ...fake, named: { ...named, float: { ...named.float, T5: 1400 } } };
  const T = gn.predict(bent, floatWt).isokoms.map(([, t]) => t);
  for (let i = 1; i < T.length; i++) assert.ok(T[i] <= T[i - 1]);
});

test('a low T0 is lifted to T1 rather than dragging the whole curve down', () => {
  const low = { ...fake, named: { ...named, float: { ...named.float, T0: 900 } } };
  const g = gn.predict(low, floatWt);
  assert.equal(g.isokoms[0][1], g.isokoms[1][1]);
  assert.equal(g.T3, named.float.T3);
  assert.equal(g.viscosity.tempAt(3), named.float.T3);
});

test('score compares GlassNet and the bench model on the same measured points', () => {
  const sg = { glasses: [{ id: 'a', visc: [[3, 1090], [13.5, 500]], liq: 1000, nd: 1.5 }, { id: 'b', liq: 1000 }] };
  const s = gn.score(sg, fake, () => ({ tempAt: () => 1080, nd: 1.505 }));
  assert.equal(s.visc.n, 1);
  assert.equal(s.visc.glassnet, 10);
  assert.equal(s.visc.bench, 10);
  assert.equal(s.liq.n, 2);
  assert.ok(Math.abs(s.nd.glassnet - 0.01) < 1e-9 && Math.abs(s.nd.bench - 0.005) < 1e-9);
  assert.equal(gn.score(sg, fake, () => ({ tempAt: () => 0, nd: 0 }), { only: ['h'] }).liq.n, 1);
});

const path = new URL('../public/data/glassnet.json', import.meta.url);
test('the committed GlassNet numbers cover every preset and slider', { skip: !existsSync(path) }, () => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  for (const p of b.PRESETS) {
    assert.ok(data.named[p.id], p.id);
    for (const k of Object.keys(data.sliders)) {
      const sw = data.sweeps[p.id][k];
      assert.ok(sw.T3.length >= 2 && sw.T3.length <= data.steps, `${p.id} ${k}`);
      // The sweep passes through the preset itself, near its own slider setting.
      const base = gn.presetWt(data, p)[k], i = Math.round((base / data.sliders[k]) * (data.steps - 1));
      if (i < sw.T3.length) assert.ok(Math.abs(sw.T3[i] - data.named[p.id].T3) < 25, `${p.id} ${k} ${sw.T3[i]} vs ${data.named[p.id].T3}`);
    }
  }
  assert.ok(data.additivity.T3.median < 25, `summed changes miss GlassNet by ${data.additivity.T3.median} °C`);
});
