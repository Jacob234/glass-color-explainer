// The concept graph (src/data/concepts.json) has to be a real prerequisite graph and agree with the
// lessons and labs that claim to teach it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const graph = read('../src/data/concepts.json');
const lessons = read('../src/data/lessons.json').lessons;
const by = Object.fromEntries(graph.concepts.map((c) => [c.id, c]));
const domains = new Set(graph.domains.map((d) => d.id));

test('concept ids are unique and each sits in a known domain', () => {
  assert.equal(Object.keys(by).length, graph.concepts.length);
  for (const c of graph.concepts) {
    assert.ok(domains.has(c.domain), `${c.id}: domain ${c.domain}`);
    assert.ok(c.id.startsWith(c.domain), `${c.id}: id does not start with its domain`);
    assert.ok(['covered', 'partial', 'none'].includes(c.coverage), `${c.id}: coverage ${c.coverage}`);
  }
});

test('prerequisites exist and form no cycle', () => {
  const done = new Set();
  const visit = (id, path) => {
    assert.ok(by[id], `unknown concept ${id} (from ${path.at(-1)})`);
    assert.ok(!path.includes(id), `cycle: ${[...path, id].join(' → ')}`);
    if (done.has(id)) return;
    for (const r of by[id].requires) visit(r, [...path, id]);
    done.add(id);
  };
  for (const c of graph.concepts) visit(c.id, []);
});

test('coverage matches where the site teaches it', () => {
  const lessonIds = new Set(lessons.map((l) => l.id));
  for (const c of graph.concepts) {
    for (const l of c.taughtBy ?? []) assert.ok(lessonIds.has(l), `${c.id}: unknown lesson ${l}`);
    for (const lab of c.labs ?? []) assert.ok(existsSync(new URL(`../src/pages/${lab}.astro`, import.meta.url)), `${c.id}: no lab page ${lab}`);
    const home = (c.taughtBy?.length ?? 0) + (c.labs?.length ?? 0) + (c.also ? 1 : 0);
    if (c.coverage === 'none') assert.equal(home, 0, `${c.id}: marked none but taught somewhere`);
    else assert.ok(home > 0, `${c.id}: marked ${c.coverage} but taught nowhere`);
  }
});

test('every lesson on the walk teaches at least one concept', () => {
  const taught = new Set(graph.concepts.flatMap((c) => c.taughtBy ?? []));
  for (const l of lessons) assert.ok(taught.has(l.id), `${l.id} maps to no concept`);
});
