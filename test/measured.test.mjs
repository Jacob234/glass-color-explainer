import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as m from '../src/scripts/measured.js';
import * as b from '../src/scripts/batch.js';

const sg = JSON.parse(readFileSync(new URL('../public/data/sciglass/bench.json', import.meta.url), 'utf8'));

test('the extract carries its license and only the bench oxides', () => {
  assert.equal(sg.licence.name, 'ODbL 1.0');
  assert.match(sg.licence.notice, /SciGlass/);
  assert.deepEqual(sg.oxides, b.IDS);
  for (const g of sg.glasses.slice(0, 500)) {
    const s = g.mol.reduce((a, x) => a + x, 0);
    assert.ok(Math.abs(s - 100) < 0.1, `${g.id} sums to ${s}`);
    assert.ok(sg.sources[String(g.src)], `${g.id} has a source`);
  }
});

test('nearest finds a glass at its own composition first', () => {
  const g = sg.glasses.find((x) => x.visc);
  const near = m.nearest(m.molOf(g, sg.oxides), sg, { has: ['visc'] });
  assert.ok(near.length >= 1 && near[0].d < 0.05);
  for (let i = 1; i < near.length; i++) assert.ok(Math.round(near[i].d * 20) >= Math.round(near[i - 1].d * 20));
  assert.ok(near.every((x) => x.d <= 3 && x.visc));
});

test('NBS 710 sits on its own measured curve: Napolitano and Hawkins 1964 within 10 °C from melt to 10¹¹ Pa·s', () => {
  const near = m.nearest(b.PRESET.nbs710.mol, sg, { has: ['visc'], within: 0.05, k: 20 });
  const nh = near.find((g) => /^Napolitano and Hawkins 1964/.test(m.cite(sg, g)));
  assert.ok(nh, 'the NBS paper is in the extract');
  const gaps = m.viscGaps(nh, b.viscosity(m.molOf(nh, sg.oxides))).filter((x) => x.L <= 11);
  assert.ok(gaps.length >= 8);
  for (const x of gaps) assert.ok(Math.abs(x.gap) < 10, `10^${x.L} Pa·s: ${x.gap.toFixed(1)} °C`);
});

test('the model stays near the measured soda-lime melts', () => {
  const gaps = [];
  for (const g of sg.glasses) {
    const c = m.molOf(g, sg.oxides);
    if (!g.visc || c.PbO > 1 || c.B2O3 > 1 || c.Al2O3 > 3 || c.CaO + c.MgO < 3 || c.Na2O + c.K2O < 5) continue;
    for (const x of m.viscGaps(g, b.viscosity(c))) if (Number.isFinite(x.gap)) gaps.push(Math.abs(x.gap));
  }
  gaps.sort((p, q) => p - q);
  assert.ok(gaps.length > 5000);
  assert.ok(gaps[Math.floor(gaps.length / 2)] < 15, `median ${gaps[Math.floor(gaps.length / 2)]}`);
});

test('a lead crystal batch has no bench-only melt within 3 mol%', () => {
  assert.equal(m.nearest(b.PRESET.lead.mol, sg, { has: ['visc'] }).length, 0);
});
