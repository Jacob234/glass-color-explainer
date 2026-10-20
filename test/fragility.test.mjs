import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as f from '../src/scripts/fragility.js';
import * as b from '../src/scripts/batch.js';

const near = (a, x, tol, msg) => assert.ok(Math.abs(a - x) <= tol, `${msg ?? ''} ${a} vs ${x}`);
const json = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'));
const net = json('viscnet.json'), frag = json('sciglass/fragility.json');

test('MYEGA reaches 10^12 Pa·s at Tg, η∞ at infinite temperature, and has slope m at Tg', () => {
  const p = { A: -2.93, Tg: 550, m: 35 };
  near(f.logEta(550, p), 12, 1e-9);
  near(f.angell(0, p), -2.93, 1e-9);
  const h = 1e-6;
  near((f.angell(1 + h, p) - f.angell(1 - h, p)) / (2 * h), 35, 1e-4, 'slope');
});

test('tempAt inverts logEta, and the working range shrinks as m rises at fixed Tg', () => {
  const p = { A: f.A_UNIVERSAL, Tg: 550, m: 35 };
  for (const L of [0, 3, 6.6, 12]) near(f.logEta(f.tempAt(L, p), p), L, 1e-6, `L ${L}`);
  let last = Infinity;
  for (let m = 16; m <= 80; m += 4) { const w = f.workingRange({ ...p, m }); assert.ok(w < last, `m ${m}`); last = w; }
});

test('the strong limit is the straight line in Tg/T', () => {
  const p = { A: f.A_UNIVERSAL, m: f.strongest() };
  for (const x of [0.2, 0.5, 0.8]) near(f.angell(x, p), f.A_UNIVERSAL + (12 - f.A_UNIVERSAL) * x, 1e-9);
});

test('fulcherFragility matches the numerical slope of the bench\'s Fulcher curve at 10^12 Pa·s', () => {
  const v = b.viscosity(b.BASE.mol), { Tg, m } = f.fulcherFragility(v), h = 1e-3;
  const at = (x) => v.logEta((Tg + f.K) / x - f.K);
  near((at(1 + h) - at(1 - h)) / (2 * h), m, 0.01);
});

test('the measured fits follow their own points and put silica and B2O3 where the literature does', () => {
  for (const g of frag.glasses) {
    const p = f.fitParams(g);
    const rms = Math.sqrt(g.visc.reduce((s, [L, T]) => s + (f.logEta(T, p) - L) ** 2, 0) / g.visc.length);
    assert.ok(rms <= 0.16, `${g.id} rms ${rms}`);
  }
  const m = (pred) => f.median(frag.glasses.filter((g) => pred(g.mol)).map((g) => g.fit.m));
  // SiO2 is usually quoted near m = 20 and B2O3 in the thirties (from memory, unverified); the fits fix η∞, so allow slack.
  near(m((c) => c[0] > 99), 22, 5, 'silica');
  near(m((c) => c[6] > 99), 35, 6, 'B2O3');
});

test('viscnet.json covers every named glass, sweep and measured melt, with bands around each m', () => {
  for (const id of ['float', 'container', 'nbs710', 'lead', 'boro', 'silica', 'b2o3']) assert.ok(net.named.find((n) => n.id === id), id);
  for (const n of net.named) assert.ok(n.mBand[0] <= n.m + 0.1 && n.m <= n.mBand[1] + 0.1, n.id);
  for (const g of frag.glasses) assert.ok(net.melts[g.id], g.id);
  for (const rows of Object.values(net.sweeps)) assert.equal(rows[0][1], net.named.find((n) => n.id === 'float').m);
  const { pairs, curveMiss } = f.compare(frag, net);
  assert.equal(pairs.length, frag.glasses.length);
  assert.ok(curveMiss < 1, `curve miss ${curveMiss}`);
});
