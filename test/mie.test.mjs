import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/scripts/mie.js';
import * as s from '../src/scripts/strike.js';
import { GRID } from '../src/scripts/spectra.js';
import { LAMP, underLamp } from '../src/scripts/lamps.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// Reference values from miepython 2.x (MIT), which takes m = n − ik; ours is n + ik.
const ORACLE = [
  [[1.5, 0], 0.5, 0.014567, 0.014567, 0.048866, 0.019380],
  [[1.5, 0], 5, 3.927827, 3.927827, 0.707295, 2.203881],
  [[0.3, 2.4], 1.2, 4.21703, 3.51625, 0.09698, 3.592041],
  [[0.1, 2.2], 0.3, 0.373119, 0.116386, -0.003546, 0.17501],
  [[1.33, 0.01], 10, 2.249241, 1.872112, 0.754141, 0.318567],
  [[0.2, 3.5], 3, 3.255128, 3.098064, 0.474191, 0.641416],
];

test('Mie efficiencies match miepython', () => {
  for (const [mm, x, ext, sca, g, back] of ORACLE) {
    const q = m.mie(mm, x);
    close(q.ext, ext, 2e-6, `ext m=${mm} x=${x}`);
    close(q.sca, sca, 2e-6, `sca m=${mm} x=${x}`);
    close(q.g, g, 2e-6, `g m=${mm} x=${x}`);
    close(q.back, back, 2e-6, `back m=${mm} x=${x}`);
  }
});

test('small dielectric spheres follow Rayleigh: Q_sca = (8/3) x⁴ |(m²−1)/(m²+2)|²', () => {
  const x = 0.01, n = 1.5, L = (n * n - 1) / (n * n + 2);
  close(m.mie([n, 0], x).sca / ((8 / 3) * x ** 4 * L * L), 1, 1e-3, 'Rayleigh ratio');
});

test('size correction broadens the band of small gold spheres and leaves bulk alone', () => {
  const bulk = m.epsilon('Au', 530), big = m.epsilon('Au', 530, 1e9), small = m.epsilon('Au', 530, 2);
  close(big[1], bulk[1], 1e-6, 'r → ∞');
  assert.ok(small[1] > bulk[1] + 0.5, 'more loss in a 2 nm sphere');
});

test('gold plasmon in glass peaks near 530 nm, silver near 400 nm', () => {
  const peak = (id, r) => { const c = m.colloid(id, GRID, { r, sigma: 1 }); let k = 0; c.forEach((v, i) => { if (v.ext > c[k].ext) k = i; }); return GRID[k]; };
  const au = peak('Au', 8), ag = peak('Ag', 8);
  assert.ok(au >= 520 && au <= 545, `gold ${au}`);
  assert.ok(ag >= 395 && ag <= 420, `silver ${ag}`);
  assert.ok(peak('Au', 50) > au + 30, 'large gold spheres resonate further red');
});

test('striking: clear, then ruby, then over-struck purple-blue', () => {
  const rgb = (t) => underLamp(s.struck('Au', t).T, LAMP.daylight).rgb;
  const [r0, g0, b0] = rgb(0), [r1, g1, b1] = rgb(0.6), [r2, , b2] = rgb(1);
  assert.ok(Math.min(r0, g0, b0) > 0.97, 'unstruck is clear');
  assert.ok(r1 > 0.5 && g1 < 0.1 && b1 < r1, 'struck is ruby');
  assert.ok(b2 > r2, 'over-struck passes more blue than red');
  assert.ok(s.struck('Au', 1).scatter > 0.5 && s.struck('Au', 0.6).scatter < 0.05, 'large particles scatter, small ones absorb');
});

test('silver stain is yellow; copper ruby is dark red', () => {
  const ag = underLamp(s.struck('Ag', 0.6).T, LAMP.daylight).rgb, cu = underLamp(s.struck('Cu', 0.6).T, LAMP.daylight).rgb;
  assert.ok(ag[0] > 0.9 && ag[1] > 0.8 && ag[2] < 0.5, `silver ${ag}`);
  assert.ok(cu[0] > cu[1] * 3 && cu[0] < 0.5, `copper ${cu}`);
});

test('Brus gap falls toward the bulk value as crystals grow', () => {
  let last = Infinity;
  for (let t = 0; t <= 1; t += 0.1) { const e = s.brusGap(s.crystalRadius(t)); assert.ok(e <= last + 1e-12); last = e; }
  assert.ok(s.brusGap(s.crystalRadius(0)) > 3.1, 'smallest crystals absorb only UV');
  close(s.brusGap(1e6), s.BRUS.bulk, 1e-6, 'bulk limit');
});

test('Lycurgus: red through the glass, greener than red when front-lit', () => {
  const { T, R } = s.lycurgus();
  const t = underLamp(T, LAMP.daylight).rgb, r = underLamp(R, LAMP.daylight).rgb;
  assert.ok(t[0] > 1.6 * t[1] && t[0] > 1.6 * t[2], `transmitted ${t}`);
  assert.ok(r[1] > r[0] && r[1] > r[2], `scattered ${r}`);
});
