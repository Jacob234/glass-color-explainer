// scripts/check_data.mjs — referential-integrity validator for map.json + optics.json
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validate(map, optics, contentDir) {
  const errors = [];

  // --- content inventory: slugs + anchor ids per page ---
  const pages = new Map();
  for (const f of readdirSync(contentDir).filter((f) => f.endsWith('.md'))) {
    const slug = f.replace(/\.md$/, '');
    const raw = readFileSync(join(contentDir, f), 'utf8');
    const ids = new Set();
    // frontmatter artifact ids
    for (const m of raw.matchAll(/^\s+- id:\s*([\w-]+)\s*$/gm)) ids.add(m[1]);
    // auto-generated heading ids (## Some Heading -> some-heading)
    for (const m of raw.matchAll(/^#{2,4}\s+([^\n{]+?)\s*$/gm)) {
      ids.add(m[1].toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-'));
    }
    pages.set(slug, ids);
  }

  const checkLink = (where, targetSlug, anchor) => {
    if (!pages.has(targetSlug)) {
      errors.push(`${where}: targetSlug "${targetSlug}" does not resolve to a content page`);
      return;
    }
    if (anchor != null && !pages.get(targetSlug).has(anchor)) {
      errors.push(`${where}: anchor "${anchor}" not found in "${targetSlug}"`);
    }
  };

  // --- map.json ---
  checkLink('map.anchorSlug', map.anchorSlug, null);
  checkLink('map.crosscutting', map.crosscutting.slug, null);
  checkLink('map.craft', map.craft.slug, null);
  for (const mech of map.mechanisms) {
    for (const slug of mech.slugs) checkLink(`mechanism ${mech.id}`, slug, null);
    if (mech.anchorTarget) checkLink(`mechanism ${mech.id}.anchorTarget`, mech.anchorTarget.targetSlug, mech.anchorTarget.anchor);
    for (const a of mech.artifacts) checkLink(`artifact ${a.id}`, a.targetSlug, a.anchor);
  }

  // --- optics.json ---
  const n = optics.wavelengths.length;
  for (const c of optics.colorants) {
    if (c.absorbance.length !== n) errors.push(`colorant ${c.id}: absorbance has ${c.absorbance.length} points, expected ${n}`);
    if (c.absorbance.some((v) => v < 0 || v > 1)) errors.push(`colorant ${c.id}: absorbance values must be 0..1`);
  }
  for (const il of optics.illuminants) {
    if (il.spd.length !== n) errors.push(`illuminant ${il.id}: spd has ${il.spd.length} points, expected ${n}`);
  }
  for (const [name, seq] of Object.entries(optics.striking)) {
    if (!seq.length || (seq.length > 1 && (seq[0].t !== 0 || seq[seq.length - 1].t !== 1))) {
      errors.push(`striking ${name}: sequence must run t=0..1`);
    }
  }

  return { errors };
}

// --- script mode ---
const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(here, '..');
  const map = JSON.parse(readFileSync(join(root, 'src/data/map.json'), 'utf8'));
  const optics = JSON.parse(readFileSync(join(root, 'src/data/optics.json'), 'utf8'));
  const { errors } = validate(map, optics, join(root, 'src/content/concepts'));
  if (errors.length) {
    console.error('check_data: FAIL');
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }
  console.log('check_data: OK');
}
