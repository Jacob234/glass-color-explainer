// scripts/check_catalog.mjs — referential-integrity validator for src/data/catalog/*.json
// Sibling of check_data.mjs: same zero-dep Node ESM shape, same `validate*` + script-mode guard.
// The catalog is a STANDALONE dataset that links back to the science by colorant id, so this
// gate guarantees it can never drift from optics.json / map.json.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- controlled vocabularies (mirror tools/catalog-sweep/catalog_sweep/classify.py) ---
const FORMS = new Set(['sheet', 'rod', 'stringer', 'frit', 'powder', 'billet', 'confetti', 'noodle', 'tube', 'enamel', 'paint', 'stain', 'sample']);
const OPACITIES = new Set(['transparent', 'translucent', 'opal', 'opalescent', 'streaky', 'wispy', 'dichroic', 'metallic', 'unknown']);
const FAMILIES = new Set(['blue', 'green', 'red', 'orange', 'amber', 'yellow', 'purple', 'pink', 'neutral/clear', 'white/opal', 'black', 'brown', 'gray', 'multi/streaky', 'metallic/dichroic']);
const SWATCH_SOURCES = new Set(['css', 'image-sample', 'manual', 'none']);
const CONFIDENCES = new Set(['high', 'medium', 'low', 'unknown']);
const COLORANT_SOURCES = new Set(['supplier-stated', 'name-rule', 'manual', 'inferred-family']);
const COES = new Set([33, 90, 96, 104, 120]);
const HEX = /^#[0-9a-f]{6}$/i;

// Must mirror classify.derive_mechanism — mechanism follows the chromophore, not the texture.
function deriveMechanism(colorant, opacity, family, groups) {
  if (colorant.length) {
    const gset = new Set(colorant.map((c) => groups[c]).filter(Boolean));
    if (gset.size === 1) return [...gset][0];
    if (gset.size > 1) return 'mixed';
    return 'unknown';
  }
  if (opacity === 'dichroic' || family === 'white/opal' || family === 'metallic/dichroic') return 'structure';
  return 'unknown';
}

