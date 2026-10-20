import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GLASSES, GLASS, LINES, index, abbe, uvResonance, fresnel, refract, trace, prism, deviation, focal, discCdf, lineImage,
  criticalAngle, returnWindow, brilliant, beamFate,
} from '../src/scripts/dispersion.js';

test('the dispersion formulas reproduce each datasheet n_d and V_d', () => {
  for (const g of GLASSES) {
    if (g.nd == null) continue;
    assert.ok(Math.abs(index(g, LINES.d) - g.nd) < 2e-5, `${g.id} n_d ${index(g, LINES.d)}`);
    assert.ok(Math.abs(abbe(g) - g.vd) < 0.05, `${g.id} V_d ${abbe(g)}`);
  }
  // Rubin's window glass has no datasheet; it should sit where soda-lime does
  const n = index(GLASS.sodalime, LINES.d);
  assert.ok(n > 1.51 && n < 1.53, `window glass n_d ${n}`);
});

test('every glass has normal dispersion: n falls from violet to red', () => {
  for (const g of GLASSES) for (let nm = 400; nm < 780; nm += 5) assert.ok(index(g, nm) > index(g, nm + 5), `${g.id} at ${nm}`);
});

test('lead raises index and dispersion, and titanium can stand in for it', () => {
  for (const id of ['f2', 'sf11']) {
    assert.ok(GLASS[id].lead);
    assert.ok(index(GLASS[id], LINES.d) > index(GLASS.bk7, LINES.d) + 0.1, id);
    assert.ok(abbe(GLASS[id]) < 50 && abbe(GLASS.bk7) > 50, id);
    assert.ok(uvResonance(GLASS[id]) > uvResonance(GLASS.bk7), `${id}: ultraviolet term nearer the visible`);
  }
  assert.ok(!GLASS.nsf11.lead);
  assert.ok(Math.abs(index(GLASS.nsf11, LINES.d) - index(GLASS.sf11, LINES.d)) < 1e-4);
  assert.ok(Math.abs(abbe(GLASS.nsf11) - abbe(GLASS.sf11)) < 0.2);
});

test('Fresnel reflection at normal incidence is ((n − 1)/(n + 1))², and refraction keeps unit length', () => {
  assert.ok(Math.abs(fresnel(1, 1.5, 1, 1) - 0.04) < 1e-12);
  const th = 0.7, r = refract([Math.sin(th), Math.cos(th)], [0, -1], 1, 1.5);
  assert.ok(Math.abs(Math.hypot(...r.dir) - 1) < 1e-12);
  assert.ok(Math.abs(r.dir[0] - Math.sin(th) / 1.5) < 1e-12, "Snell's law");
  assert.equal(refract([Math.sin(1.2), Math.cos(1.2)], [0, -1], 1.5, 1), null, 'past the critical angle');
});

// The bench's geometry: a beam rising at 28° onto a 60 mm equilateral prism.
const T = (28 * Math.PI) / 180, DIR = [Math.cos(T), -Math.sin(T)], MID = [135, 105 - 60 / Math.sqrt(3) / 4];
const ORIGIN = [MID[0] - 160 * DIR[0], MID[1] - 160 * DIR[1]];
const devAt = (g, nm, deg) => { const r = trace(prism(150, 105, 60, deg), index(g, nm), ORIGIN, DIR); return r.out && !r.tir ? deviation(DIR, r.dir) : null; };

test('the traced prism finds the textbook minimum deviation, 2·asin(n·sin 30°) − 60°', () => {
  for (const id of ['bk7', 'f2']) {
    let min = Infinity;
    for (let deg = -25; deg <= 26; deg += 0.05) { const d = devAt(GLASS[id], LINES.d, deg); if (d != null) min = Math.min(min, d); }
    const want = (2 * Math.asin(index(GLASS[id], LINES.d) * 0.5) * 180) / Math.PI - 60;
    assert.ok(Math.abs(min - want) < 0.02, `${id}: ${min} vs ${want}`);
  }
});

test('violet turns more than red, and a dense flint fans wider than a crown', () => {
  const fan = (g) => devAt(g, 420, 5) - devAt(g, 680, 5);
  assert.ok(fan(GLASS.bk7) > 0);
  assert.ok(fan(GLASS.sf11) > 3 * fan(GLASS.bk7));
});

test('turned toward the beam, a dense flint traps the light by total internal reflection', () => {
  const r = trace(prism(150, 105, 60, -25), index(GLASS.sf11, LINES.d), ORIGIN, DIR);
  assert.ok(r.tir > 0);
});

