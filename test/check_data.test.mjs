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

test('valid islands object produces no errors', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const goodIslands = {
    spectrum: { 'page-a': 'cobalt' },
    striking: { 'page-a': 'gold' },
    alexandrite: [],
    lycurgus: [],
  };
  const { errors } = validate(goodMap, goodOptics, dir, goodIslands);
  assert.deepEqual(errors, []);
});

test('typo in islands spectrum colorant id is an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const badIslands = {
    spectrum: { 'page-a': 'cobalt,TYPO-ID' },
    striking: {},
    alexandrite: [],
    lycurgus: [],
  };
  const { errors } = validate(goodMap, goodOptics, dir, badIslands);
  assert.ok(errors.some((e) => e.includes('TYPO-ID')));
});

const goodRecipe = {
  id: 'r1', label: 'L', story: 'S',
  melt: [{ colorant: 'cobalt', c: 0.5 }],
};

function opticsWithRecipes(recipes) {
  return { ...structuredClone(goodOptics), recipes };
}

test('valid recipes produce no errors', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const { errors } = validate(goodMap, opticsWithRecipes([goodRecipe]), dir);
  assert.deepEqual(errors, []);
});

test('recipe referencing unknown colorant is an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const r = structuredClone(goodRecipe);
  r.melt[0].colorant = 'unobtainium';
  const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
  assert.ok(errors.some((e) => e.includes('unobtainium')));
});

test('recipe concentration must be in (0,1]', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  for (const bad of [0, -0.1, 1.5]) {
    const r = structuredClone(goodRecipe);
    r.melt[0].c = bad;
    const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
    assert.ok(errors.some((e) => e.includes('r1')), `c=${bad} should be rejected`);
  }
});

test('recipe melt must contain 1-4 components', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const empty = structuredClone(goodRecipe);
  empty.melt = [];
  const five = structuredClone(goodRecipe);
  five.melt = Array.from({ length: 5 }, () => ({ colorant: 'cobalt', c: 0.5 }));
  for (const r of [empty, five]) {
    const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
    assert.ok(errors.some((e) => e.includes('1-4')));
  }
});

test('duplicate recipe ids are an error', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const { errors } = validate(goodMap, opticsWithRecipes([goodRecipe, structuredClone(goodRecipe)]), dir);
  assert.ok(errors.some((e) => e.includes('duplicate')));
});

test('recipe label and story must be non-empty', () => {
  const dir = makeContentDir({ 'page-a': goodPage });
  const noLabel = structuredClone(goodRecipe);
  noLabel.label = '';
  const noStory = structuredClone(goodRecipe);
  noStory.story = '';
  for (const r of [noLabel, noStory]) {
    const { errors } = validate(goodMap, opticsWithRecipes([r]), dir);
    assert.ok(errors.some((e) => e.includes('r1')));
  }
});
