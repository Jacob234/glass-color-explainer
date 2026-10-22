import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const history = JSON.parse(read('../src/data/history.json'));
const optics = JSON.parse(read('../src/data/optics.json'));
// the home page and the stage components it renders (lessons like ColorRod live in their own files)
const home = readdirSync(new URL('../src/components/', import.meta.url)).filter((f) => f.endsWith('.astro')).map((f) => read(`../src/components/${f}`)).join('\n');
const colorants = new Set(optics.colorants.map((c) => c.id));

test('history pins run oldest first with unique ids', () => {
  const ids = history.pins.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let i = 1; i < history.pins.length; i++) assert.ok(history.pins[i].year >= history.pins[i - 1].year, ids[i]);
});

test('every pin is colored by a known colorant, a dichroic angle or uranium, or says it cannot be', () => {
  for (const p of history.pins) {
    if (p.color === null) { assert.match(p.text, /cannot/, `${p.id} has no color and should say why`); continue; }
    if (p.color.uranium) { assert.equal(p.stage, 'showroom', p.id); continue; }
    if ('dichroic' in p.color) { assert.ok(p.color.dichroic >= 0 && p.color.dichroic <= 70, p.id); continue; }
    for (const [id, c] of p.color.parts) { assert.ok(colorants.has(id), `${p.id}: unknown colorant ${id}`); assert.ok(c > 0); }
  }
});

test('every pin links to a stage that exists on the home page, and cites a source', () => {
  for (const p of history.pins) {
    if (p.stage) assert.ok(home.includes(`id="${p.stage}"`), `${p.id}: no section #${p.stage}`);
    assert.ok(p.sources.length > 0, p.id);
    for (const [label, url] of p.sources) { assert.ok(label); assert.match(url, /^https:\/\//); }
  }
});
