import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTools, inCell, byJob } from '../src/scripts/tools.js';

const d = JSON.parse(readFileSync(new URL('../src/data/tools.json', import.meta.url), 'utf8'));

test('the tools map file is well formed', () => {
  assert.deepEqual(validateTools(d), []);
});

test('every tool lands in exactly one cell of the map', () => {
  const placed = d.jobs.flatMap((j) => d.routes.flatMap((r) => inCell(d, j.id, r.id)));
  assert.equal(placed.length, d.tools.length);
});

test('a tool with an unknown job, a plain-http link or a repeated id is caught', () => {
  const bad = structuredClone(d);
  bad.tools.push({ ...bad.tools[0] });
  bad.tools.push({ ...bad.tools[1], id: 'x', job: 'nope', url: 'http://example.org' });
  const errors = validateTools(bad);
  assert.ok(errors.some((e) => e.includes('repeated id')));
  assert.ok(errors.some((e) => e.includes('unknown job')));
  assert.ok(errors.some((e) => e.includes('https')));
});

test('the list for one job follows the order of the routes', () => {
  const order = d.routes.map((r) => r.id);
  for (const j of d.jobs) {
    const idx = byJob(d, j.id).map((t) => order.indexOf(t.route));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  }
});
