import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validate } from '../scripts/check_data.mjs';

const goodOptics = {
  wavelengths: [380, 580, 780],
  colorants: [{ id: 'cobalt', label: 'Co', group: 'ions', why: 'w', absorbance: [0.1, 0.9, 0.1] }],
  illuminants: [{ id: 'daylight', label: 'D', spd: [1, 1, 1] }],
  striking: { gold: [{ t: 0, label: 'a', color: '#fff' }] },
};

function makeContentDir(pages) {
  const dir = mkdtempSync(join(tmpdir(), 'concepts-'));
  for (const [slug, body] of Object.entries(pages)) writeFileSync(join(dir, `${slug}.md`), body);
  return dir;
}

const goodPage = `---
title: t
mechanism: ions
summary: s
artifacts:
  - id: chartres-blue
    title: Chartres blue
---
### Chartres blue
`;

const goodMap = {
  title: 'x',
  anchorSlug: 'page-a',
  crosscutting: { slug: 'page-a', label: 'l' },
  craft: { slug: 'page-a', label: 'l' },
  mechanisms: [
    {
      id: 'ions', label: 'l', blurb: 'b', slugs: ['page-a'], theme: '#fff',
      artifacts: [{ id: 'a1', label: 'l', colorCss: 'red', targetSlug: 'page-a', anchor: 'chartres-blue' }],
    },
  ],
};

test('valid data produces no errors', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const { errors } = validate(goodMap, goodOptics, dir);
  assert.deepEqual(errors, []);
});

test('unresolved targetSlug is an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const badMap = structuredClone(goodMap);
  badMap.mechanisms[0].artifacts[0].targetSlug = 'missing-page';
  const { errors } = validate(badMap, goodOptics, dir);
  assert.ok(errors.some((e) => e.includes('missing-page')));
});

test('anchor missing from target page is an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const badMap = structuredClone(goodMap);
  badMap.mechanisms[0].artifacts[0].anchor = 'no-such-anchor';
  const { errors } = validate(badMap, goodOptics, dir);
  assert.ok(errors.some((e) => e.includes('no-such-anchor')));
});

test('absorbance length mismatch is an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const badOptics = structuredClone(goodOptics);
  badOptics.colorants[0].absorbance = [0.1];
  const { errors } = validate(goodMap, badOptics, dir);
  assert.ok(errors.some((e) => e.includes('cobalt')));
});

test('null anchor is allowed (links to page top)', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const m = structuredClone(goodMap);
  m.mechanisms[0].artifacts[0].anchor = null;
  const { errors } = validate(m, goodOptics, dir);
  assert.deepEqual(errors, []);
});
