import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as net from '../src/scripts/network.js';

// Ideal β-cristobalite: Si on a diamond lattice (a = 7.16 Å), O midway along every Si–Si link.
function cristobalite(cells = 2, a = 7.16) {
  const fcc = [[0, 0, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.5, 0.5, 0]];
  const arms = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const type = [], x = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) for (let k = 0; k < cells; k++) for (const f of fcc) {
    const A = [(i + f[0]) * a, (j + f[1]) * a, (k + f[2]) * a];
    type.push(net.SI, net.SI); x.push(...A, ...A.map((v) => v + a / 4));
    for (const d of arms) { type.push(net.O); x.push(...A.map((v, c) => v + (d[c] * a) / 8)); }
  }
  const L = cells * a;
  return { n: type.length, type: Uint8Array.from(type), x: Float64Array.from(x, (v) => ((v % L) + L) % L), L: [L, L, L] };
}

test('β-cristobalite: every Si is Q⁴, every O bridges at 180°, and every ring has six tetrahedra', () => {
  const s = cristobalite();
  const sum = net.summarize(s);
  assert.equal(sum.atoms.Si, 64);
  assert.equal(sum.atoms.O, 128);
  assert.deepEqual(sum.qn, [0, 0, 0, 0, 1]);
  assert.equal(sum.bo, 1);
  assert.ok(Math.abs(sum.angle.mean - 180) < 1e-6);
  assert.deepEqual(Object.keys(sum.rings), ['6']);
  assert.ok(Math.abs(sum.density - 2.18) < 0.03, `density ${sum.density}`); // 8 SiO₂ in a 7.16 Å cube
});

test('a lone pyrosilicate (Si₂O₇) unit: two Q¹ silicons, one bridging and six non-bridging oxygens', () => {
  const type = [net.SI, net.SI, net.O], x = [10, 10, 10, 13.2, 10, 10, 11.6, 10, 10];
  for (const [si, sgn] of [[0, -1], [3, 1]]) for (const d of [[sgn * 0.53, 1.5, 0], [sgn * 0.53, -0.75, 1.3], [sgn * 0.53, -0.75, -1.3]]) {
    type.push(net.O); x.push(x[si] + d[0], 10 + d[1], 10 + d[2]);
  }
  const s = { n: type.length, type: Uint8Array.from(type), x: Float64Array.from(x), L: [20, 20, 20] };
  const sum = net.summarize(s);
  assert.deepEqual(sum.qn, [0, 1, 0, 0, 0]);
  assert.equal(Math.round(sum.nbo * 7), 6);
  assert.deepEqual(sum.rings, {});
});

test('the binary model: Na₂O·3SiO₂ is two thirds Q³, one third Q⁴; the disilicate is all Q³', () => {
  const q = net.binaryQn(0.25);
  assert.ok(Math.abs(q[3] - 2 / 3) < 1e-9 && Math.abs(q[4] - 1 / 3) < 1e-9);
  assert.deepEqual(net.binaryQn(0), [0, 0, 0, 0, 1]);
  assert.ok(Math.abs(net.binaryQn(1 / 3)[3] - 1) < 1e-9);
});

test('the shipped glasses are what their labels say', () => {
  const dir = new URL('../src/data/glass3d/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const d = JSON.parse(readFileSync(new URL(f, dir)));
    const s = net.decode(d);
    const sum = net.summarize(s);
    // charge balance: 2 O per Si plus one per two Na
    assert.equal(sum.atoms.O, 2 * sum.atoms.Si + sum.atoms.Na / 2, f);
    // a sound glass: almost every Si four-coordinated, density near the measured one
    assert.ok(sum.siCoord[4] > 0.97, `${f}: ${JSON.stringify(sum.siCoord)}`);
    assert.ok(Math.abs(sum.density - d.measured.density) < 0.15, `${f}: ${sum.density}`);
  }
});

test('the statistics in glass3d.json are what network.js computes from the shipped positions', () => {
  const index = JSON.parse(readFileSync(new URL('../src/data/glass3d.json', import.meta.url)));
  for (const run of index.runs) {
    const d = JSON.parse(readFileSync(new URL(`../src/data/glass3d/${run.id}.json`, import.meta.url)));
    const sum = net.summarize(net.decode(d));
    assert.ok(Math.abs(sum.density - run.summary.density) < 1e-3, run.id);
    sum.qn.forEach((q, n) => assert.ok(Math.abs(q - run.summary.qn[n]) < 1e-3, `${run.id} Q${n}`));
    for (const [k, v] of Object.entries(run.summary.rings)) assert.ok(Math.abs(sum.rings[k] - v) < 1e-3, `${run.id} ${k}-rings`);
  }
});
