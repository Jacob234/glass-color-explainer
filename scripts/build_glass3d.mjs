// scripts/build_glass3d.mjs — turn the LAMMPS quenches in scripts/md3d/out/ into the data the
// Network lab ships: one positions file per glass (src/data/glass3d/<id>.json) and an index with
// each run's settings, its cooling curve and its network statistics (src/data/glass3d.json).
// Usage: node scripts/build_glass3d.mjs [path/to/out]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as net from '../src/scripts/network.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? join(root, 'scripts/md3d/out');

// Measured room-temperature densities: medians of SciGlass entries for pure SiO₂ (258 glasses) and
// for Na₂O–SiO₂ binaries at 25 ± 0.5 mol% Na₂O (100 glasses; interquartile range 2.418–2.437).
const MEASURED = { silica: { density: 2.202 }, soda: { density: 2.430 } };

const RUNS = [
  { id: 'silica-fast', glass: 'silica', rate: 100, seed: 4127 },
  { id: 'silica-slow', glass: 'silica', rate: 10, seed: 4127 },
  { id: 'soda-fast', glass: 'soda', rate: 100, seed: 5231 },
  { id: 'soda-slow', glass: 'soda', rate: 10, seed: 5231 },
];

// LAMMPS write_data (atom_style charge): box bounds, then "id type q x y z [ix iy iz]".
function readData(text) {
  const lines = text.split('\n');
  const lo = [], hi = [];
  for (const l of lines) {
    const m = l.match(/^\s*(\S+)\s+(\S+)\s+([xyz])lo\s+[xyz]hi/);
    if (m) { lo.push(+m[1]); hi.push(+m[2]); }
  }
  const start = lines.findIndex((l) => l.startsWith('Atoms'));
  const atoms = [];
  for (let k = start + 2; k < lines.length; k++) {
    const f = lines[k].trim().split(/\s+/);
    if (f.length < 6) break;
    atoms.push({ id: +f[0], type: +f[1], x: [+f[3], +f[4], +f[5]] });
  }
  atoms.sort((a, b) => a.id - b.id);
  const L = hi.map((h, a) => h - lo[a]);
  // LAMMPS types 1 O, 2 Si, 3 Na → letters o, s, n; positions wrapped into [0, L) in 0.01 Å
  const types = atoms.map((a) => 'osn'[a.type - 1]).join('');
  const pos = atoms.flatMap((a) => a.x.map((v, c) => {
    const w = (((v - lo[c]) % L[c]) + L[c]) % L[c];
    return Math.round(w * 100) % Math.round(L[c] * 100);
  }));
  return { L: L.map((v) => +v.toFixed(3)), types, pos };
}

// fix ave/time output: "step temp density pe", one line per picosecond of the quench.
function readCooling(text, every) {
  const rows = text.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number));
  return rows.filter((_, i) => i % every === 0).map(([, T, rho]) => [Math.round(T), +rho.toFixed(4)]);
}

mkdirSync(join(root, 'src/data/glass3d'), { recursive: true });
const index = JSON.parse(readFileSync(join(root, 'src/data/glass3d.json'), 'utf8'));
for (const run of RUNS) {
  const d = { id: run.id, ...readData(readFileSync(join(out, `${run.id}.data`), 'utf8')), measured: MEASURED[run.glass] };
  writeFileSync(join(root, `src/data/glass3d/${run.id}.json`), JSON.stringify(d) + '\n');
  const sum = net.summarize(net.decode(d));
  const entry = index.runs.find((r) => r.id === run.id);
  Object.assign(entry, {
    rate: run.rate, seed: run.seed,
    cooling: readCooling(readFileSync(join(out, `${run.id}.cool.txt`), 'utf8'), run.rate >= 100 ? 1 : 5),
    summary: roundAll(sum),
  });
  console.log(run.id, sum.density.toFixed(3), 'g/cm³', sum.qn.map((q) => q.toFixed(3)).join(' '));
}
writeFileSync(join(root, 'src/data/glass3d.json'), JSON.stringify(index, null, 2) + '\n');

function roundAll(v) {
  if (typeof v === 'number') return +v.toFixed(4);
  if (Array.isArray(v)) return v.map(roundAll);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundAll(x)]));
  return v;
}
