// scripts/check_library.mjs — the datasheet library (src/data/library.json) is well formed, and
// every use it claims without a PR number is really cited by that file on this tree.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLibrary } from '../src/scripts/library.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => { try { return readFileSync(join(root, file), 'utf8'); } catch { return null; } };
const lib = JSON.parse(read('src/data/library.json'));
const errors = validateLibrary(lib, read);
if (errors.length) {
  console.error(`library.json: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`library.json ok: ${lib.sources.length} sources, ${lib.gaps.length} gaps`);
