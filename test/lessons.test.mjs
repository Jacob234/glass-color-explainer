// The lesson registry drives the walk, the chapters and the atlas, so it has to agree with itself
// and with the stages that are actually on the home page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/lessons.json', import.meta.url)));
const ids = data.lessons.map((l) => l.id);
const steps = new Set(data.steps.map((s) => s.id));
const strands = new Set(data.strands.map((s) => s.id));
const components = readdirSync(new URL('../src/components/', import.meta.url))
  .filter((f) => f.endsWith('.astro'))
  .map((f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), 'utf8'))
  .join('\n');

test('lesson ids are unique and each is a stage section on the walk', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(components, new RegExp(`<section class="wrap stage[^"]*" id="${id}"`), id);
});

test('every lesson names a known step and strands, in walk order of steps', () => {
  const order = data.steps.map((s) => s.id);
  let last = 0;
  for (const l of data.lessons) {
    assert.ok(steps.has(l.step), `${l.id}: step ${l.step}`);
    assert.ok(l.strands.length > 0, `${l.id}: no strand`);
    for (const s of l.strands) assert.ok(strands.has(s), `${l.id}: strand ${s}`);
    const at = order.indexOf(l.step);
    assert.ok(at >= last, `${l.id} breaks studio order`);
    last = at;
  }
});

test('builds-on points at real lessons and has no cycles', () => {
  const by = Object.fromEntries(data.lessons.map((l) => [l.id, l]));
  const seen = new Set();
  const visit = (id, path) => {
    assert.ok(by[id], `unknown lesson ${id}`);
    assert.ok(!path.includes(id), `cycle: ${[...path, id].join(' → ')}`);
    if (seen.has(id)) return;
    for (const p of by[id].buildsOn) visit(p, [...path, id]);
    seen.add(id);
  };
  for (const id of ids) visit(id, []);
});

test('chapters are unique and carry recall prompts', () => {
  const chapters = data.lessons.filter((l) => l.chapter);
  assert.equal(new Set(chapters.map((l) => l.chapter)).size, chapters.length);
  for (const l of chapters) {
    assert.ok((l.recall ?? []).length >= 3, `${l.id}: needs at least three recall prompts`);
    for (const r of l.recall) assert.ok(r.q.trim() && r.a.trim(), `${l.id}: empty prompt`);
  }
});