export function validateCatalog(index, supplierFiles, optics, map) {
  const errors = [];
  const warnings = [];

  const colorantIds = new Set(optics.colorants.map((c) => c.id));
  const groups = Object.fromEntries(optics.colorants.map((c) => [c.id, c.group]));
  const mechanismIds = new Set(map.mechanisms.map((m) => m.id)); // ions/colloids/bandgap/structure
  const allowedMechanisms = new Set([...mechanismIds, 'mixed', 'unknown']);

  // --- index.vocabSnapshot must match the live science vocabulary ---
  const liveColorants = [...colorantIds].sort();
  const snapColorants = [...(index.vocabSnapshot?.colorants || [])].sort();
  if (JSON.stringify(liveColorants) !== JSON.stringify(snapColorants)) {
    errors.push('index.vocabSnapshot.colorants does not match optics.colorants ids — re-run the sweep (stale vocabulary)');
  }
  const liveMech = [...mechanismIds];
  if (JSON.stringify(liveMech) !== JSON.stringify(index.vocabSnapshot?.mechanisms || [])) {
    errors.push('index.vocabSnapshot.mechanisms does not match map.mechanisms ids — re-run the sweep (stale vocabulary)');
  }

  // --- per-supplier files ---
  const seenKeys = new Set();
  let totalProducts = 0;
  for (const s of index.suppliers || []) {
    const file = supplierFiles[s.file];
    if (!file) {
      errors.push(`index references supplier file "${s.file}" that was not found/loaded`);
      continue;
    }
    const products = file.products || [];
    if (s.productCount !== products.length) {
      errors.push(`index.suppliers["${s.id}"].productCount=${s.productCount} != ${products.length} products in ${s.file}`);
    }
    totalProducts += products.length;

    for (const p of products) {
      const where = `${s.file} "${p.name ?? p.code ?? '?'}"`;

      // identity / required
      if (!p.name) errors.push(`${where}: missing name`);
      if (!p.supplier) errors.push(`${where}: missing supplier`);
      if (!p.url) errors.push(`${where}: missing url`);
      if (!p.code) errors.push(`${where}: missing code`);
      const key = `${p.supplier}:${p.code}`;
      if (seenKeys.has(key)) errors.push(`${where}: duplicate identity key "${key}"`);
      seenKeys.add(key);

      // enums
      if (!(p.coe === null || COES.has(p.coe))) errors.push(`${where}: coe ${p.coe} not in {33,90,96,104,120,null}`);
      if (!Array.isArray(p.form) || p.form.length === 0) errors.push(`${where}: form must be a non-empty array`);
      else for (const f of p.form) if (!FORMS.has(f)) errors.push(`${where}: form "${f}" not in enum`);
      if (!OPACITIES.has(p.opacity)) errors.push(`${where}: opacity "${p.opacity}" not in enum`);
      if (!FAMILIES.has(p.family)) errors.push(`${where}: family "${p.family}" not in enum`);

      // chemistry link
      if (!Array.isArray(p.colorant)) errors.push(`${where}: colorant must be an array`);
      else for (const c of p.colorant) if (!colorantIds.has(c)) errors.push(`${where}: colorant id "${c}" not in optics.colorants`);
      if (!allowedMechanisms.has(p.mechanism)) errors.push(`${where}: mechanism "${p.mechanism}" not in {${[...allowedMechanisms].join(',')}}`);
      const derived = deriveMechanism(p.colorant || [], p.opacity, p.family, groups);
      if (p.mechanism !== derived) errors.push(`${where}: mechanism "${p.mechanism}" != derived "${derived}" (must follow colorant/opacity/family)`);
      if (!CONFIDENCES.has(p.colorantConfidence)) errors.push(`${where}: colorantConfidence "${p.colorantConfidence}" not in enum`);
      if (!COLORANT_SOURCES.has(p.colorantSource)) errors.push(`${where}: colorantSource "${p.colorantSource}" not in enum`);

      // swatch
      if (!(p.swatchHex === null || HEX.test(p.swatchHex))) errors.push(`${where}: swatchHex "${p.swatchHex}" is not #rrggbb or null`);
      if (!SWATCH_SOURCES.has(p.swatchSource)) errors.push(`${where}: swatchSource "${p.swatchSource}" not in enum`);
      if (p.swatchHex && p.swatchSource === 'none') errors.push(`${where}: swatchHex set but swatchSource is "none"`);
      if (typeof p.swatchCaveat !== 'boolean') errors.push(`${where}: swatchCaveat must be boolean`);

      // warnings (do not fail the build) — the curation backlog
      if ((p.colorant || []).length === 0) warnings.push(`${where}: colorant unknown`);
      if (p.swatchHex === null) warnings.push(`${where}: no swatch`);
    }
  }

  if (index.totals && index.totals.products !== totalProducts) {
    errors.push(`index.totals.products=${index.totals.products} != ${totalProducts} actual`);
  }

  return { errors, warnings };
}

// --- script mode ---
const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(here, '..');
  const catalogDir = join(root, 'src/data/catalog');
  if (!existsSync(join(catalogDir, 'index.json'))) {
    console.log('check_catalog: SKIP (no src/data/catalog/index.json yet)');
    process.exit(0);
  }
  const optics = JSON.parse(readFileSync(join(root, 'src/data/optics.json'), 'utf8'));
  const map = JSON.parse(readFileSync(join(root, 'src/data/map.json'), 'utf8'));
  const index = JSON.parse(readFileSync(join(catalogDir, 'index.json'), 'utf8'));
  const supplierFiles = {};
  for (const f of readdirSync(catalogDir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    supplierFiles[f] = JSON.parse(readFileSync(join(catalogDir, f), 'utf8'));
  }
  // orphan check: every supplier file must be referenced by the index
  const referenced = new Set((index.suppliers || []).map((s) => s.file));
  for (const f of Object.keys(supplierFiles)) {
    if (!referenced.has(f)) console.error(`check_catalog: WARN orphan file ${f} not in index.json`);
  }
  const { errors, warnings } = validateCatalog(index, supplierFiles, optics, map);
  if (warnings.length) console.error(`check_catalog: ${warnings.length} warning(s) (colorant/swatch curation backlog)`);
  if (errors.length) {
    console.error('check_catalog: FAIL');
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }
  console.log(`check_catalog: OK (${index.totals?.products ?? '?'} colors, ${warnings.length} warnings)`);
}