test('an achromat brings F and C to one focus, leaving a much smaller secondary spectrum', () => {
  const s = focal(100, GLASS.bk7), a = focal(100, GLASS.bk7, GLASS.f2);
  assert.ok(Math.abs(a(LINES.d) - 100) < 1e-9 && Math.abs(s(LINES.d) - 100) < 1e-9);
  assert.ok(Math.abs(a(LINES.F) - a(LINES.C)) < 1e-6);
  assert.ok(s(LINES.F) < s(LINES.C), 'blue focuses nearer in a plain lens');
  let lo = Infinity; for (let nm = 480; nm <= 660; nm++) lo = Math.min(lo, a(nm));
  assert.ok((s(LINES.C) - s(LINES.F)) / (a(LINES.C) - lo) > 10);
});

test('the blurred line image conserves light and is darkest on the line', () => {
  assert.equal(discCdf(0), 0.5); assert.equal(discCdf(-2), 0); assert.equal(discCdf(2), 1);
  const f = focal(100, GLASS.bk7), at = (x) => lineImage(f, [550], 12.5, 100, 0.06, x)[0];
  assert.ok(at(0) < at(0.1) && at(0.1) <= at(0.3) + 1e-12);
  assert.ok(at(1) > 0.999);
});

// The cut piece (stage 07′, fire.js): a brilliant section with Tolkowsky's crown and table.
const d = (g) => index(GLASS[g], LINES.d);
const tableUp = (id, a) => beamFate(brilliant(0, 0, 10, a), d(id), [0, 1], 40, { only: [-5, 5] }).up;

test('the critical angles the page quotes, and the return windows', () => {
  assert.equal(criticalAngle(d('sodalime')).toFixed(1), '41.0');
  assert.equal(criticalAngle(d('f2')).toFixed(1), '38.1');
  assert.equal(criticalAngle(d('sf11')).toFixed(1), '34.1');
  const width = (id) => { const [a, b] = returnWindow(d(id)); return (b - a).toFixed(1); };
  assert.deepEqual(['sodalime', 'f2', 'sf11'].map(width), ['5.3', '9.2', '14.6']);
  // Tolkowsky's diamond: n 2.417, critical angle 24° 26′
  assert.ok(Math.abs(criticalAngle(2.417) - (24 + 26 / 60)) < 0.01);
  assert.ok(index(GLASS.llf1, LINES.d) > 1.545, 'the lead-crystal stand-in meets the EU index');
});

test('the traced section returns straight-down light just where the window says', () => {
  for (const id of ['sodalime', 'llf1', 'f2']) {
    const [lo, hi] = returnWindow(d(id));
    assert.ok(tableUp(id, lo - 0.3) < 0.01, `${id} leaks below the critical angle`);
    assert.ok(tableUp(id, lo + 0.3) > 0.85, `${id} returns just above it`);
    assert.ok(tableUp(id, hi - 0.3) > 0.85, `${id} returns just below the upper limit`);
    assert.ok(tableUp(id, hi + 0.3) < 0.01, `${id} leaks past the upper limit`);
  }
  // every returned ray took exactly two total reflections
  const f = beamFate(brilliant(0, 0, 10, 43), d('sodalime'), [0, 1], 20, { only: [-5, 5], rays: true });
  assert.ok(f.list.every(({ r, up }) => up && r.tir === 2));
});

test("Tolkowsky's diamond pavilion loses window glass's light out of the back, and lead glass keeps it", () => {
  const fate = (id) => beamFate(brilliant(0, 0, 10, 40.75), d(id), [0, 1], 200);
  assert.ok(fate('sodalime').down > 0.15);
  assert.ok(fate('f2').down < 0.01 && fate('f2').up > 0.8);
  // shares never exceed the light that went in
  for (const id of ['sodalime', 'llf1', 'f2', 'sf11']) { const f = fate(id); assert.ok(f.up + f.down <= 1 + 1e-9); }
});

test('light leaving the crown fans wider in a dense flint than in window glass', () => {
  const spread = (id) => {
    let worst = 0;
    const poly = brilliant(0, 0, 10, 42), dir = [Math.sin(0.2), Math.cos(0.2)];
    const b = beamFate(poly, index(GLASS[id], 430), dir, 40, { rays: true }).list, r = beamFate(poly, index(GLASS[id], 650), dir, 40, { rays: true }).list;
    b.forEach((x, k) => { if (x.up && r[k].up && x.r.tir === r[k].r.tir) worst = Math.max(worst, deviation(x.r.dir, r[k].r.dir)); });
    return worst;
  };
  assert.ok(spread('sf11') > 3 * spread('sodalime'), `${spread('sf11')} vs ${spread('sodalime')}`);
});
