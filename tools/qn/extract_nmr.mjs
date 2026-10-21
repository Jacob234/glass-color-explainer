// tools/qn/extract_nmr.mjs — reads the ²⁹Si NMR rows that ship with StatMechGlass and prints them in
// the form src/data/qn.json keeps (mol% oxide, then Q⁴…Q⁰ percent). Only the data files are read; no
// GPL code is copied. Rows after the first ten (soda) and nine (potash) are appended in the repo
// without a stated source and are dropped.
//
//   git clone https://github.com/OxideGlassGroupAAU/StatMechGlass   (commit daa70f2, 2021-10-06)
//   node tools/qn/extract_nmr.mjs path/to/StatMechGlass > nmr.json
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('usage: node tools/qn/extract_nmr.mjs <StatMechGlass clone>'); process.exit(1); }
const read = (name, keep) => readFileSync(join(root, 'src/StatMechGlass/Data/SiO2', name), 'utf8')
  .trim().split(/\r?\n/).slice(0, keep).map((line) => line.split(/[;,]/).map(Number));
console.log(JSON.stringify({ Na2O: read('Na.csv', 10), K2O: read('K.csv', 9) }));
