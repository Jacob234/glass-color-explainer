#!/usr/bin/env node
// Find where a sentence on the site lives in the source, the way edit mode does.
//   node scripts/find_copy.mjs "text as it reads on the page"
//   node scripts/find_copy.mjs --issue issue-body.md   (locate every edit in a copy-edit issue)
import { readFileSync } from 'node:fs';
import { buildCopyMap } from '../src/lib/copy-map.mjs';
import { locate, hintText, parseIssue } from '../src/scripts/copy-edits.js';

const args = process.argv.slice(2);
const map = buildCopyMap();
if (args[0] === '--issue') {
  const edits = parseIssue(readFileSync(args[1], 'utf8'));
  edits.forEach((e, i) => console.log(`${i + 1}. ${e.page}  ${hintText(locate(map, e.original))}\n   ${e.original.slice(0, 90)}`));
} else if (args.length) {
  console.log(hintText(locate(map, args.join(' '), 10)));
} else {
  console.error('usage: node scripts/find_copy.mjs "page text" | --issue body.md');
  process.exit(1);
}
