// scripts/build_measured.mjs — fold src/data/measured.json into src/data/optics.json.
// For each measured colorant: settle its reference amount, then write its 25 nm absorptance curve
// and its `basis` into optics.json, so islands that read the coarse curves see the measurement too.
//
// The reference amount (c = 1) is the amount whose daylight colour comes closest (CIEDE2000) to the
// colour the drawn curve gave at c = 1, so recipes, the mixing lab and the rack fitter keep their
// scale, and what difference is left comes from the shape of the measured curve. `match` records
// that target colour, read once from the drawn curve. A 'bands' entry's amount is rounded to two
// significant figures and kept as a stated physical amount; a 'digitised' entry's scale is kept as
// computed (its units are arbitrary).
// Run: node scripts/build_measured.mjs [--check]   (--check: fail if optics.json is out of date)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (f) => join(root, f);
const optics = JSON.parse(readFileSync(path('src/data/optics.json'), 'utf8'));
const measured = JSON.parse(readFileSync(path('src/data/measured.json'), 'utf8'));
const check = process.argv.includes('--check');

const s = await import('../src/scripts/spectra.js');
const m = await import('../src/scripts/measured.js');
const DAY = s.toGrid(optics.wavelengths, optics.illuminants.find((i) => i.id === 'daylight').spd);
const f = await import('../src/scripts/fit.js');
const lin = (dens) => s.spectrumColor(s.transmission([[dens, 1]]), DAY).lin;
const sig2 = (x) => Number(x.toPrecision(2));

let changed = false;
for (const [id, e] of Object.entries(measured.colorants)) {
  const c = optics.colorants.find((x) => x.id === id);
  if (!c) throw new Error(`measured colorant ${id} is not in optics.json`);
  if (e.match === undefined) {
    if (c.basis) throw new Error(`${id}: match missing but optics.json already carries the measured curve`);
    e.match = f.linToHex(lin(s.colorantDensity(c, optics.wavelengths)));
    changed = true;
  }
  const unit = m.unitDensity(id), dens = (k) => s.GRID.map((w) => k * unit(w));
  if ((e.kind === 'bands' ? e.amount : e.scale) === undefined) {
    const target = f.hexToLab(e.match), err = (x) => f.deltaE00(target, f.linToLab(lin(dens(Math.exp(x)))));
    let a = Math.log(1e-3), b = Math.log(100); // golden-section search on log(amount)
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 90; i++) { const x1 = b - g * (b - a), x2 = a + g * (b - a); if (err(x1) < err(x2)) b = x2; else a = x1; }
    const k = Math.exp((a + b) / 2);
    if (e.kind === 'bands') e.amount = sig2(k); else e.scale = Number(k.toFixed(3));
    changed = true;
  }
  const k = e.kind === 'bands' ? e.amount : e.scale;
  const coarse = optics.wavelengths.map((w) => Number((1 - 10 ** -(k * unit(w))).toFixed(3)));
  const basis = e.kind === 'bands' ? 'measured' : 'measured-shape';
  if (JSON.stringify(c.absorbance) !== JSON.stringify(coarse) || c.basis !== basis || c.source !== e.source) {
    c.absorbance = coarse; c.basis = basis; c.source = e.source;
    changed = true;
  }
}
for (const c of optics.colorants) if (!measured.colorants[c.id] && c.basis !== 'illustrative') { c.basis = 'illustrative'; changed = true; }

if (check) {
  if (changed) { console.error('optics.json or measured.json is out of date: run node scripts/build_measured.mjs'); process.exit(1); }
  console.log('measured.json and optics.json agree');
} else if (changed) {
  // Edit both files in place, line by line, to keep their hand-formatted layout (one colorant a line).
  let o = readFileSync(path('src/data/optics.json'), 'utf8');
  for (const c of optics.colorants) {
    const head = new RegExp(`(\\{ "id": "${c.id}", "label": "[^"]*",)( "basis": "[^"]*",)?( "source": "[^"]*",)?`);
    o = o.replace(head, `$1 "basis": "${c.basis}",${c.source ? ` "source": "${c.source}",` : ''}`);
    if (!measured.colorants[c.id]) continue;
    const at = o.indexOf(`"id": "${c.id}"`), a = o.indexOf('"absorbance": [', at), z = o.indexOf(']', a);
    o = o.slice(0, a) + `"absorbance": [${c.absorbance.join(', ')}` + o.slice(z);
  }
  writeFileSync(path('src/data/optics.json'), o);
  let t = readFileSync(path('src/data/measured.json'), 'utf8');
  for (const [id, e] of Object.entries(measured.colorants)) {
    const head = new RegExp(`("${id}": \\{\\s*"kind": "[^"]*", "source": "[^"]*",)( "match": "#[0-9a-f]+",)?( "(?:amount|scale)": [\\d.e-]+,)?`);
    t = t.replace(head, `$1 "match": "${e.match}", "${e.kind === 'bands' ? 'amount' : 'scale'}": ${e.kind === 'bands' ? e.amount : e.scale},`);
  }
  writeFileSync(path('src/data/measured.json'), t);
  console.log('wrote optics.json and measured.json');
} else console.log('nothing to do');
