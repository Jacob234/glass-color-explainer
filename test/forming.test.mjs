import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../src/scripts/forming.js';

const close = (a, b, tol) => Math.abs(a - b) <= tol;

test('Planck band fractions: a quarter of the power lies below the Wien peak, and the bands sum to 1', () => {
  assert.ok(close(f.planckFraction(1, 2897.77), 0.25, 0.001)); // λT at the peak: F = 0.2501
  assert.ok(close(f.planckFraction(100, 3000), 1, 1e-4));
  const s = f.bandShares(1373);
  assert.ok(close(s[0] + s[1] + s[2], 1, 1e-12));
  // at working heat, most of the power is beyond 2.8 µm, where every glass is dark
  assert.ok(s[0] < 0.5 && s[0] > 0.3, `band 1 share ${s[0]}`);
});

test('slab emissivity: E₃(0) = ½, so a vanishing slab emits nothing, and a thick one emits everything', () => {
  assert.equal(f.E3(0), 0.5);
  assert.ok(close(f.E3(1), 0.10969, 2e-4)); // tabulated E₃(1)
  assert.ok(f.slabEmissivity(1e-6) < 1e-4 && f.slabEmissivity(20) > 0.9999);
});

test('band weights sum to the slab emissivity of the wall', () => {
  const g = f.newGather(), r = f.edges(g), k = 42.8;
  const sum = f.bandWeights(k, r).reduce((a, b) => a + b, 0);
  assert.ok(close(sum, f.slabEmissivity(k * f.wall(g)), 1e-9));
});

test('blowing a uniform thin shell reduces to the membrane result da/dt = Δp a² / 12ηh', () => {
  const g = f.newGather({ radius: 0.0402, bore: 0.04, T: 1000 }), dp = 50;
  const h = g.b - g.a, eta = f.eta(1000), am = (g.a + g.b) / 2;
  const expect = (dp * am ** 2) / (12 * eta * h);
  const got = f.inflationRate(g, dp + 2 * 0.3 * (1 / g.a + 1 / g.b)); // cancel surface tension
  assert.ok(close(got / expect, 1, 0.02), `${got} vs ${expect}`);
});

test('blowing a thick gather is resisted by the glass at the bubble; bending, by the skin', () => {
  const chill = (i) => { const g = f.newGather({ T: 1100 }); g.T[i] = 800; return g; };
  const hot = f.newGather({ T: 1100 }), core = chill(0), skin = chill(f.N - 1);
  assert.ok(f.blowResistance(core) > 20 * f.blowResistance(skin));
  assert.ok(f.sagRate(skin) < f.sagRate(core) && f.sagRate(core) < f.sagRate(hot));
});

test('sag of a uniform solid rod matches the viscous cantilever ρgL⁴/(6ηR²)', () => {
  const g = f.newGather({ radius: 0.03, bore: 1e-5, T: 1100 });
  const expect = (2500 * 9.81 * 0.03 ** 4) / (6 * f.eta(1100) * 0.03 ** 2);
  assert.ok(close(f.sagRate(g) / expect, 1, 1e-3));
});

test('turning the pipe keeps the far end circling a point v/ω to the side; stopping lets it fall off', () => {
  const omega = 2 * Math.PI, g = f.newGather({ T: 1100 }), v = f.sagRate(g);
  // hold the temperature, so the sag rate stays fixed: the glory hole at the glass's own heat
  let max = 0, sx = 0, sy = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    f.step(g, 0.01, { where: 'glory', Tglory: 1100, omega });
    max = Math.max(max, Math.hypot(...g.drop)); sx += g.drop[0]; sy += g.drop[1]; n++;
  }
  const steady = f.steadyDrop(v, omega);
  assert.ok(max <= 2 * steady * 1.02 && max > 1.9 * steady, `${max} vs ${2 * steady}`);
  assert.ok(close(Math.hypot(sx / n, sy / n) / steady, 1, 0.05) && Math.abs(sx) > 10 * Math.abs(sy)); // to the side
  const still = f.newGather({ T: 1100 });
  while (!still.status && still.t < 10) f.step(still, 0.1, { where: 'glory', Tglory: 1100, omega: 0 });
  assert.equal(still.status, 'dropped');
  assert.ok(still.t < (2 * f.across(still, still.b)) / v);
});

test('energy balance: the heat that leaves the shells is the radiation and convection out', () => {
  const g = f.newGather({ T: 1100 }), m = (2500 * g.V) / f.N;
  const before = g.T.reduce((a, t) => a + t, 0) * m * 1300;
  const P = f.radiation(g, 25).reduce((a, b) => a + b, 0) - 15 * 4 * Math.PI * g.b ** 2 * (1100 - 25);
  f.step(g, 0.01, { omega: 0 });
  const after = g.T.reduce((a, t) => a + t, 0) * m * 1300;
  assert.ok(close((after - before) / 0.01, P, Math.abs(P) * 0.01));
});

test('in the glory hole a gather at the walls’ temperature neither heats nor cools', () => {
  const g = f.newGather({ T: 1100 });
  f.step(g, 5, { where: 'glory', Tglory: 1100 });
  assert.ok(g.T.every((t) => close(t, 1100, 1e-6)));
});

test('a thin blown wall is a poorer emitter, but cools faster, than the solid gather', () => {
  const solid = f.newGather({ T: 1100 }), thin = f.newGather({ T: 1100, bore: 0.06 });
  thin.V = solid.V; thin.b = f.outerRadius(thin);
  assert.ok(f.totalEmissivity(thin) < f.totalEmissivity(solid));
  for (const g of [solid, thin]) f.step(g, 10, { omega: 0 });
  const mean = (g) => g.T.reduce((a, t) => a + t, 0) / f.N;
  assert.ok(1100 - mean(thin) > 1.5 * (1100 - mean(solid)), `${mean(thin)} vs ${mean(solid)}`);
});

test('out of the fire, the skin stiffens past the working point within a minute; the core lags', () => {
  const g = f.newGather({ T: 1150 });
  while (g.t < 60) f.step(g, 0.5, { where: 'air' });
  const r = f.readings(g);
  assert.ok(r.logSkin > 3 && r.inner - r.skin > 50, JSON.stringify(r));
});

test('swinging the pipe down stretches the gather; holding it up shortens it', () => {
  const down = f.newGather({ T: 1100 }), up = f.newGather({ T: 1100 });
  f.step(down, 0.3, { where: 'glory', tilt: Math.PI / 3, omega: 2 * Math.PI });
  f.step(up, 0.3, { where: 'glory', tilt: -Math.PI / 3, omega: 2 * Math.PI });
  assert.ok(down.aspect > 1.1 && up.aspect < 0.95, `${down.aspect} ${up.aspect}`);
});
