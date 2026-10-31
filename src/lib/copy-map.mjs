// Build-time map from page text to source lines, for edit mode's source hints.
// Served as /edit-map.json (src/pages/edit-map.json.ts), fetched only in edit mode,
// and read by scripts/find_copy.mjs when a thread applies a batch of edits.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { sourceText } from '../scripts/copy-edits.js';

// Everything that can put words on a page. The catalog and the 3D structures
// are data, not prose, and would triple the map.
const ROOTS = ['src/components', 'src/pages', 'src/layouts', 'src/content', 'src/data', 'src/scripts'];
const SKIP = ['src/data/catalog', 'src/data/glass3d'];
const KINDS = { '.astro': 'astro', '.svelte': 'astro', '.md': 'md', '.mdx': 'md', '.json': 'json', '.js': 'js', '.ts': 'js' };

function walk(dir, root, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = relative(root, full).split('\\').join('/');
    if (SKIP.some((s) => rel === s || rel.startsWith(`${s}/`))) continue;
    if (statSync(full).isDirectory()) walk(full, root, out);
    else if (KINDS[extname(name)]) out.push(rel);
  }
  return out;
}

export function buildCopyMap(root = process.cwd()) {
  const paths = ROOTS.flatMap((r) => { try { return walk(join(root, r), root, []); } catch { return []; } });
  const files = paths.map((path) => ({ path, ...sourceText(readFileSync(join(root, path), 'utf8'), KINDS[extname(path)]) }));
  return { files };
}
