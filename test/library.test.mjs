import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceStatus, validateLibrary, KINDS } from '../src/scripts/library.js';

const root = new URL('../', import.meta.url);
const read = (file) => { try { return readFileSync(new URL(file, root), 'utf8'); } catch { return null; } };
const lib = JSON.parse(read('src/data/library.json'));

test('the library file passes its own check against this tree', () => {
  assert.deepEqual(validateLibrary(lib, read), []);
});

test('a use found in its file is on the page; one on a PR waits; none at all is wanted', () => {
  const files = { 'a.js': '// Wyman, Sloan & Shirley' };
  const r = (f) => files[f] ?? null;
  assert.equal(sourceStatus({ usedBy: [{ file: 'a.js', find: 'Wyman', stage: 'engine' }] }, r).state, 'main');
  const pending = sourceStatus({ usedBy: [{ file: 'b.json', find: 'N-BK7', stage: 'prism', pr: 18 }, { file: 'c.js', find: 'x', stage: 'lehr', pr: 16 }] }, r);
  assert.equal(pending.state, 'pr');
  assert.deepEqual(pending.prs, [16, 18]);
  assert.equal(sourceStatus({ usedBy: [] }, r).state, 'wanted');
  // A merged PR's file now carries the citation, so the same entry flips by itself.
  files['b.json'] = '"N-BK7"';
  assert.equal(sourceStatus({ usedBy: [{ file: 'b.json', find: 'N-BK7', stage: 'prism', pr: 18 }] }, r).state, 'main');
});

test('a claimed use that the code no longer cites fails the check', () => {
  const bad = { sources: [{ id: 'x', title: 't', by: 'b', date: '2000', url: 'https://example.org', provides: 'p', kind: 'datasheet', reuse: 'cite', license: 'l', checked: '2026-10-19',
    usedBy: [{ file: 'src/scripts/optics-core.js', find: 'no such citation', stage: 'engine' }] }], gaps: [] };
  assert.equal(validateLibrary(bad, read).length, 1);
});

test('every source names a known kind and every stage it uses is a known stage', () => {
  for (const s of lib.sources) {
    assert.ok(KINDS[s.kind], s.id);
    for (const u of s.usedBy ?? []) assert.ok(lib.stages[u.stage], `${s.id}: ${u.stage}`);
  }
});
