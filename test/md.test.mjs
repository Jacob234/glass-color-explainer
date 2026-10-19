import test from 'node:test';
import assert from 'node:assert/strict';
import * as md from '../src/scripts/md.js';

const total = (s) => s.U + (s.n - 1) * md.kineticT(s);

// Melt at 1.4, cool at a steady rate to 0.1, settle, and report the ordered fraction.
function quenchRun(m, rate, seed) {
  const s = md.createSystem({ pairs: md.mismatch(m), seed, T: 1.4 });
  md.step(s, 3000);
  while (s.T > 0.1) md.cool(s, rate, 0.1, 50);
  md.step(s, 1000);
  return md.order(s).fraction;
}

test('without thermostat or barostat, velocity Verlet conserves energy and momentum', () => {
  const s = md.createSystem({ T: 1, P: null, seed: 2 });
  s.tauT = Infinity;
  md.step(s, 200);
  const e0 = total(s);
  md.step(s, 2000);
  assert.ok(Math.abs(total(s) - e0) / Math.abs(e0) < 0.01, `drift ${(total(s) - e0).toFixed(3)} from ${e0.toFixed(3)}`);
  let px = 0, py = 0;
  for (let i = 0; i < s.n; i++) { px += s.vx[i]; py += s.vy[i]; }
  assert.ok(Math.abs(px) < 1e-9 && Math.abs(py) < 1e-9);
});

test('thermostat and barostat hold the targets', () => {
  const s = md.createSystem({ T: 1, P: 5, seed: 4 });
  md.step(s, 3000);
  let T = 0, P = 0;
  for (let k = 0; k < 20; k++) { md.step(s, 50); T += md.kineticT(s) / 20; P += md.pressure(s) / 20; }
  assert.ok(Math.abs(T - 1) < 0.03, `T ${T}`);
  assert.ok(Math.abs(P - 5) < 0.3, `P ${P}`);
});

test('a dilute gas obeys the ideal gas law', () => {
  const s = md.createSystem({ n: 100, rho: 0.005, T: 1, P: null, seed: 1 });
  let P = 0;
  for (let k = 0; k < 20; k++) { md.step(s, 20); P += md.pressure(s) / 20; }
  const ideal = (s.n / (s.L * s.L)) * md.kineticT(s);
  assert.ok(Math.abs(P / ideal - 1) < 0.05, `P ${P} ideal ${ideal}`);
});

test('a perfect triangular lattice reads as fully ordered', () => {
  const cols = 26, rows = 30, s = md.createSystem({ n: cols * rows, xB: 0, P: null });
  s.L = 26; // rows of 30 × √3/2 ≈ 25.98: periodic to within 0.1%
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i; s.x[k] = (i + (j % 2) * 0.5) * (s.L / cols); s.y[k] = j * (s.L / rows);
  }
  const o = md.order(s);
  assert.equal(o.fraction, 1);
  assert.ok(o.meanPsi > 0.99);
});

test('g(r) of a liquid tends to 1 at long range and is empty inside the core', () => {
  const s = md.createSystem({ T: 1.4, seed: 5 });
  md.step(s, 2000);
  const { r, g } = md.rdf(s, 4);
  const far = g.filter((_, b) => r[b] > 3 && r[b] < 4), mean = far.reduce((a, v) => a + v, 0) / far.length;
  assert.ok(Math.abs(mean - 1) < 0.1, `far g ${mean}`);
  assert.ok(g.filter((_, b) => r[b] < 0.8).every((v) => v === 0));
});

// The three regimes the page describes, on fixed seeds.
test('identical atoms crystallise even when quenched', () => {
  assert.ok(quenchRun(0, 0.3, 1) > 0.6);
});

test('very mixed atoms freeze into a glass even when cooled slowly', () => {
  assert.ok(quenchRun(0.3, 0.01, 1) < 0.2);
});

test('at 20% mismatch the cooling rate decides', () => {
  const fast = quenchRun(0.2, 0.3, 1), slow = quenchRun(0.2, 0.01, 1);
  assert.ok(slow - fast > 0.2, `fast ${fast} slow ${slow}`);
});
