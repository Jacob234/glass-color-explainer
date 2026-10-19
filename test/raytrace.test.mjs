import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLASSES, sellmeier, fresnel, traceRay, slab, prism, lens } from '../src/scripts/raytrace.js';
import { GRID, CMF_GRID, displayMatrix, spectrumColor } from '../src/scripts/spectra.js';
import { LAMP } from '../src/scripts/lamps.js';

test('Sellmeier fits give the catalogue d-line indices', () => {
  assert.ok(Math.abs(sellmeier(GLASSES.crown, 587.56) - 1.5168) < 1e-4);
  assert.ok(Math.abs(sellmeier(GLASSES.flint, 587.56) - 1.78472) < 1e-4);
  assert.ok(sellmeier(GLASSES.flint, 420) > sellmeier(GLASSES.flint, 700)); // normal dispersion
});

test('Fresnel: 4% at normal incidence on n = 1.5, total reflection past the critical angle', () => {
  assert.ok(Math.abs(fresnel(1, 1 / 1.5) - 0.04) < 1e-9);
  assert.equal(fresnel(Math.cos((50 * Math.PI) / 180), 1.5), 1); // critical angle 41.8°
});

const seq = (vals) => { let k = 0; return () => vals[k++ % vals.length]; };
const ray = (nm) => ({ x: 0, y: 0, dx: 1, dy: 0, i: GRID.indexOf(nm), nm, w: 1 });

test('a ray through a slab leaves parallel and fades by Beer–Lambert', () => {
  const density = GRID.map(() => 0.05); // per mm, slab 10 mm thick
  const pieces = [{ poly: slab(20, 0, 10, 40, 0.3), glass: 'crown', density }];
  const runs = [];
  traceRay(pieces, ray(550), seq([0.99]), (...r) => runs.push(r), [-10, -50, 100, 50]);
  assert.equal(runs.length, 3);
  const [x0, y0, x1, y1] = runs[2], [, , , , , , after] = runs[2];
  assert.ok(Math.abs((y1 - y0) / (x1 - x0)) < 1e-9, 'exit ray parallel to entry');
  const [ax, ay, bx, by] = runs[1], path = Math.hypot(bx - ax, by - ay);
  assert.ok(path > 10, 'tilted slab: path longer than thickness');
  assert.ok(Math.abs(after - 10 ** (-0.05 * path)) < 1e-12);
});

test('a flint prism bends violet more than red', () => {
  // The Light Lab's prism scene: a 46 mm dense flint prism, beam coming down at 75°.
  const pieces = [{ poly: prism(40, 56, 46, 1.81), glass: 'flint', density: GRID.map(() => 0) }];
  const exit = (nm) => {
    let last;
    const r = { ...ray(nm), x: 22, y: 1, dx: Math.cos(1.31), dy: Math.sin(1.31) };
    traceRay(pieces, r, seq([0.99]), (...run) => { last = run; }, [0, 0, 180, 110]);
    return (Math.atan2(last[3] - last[1], last[2] - last[0]) * 180) / Math.PI;
  };
  const v = exit(420), r = exit(700);
  assert.ok(r - v > 4, `violet leaves at ${v}°, red at ${r}°: turned further from the beam`);
});

test('displayMatrix matches radianceColor for a whole spectrum', () => {
  for (const id of ['daylight', 'tungsten', 'sodium']) {
    const lamp = LAMP[id], T = GRID.map((w) => (w > 550 ? 0.8 : 0.2));
    const want = spectrumColor(T, lamp.spd, lamp.adapt).lin;
    const white = lamp.spd.reduce((s, v, i) => s + v * CMF_GRID[i][1], 0);
    const xyz = [0, 1, 2].map((k) => lamp.spd.reduce((s, v, i) => s + v * T[i] * CMF_GRID[i][k], 0) / white);
    const got = displayMatrix(lamp.spd, lamp.adapt).map((r) => r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2]);
    got.forEach((v, k) => assert.ok(Math.abs(v - want[k]) < 1e-9, `${id} ${k}: ${v} vs ${want[k]}`));
  }
});

test('a lens focuses near the lensmaker focal length, using its true curvature', () => {
  // Biconvex crown lens, R = 60 mm, thin-lens f = R / (2 (n − 1)) ≈ 58 mm from the centre.
  const pieces = [{ poly: lens(0, 0, 30, 60), glass: 'crown', density: GRID.map(() => 0) }];
  const crossing = (h) => {
    let last;
    traceRay(pieces, { ...ray(590), x: -40, y: h }, seq([0.99]), (...r) => { last = r; }, [-50, -60, 300, 60]);
    const [x0, y0, x1, y1] = last;
    return x0 - (y0 * (x1 - x0)) / (y1 - y0); // where the exiting ray crosses the axis
  };
  const f = 60 / (2 * (sellmeier(GLASSES.crown, 590) - 1));
  const near = crossing(1), far = crossing(-1.5);
  assert.ok(Math.abs(near - f) < 2, `paraxial focus ${near} vs ${f}`);
  assert.ok(Math.abs(near - far) < 0.2, 'paraxial rays meet at one point');
  assert.ok(crossing(12) < near, 'marginal rays focus shorter (spherical aberration)');
});
