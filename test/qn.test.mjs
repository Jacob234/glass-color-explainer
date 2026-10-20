import test from 'node:test';
import assert from 'node:assert/strict';
import * as qn from '../src/scripts/qn.js';
import * as b from '../src/scripts/batch.js';

const sum = (Q) => Q.reduce((a, v) => a + v, 0);
const near = (a, e, tol, msg) => assert.ok(Math.abs(a - e) <= tol, `${msg ?? ''} ${a} vs ${e}`);

test('every model conserves silicons and the count of bridges', () => {
  for (const q of [0, 0.37, 1, 1.5, 2.2, 3.4]) {
    for (const Q of [qn.speciate(q, { Na: 1 }, 750), qn.speciate(q, { K: 0.4, Na: 0.6 }, 900), qn.random(q), qn.binary(q)]) {
      near(sum(Q), 1, 1e-9, 'shares sum to 1');
      near(qn.bridges(Q), 4 - q, 1e-6, 'bridges = 4 − NBO/Si');
      assert.ok(Q.every((v) => v >= -1e-12));
    }
  }
});

test('silica is all Q⁴; disilicate is all Q³ in the binary model', () => {
  assert.deepEqual(qn.speciate(0, { Na: 1 }, 800), [1, 0, 0, 0, 0]);
  assert.deepEqual(qn.binary(1), [0, 1, 0, 0, 0]);
  assert.deepEqual(qn.binary(2), [0, 0, 1, 0, 0]);
});

test('hot freezes random, cold freezes binary', () => {
  const q = 1, hot = qn.speciate(q, { Na: 1 }, 1e7), cold = qn.speciate(q, { Na: 1 }, 50);
  near(cold[1], 1, 0.02, 'cold disilicate is nearly all Q³');
  // At infinite T every species with bridges is drawn by its share alone (not by its bridge count),
  // so the limit is close to, not equal to, the binomial.
  assert.ok(hot[1] < 0.5 && hot[2] > 0.15, `hot ${hot}`);
});

test('the trajectory ends where speciate does', () => {
  const t = qn.trajectory(1.37, { Na: 1 }, 760);
  near(t.at(-1).x, 1.37, 1e-9);
  assert.deepEqual(t.at(-1).Q, qn.speciate(1.37, { Na: 1 }, 760));
});

test('with the paper\'s enthalpies and the bench\'s Tg the model follows the NMR it was fitted to', () => {
  for (const ox of ['Na2O', 'K2O']) {
    const sm = qn.nmrMiss(ox, 'sm'), rnd = qn.nmrMiss(ox, 'random'), bin = qn.nmrMiss(ox, 'binary');
    assert.ok(sm < 2, `${ox} statistical mechanics misses by ${sm}`);
    assert.ok(rnd > 10 && bin > 3, `${ox} random ${rnd}, binary ${bin}`);
    assert.ok(sm < bin && bin < rnd);
  }
});

test('alumina and boron take modifier before silicon does', () => {
  const T = 800;
  const plain = qn.network({ SiO2: 75, Na2O: 15, CaO: 10 }, T);
  near(plain.q, (2 * 25) / 75, 1e-9);
  const al = qn.network({ SiO2: 75, Na2O: 15, CaO: 10, Al2O3: 5 }, T);
  near(al.q, (2 * 20) / 75, 1e-9);
  near(al.toAl, 5, 1e-9);
  // Dell–Bray: K = 80/12, Rmax = 0.5 + K/16; 5 mol% Na₂O is below Rmax·B₂O₃, so silicon keeps every bridge
  const boro = qn.network({ SiO2: 80, B2O3: 12, Na2O: 5, Al2O3: 1 }, T);
  near(boro.q, 0, 1e-9);
  near(boro.N4, 4 / 12, 1e-9);
  const rich = qn.network({ SiO2: 60, B2O3: 10, Na2O: 30 }, T), Rmax = 0.5 + 6 / 16;
  near(rich.toB, Rmax * 10, 1e-9);
  near(rich.q, (2 * (30 - Rmax * 10)) / 60, 1e-9);
});

test('the presets: window glass about 0.8 NBO per silicon and mostly Q³; borosilicate fully bridged', () => {
  const w = qn.batchNetwork(b.PRESET.float.mol);
  near(w.q, 0.78, 0.02);
  assert.ok(w.Q[1] > w.Q[0] && w.Q[0] > w.Q[2], `${w.Q}`);
  near(w.Tf - 273.15, b.properties(b.PRESET.float.mol).annealing, 0.5, 'Tf is the annealing point');
  assert.ok(w.assumed > 0.4 && w.assumed < 0.6, 'lime and magnesia counted as soda');
  const boro = qn.batchNetwork(b.PRESET.boro.mol);
  near(boro.Q[0], 1, 1e-9);
  assert.ok(boro.N4 > 0.2 && boro.N4 < 0.3);
});

test('the binary series rises in alkali with Tg falling', () => {
  const s = qn.binarySeries('Na2O', 50, 5);
  assert.equal(s.length, 11);
  assert.ok(s.at(-1).Tf < s[2].Tf);
  near(s[0].sm[0], 1, 1e-12);
});
