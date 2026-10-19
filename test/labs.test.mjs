import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LABS, meltColor } from '../src/scripts/labs.js';

test('every lab in the index has a page', () => {
  for (const lab of LABS) assert.ok(existsSync(`src/pages/${lab.slug}.astro`), lab.slug);
});

test('every lab piece is a computed color, and an overlap is darker than either glass alone', () => {
  const rgb = (c) => c.match(/\d+/g).map(Number);
  for (const lab of LABS) assert.match(lab.color, /^rgb\(\d+, \d+, \d+\)$/, lab.slug);
  const mix = LABS.find((l) => l.overlap);
  const sum = (c) => rgb(c).reduce((a, b) => a + b, 0);
  assert.ok(sum(mix.overlap) < sum(mix.color) && sum(mix.overlap) < sum(mix.color2));
  assert.equal(meltColor([]), 'rgb(255, 255, 255)');
});
