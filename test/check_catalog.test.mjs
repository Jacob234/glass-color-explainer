import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../scripts/check_catalog.mjs';

const optics = {
  colorants: [
    { id: 'cobalt', group: 'ions' },
    { id: 'gold-colloid', group: 'colloids' },
    { id: 'cdse', group: 'bandgap' },
  ],
};
const map = { mechanisms: [{ id: 'ions' }, { id: 'colloids' }, { id: 'bandgap' }, { id: 'structure' }] };

function goodEntry(over = {}) {
  return {
    name: 'Deep Cobalt Blue', code: '000114', supplier: 'Bullseye Glass', coe: 90,
    form: ['sheet', 'frit'], opacity: 'transparent', family: 'blue',
    colorant: ['cobalt'], mechanism: 'ions', colorantConfidence: 'high',
    colorantSource: 'name-rule', colorantNote: 'rule cobalt-explicit',
    swatchHex: '#11227a', swatchSource: 'image-sample', swatchCaveat: true,
    url: 'https://example.com/p', imageUrl: 'https://example.com/i.jpg', sourceRetailer: null,
    ...over,
  };
}

function makeCatalog(products) {
  const index = {
    catalogVersion: '0.1.0',
    vocabSnapshot: { colorants: ['cdse', 'cobalt', 'gold-colloid'], mechanisms: ['ions', 'colloids', 'bandgap', 'structure'] },
    suppliers: [{ id: 'bullseye', file: 'bullseye.json', supplier: 'Bullseye Glass', coe: 90, productCount: products.length }],
    totals: { products: products.length, withColorant: 0, withSwatch: 0 },
  };
  return { index, supplierFiles: { 'bullseye.json': { products } } };
}

test('valid catalog produces no errors', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry()]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.deepEqual(errors, []);
});

test('unknown colorant id is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry({ colorant: ['unobtainium'], mechanism: 'unknown' })]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('unobtainium')));
});

test('mechanism not matching derived value is an error', () => {
  // cobalt -> ions; claiming bandgap must fail
  const { index, supplierFiles } = makeCatalog([goodEntry({ mechanism: 'bandgap' })]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('derived')));
});

test('empty colorant on opal is unknown, not structure', () => {
  const e = goodEntry({ colorant: [], opacity: 'opal', family: 'yellow', mechanism: 'structure', colorantConfidence: 'unknown' });
  const { index, supplierFiles } = makeCatalog([e]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('derived "unknown"')));
});

test('bad coe is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry({ coe: 77 })]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('coe')));
});

test('bad swatchHex is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry({ swatchHex: 'blue' })]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('swatchHex')));
});

test('bad family enum is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry({ family: 'puce' })]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('family')));
});

test('productCount mismatch is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry()]);
  index.suppliers[0].productCount = 99;
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('productCount')));
});

test('duplicate identity key is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry(), goodEntry({ name: 'Dupe code' })]);
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('duplicate identity key')));
});

test('stale vocabSnapshot is an error', () => {
  const { index, supplierFiles } = makeCatalog([goodEntry()]);
  index.vocabSnapshot.colorants = ['cobalt']; // drifted from optics
  const { errors } = validateCatalog(index, supplierFiles, optics, map);
  assert.ok(errors.some((e) => e.includes('vocabSnapshot')));
});

test('unknown colorant produces a warning, not an error', () => {
  const e = goodEntry({ colorant: [], mechanism: 'unknown', colorantConfidence: 'unknown' });
  const { index, supplierFiles } = makeCatalog([e]);
  const { errors, warnings } = validateCatalog(index, supplierFiles, optics, map);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('colorant unknown')));
});
