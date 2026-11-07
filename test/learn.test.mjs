// Concept pages (src/data/learn/*.json) and the Beer–Lambert instrument behind concept E1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cobaltAt, molPerL, thicknessMm, amountOf } from '../src/scripts/learn.js';

const graph = JSON.parse(readFileSync(new URL('../src/data/concepts.json', import.meta.url)));
const ids = new Set(graph.concepts.map((c) => c.id));
const dir = new URL('../src/data/learn/', import.meta.url);
const pages = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir)))]);

test('each concept page names a concept and has complete blocks', () => {
  assert.ok(pages.length > 0);
  for (const [file, p] of pages) {
    assert.equal(file, `${p.id}.json`);
    assert.ok(ids.has(p.id), `${p.id} is not in concepts.json`);
    assert.ok(p.objectives.length && p.misconceptions.length && p.recall.length >= 3, `${p.id}: aims and recall`);
    const blockIds = p.blocks.map((b) => b.id);
    assert.equal(new Set(blockIds).size, blockIds.length);
    for (const b of p.blocks) {
      assert.ok(b.head && b.l1, `${p.id}/${b.id}: level 1 missing`);
      if (b.l2?.l3) assert.ok(b.l2.l3.head && b.l2.l3.html, `${p.id}/${b.id}: empty level 3`);
    }
  }
});

test('E1: the instrument obeys A = εcd with ε = 175 at 595 nm', () => {
  for (const [amount, mm] of [[1, 10], [0.5, 20], [2, 2.5], [3, 7]]) {
    const { A595, T } = cobaltAt(amount, mm);
    assert.ok(Math.abs(A595 - 175 * molPerL(amount) * (mm / 10)) < 1e-9);
    assert.ok(T.every((t) => t > 0 && t <= 1));
  }
  // doubling thickness squares the transmission at every wavelength
  const a = cobaltAt(1, 4).T, b = cobaltAt(1, 8).T;
  a.forEach((t, i) => assert.ok(Math.abs(t * t - b[i]) < 1e-12));
  // concentration and thickness trade one for one
  assert.equal(cobaltAt(2, 3).color, cobaltAt(1, 6).color);
  assert.ok(Math.abs(thicknessMm(50) - 5) < 1e-9 && Math.abs(amountOf(50) - 1) < 1e-9);
});

test('the instrument opens on the worked example (5 mm, ~0.016 mol/L, ~4%)', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../src/pages/learn/[id].astro', import.meta.url), 'utf8');
  const v = (id) => +page.match(new RegExp(`id="${id}"[^>]*value="(\\d+)"`))[1];
  const mm = thicknessMm(v('lt')), amount = amountOf(v('lc'));
  assert.ok(Math.abs(mm - 5) < 0.01, `default thickness ${mm}`);
  assert.ok(Math.abs(molPerL(amount) - 0.016) < 0.001, `default ${molPerL(amount)} mol/L`);
  const pass = 100 * 10 ** -cobaltAt(amount, mm).A595;
  assert.ok(pass > 3.5 && pass < 4.5, `default passes ${pass}%`);
});
