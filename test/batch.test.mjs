import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/batch.json' with { type: 'json' };
import * as b from '../src/scripts/batch.js';

const near = (a, x, tol, msg) => assert.ok(Math.abs(a - x) <= tol, `${msg ?? ''} ${a} vs ${x}`);

test('the viscosity model reproduces Fluegel\'s own Table 12 predictions for the five standards', () => {
  const { other, standards } = data.viscosity.check;
  for (const [id, c] of Object.entries(standards)) {
    const mol = { ...c.mol, SiO2: 100 - Object.values(c.mol).reduce((s, v) => s + v, 0) };
    b.LEVELS.forEach((L, i) => {
      const key = L.toFixed(1), rest = Object.entries(other[key]).reduce((s, [k, v]) => s + v * k.split('^').reduce((p, o, j, a) => (a.length > 1 ? (mol[a[0]] ?? 0) ** Number(a[1]) : k.split('*').reduce((q, x) => q * (mol[x] ?? 0), 1)), 0), 0);
      near(b.fluegelIsokom(mol, L) + rest, c.model[i], 0.5, `${id} at ${L}`);
    });
  }
});

test('the SciGlass correction is zero without alumina or magnesia, and stiffens a magnesia aluminosilicate', () => {
  for (const L of b.LEVELS) near(b.correction(b.PRESET.nbs710.mol, L), 0, 1e-12);
  const cover = { SiO2: 66.5, Na2O: 16.4, K2O: 0.7, MgO: 7.1, Al2O3: 9.3 };
  assert.ok(b.isokom(cover, 12) - b.fluegelIsokom(cover, 12) > 40, 'cover glass runs ~50 °C stiffer than Fluegel');
});

test('the Fulcher curve passes through all three isokoms and has its T0 below the annealing point', () => {
  for (const p of b.PRESETS) {
    const v = b.viscosity(p.mol);
    for (const [L, T] of b.isokoms(p.mol)) near(v.logEta(T), L, 1e-6, p.id);
    assert.ok(v.T0 > 0 && v.T0 < b.isokom(p.mol, 12), `${p.id} T0 ${v.T0}`);
  }
});

test('float glass lands near Pilkington\'s figures: softening ~730 °C, annealing ~560 °C, n ~1.52', () => {
  const f = b.properties(b.BASE.mol);
  near(f.softening, 732, 15, 'softening');
  near(f.annealing, 559, 15, 'annealing');
  near(f.nd, 1.52, 0.005, 'index');
  near(f.vd, 59, 2, 'Abbe');
  near(f.rho, 2.5, 0.02, 'density (Pilkington: 2.50)');
  near(f.ferrous, data.iron.floatFerrous, 1e-12, 'iron is the anchor');
});

test('each oxide moves the properties the way glassmakers know it does', () => {
  const p = (id) => b.properties(b.PRESET[id].mol);
  const boro = p('boro'), lead = p('lead'), float = p('float');
  assert.ok(boro.alpha < 4 && boro.melting > float.melting, 'borosilicate: low expansion, stiff melt');
  assert.ok(lead.nd > 1.55 && lead.nd < 1.6 && lead.vd < 45 && lead.rho > 3, 'lead: dense, high index, high dispersion');
  assert.ok(lead.annealing < float.annealing - 50, 'lead lowers the annealing point');
  const more = (ox, d) => b.properties(b.fromWt({ ...Object.fromEntries(Object.entries(b.BASE.wt).filter(([k]) => k !== 'SiO2')), [ox]: b.BASE.wt[ox] + d }));
  assert.ok(more('Na2O', 3).alpha > float.alpha && more('Na2O', 3).softening < float.softening, 'soda: a flux that raises expansion');
  assert.ok(more('Na2O', 3).ferrous < float.ferrous, 'soda pushes iron toward Fe³⁺');
  assert.ok(more('Al2O3', 3).softening > float.softening, 'alumina stiffens the glass');
  const lime = more('CaO', 3);
  assert.ok(lime.range < float.range, 'lime shortens the working range');
});

test('room-temperature density lands near datasheets, and borosilicate\'s index near Pyrex\'s', () => {
  const p = (id) => b.properties(b.PRESET[id].mol);
  // SciGlass measures this exact composition at 2.23 g/cm³ and n_d 1.470–1.475. The fit runs high-silica
  // borosilicates ~0.035 g/cm³ heavy (tools/sciglass/fit_density.py), which carries into the index.
  near(p('boro').rho, 2.23, 0.045, 'Pyrex/Duran 2.23 g/cm³');
  near(p('boro').nd, 1.473, 0.007, 'Pyrex n_d 1.470–1.475');
  near(p('container').rho, 2.5, 0.03, 'container glass');
  assert.ok(p('lead').rho > 3.0 && p('lead').rho < 3.25, `lead crystal ${p('lead').rho}`);
});

test('weight and mole percents round-trip, and silica takes up the balance', () => {
  const wt = b.toWt(b.BASE.mol), back = b.toMol(wt);
  for (const k of b.IDS) near(back[k], b.BASE.mol[k], 1e-9, k);
  const m = b.fromWt({ Na2O: 15, CaO: 10 });
  near(b.toWt(m).SiO2, 75, 1e-9);
});
