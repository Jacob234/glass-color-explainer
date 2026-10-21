// scripts/oracle_inputs.mjs — the transmission spectra the colour-science oracle is run on.
// Called by scripts/build_oracle.py, which prints them back into test/fixtures/colour-science.json.
// Each is a colorant at c = 1 through the reference thickness, on GRID, from the same density the
// home page uses (bands.js where a colorant has a band model). The test reads the spectra from the
// fixture, so later changes to the band models do not invalidate it.
import optics from '../src/data/optics.json' with { type: 'json' };
import { GRID, colorantDensity, transmission } from '../src/scripts/spectra.js';

const density = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));
const round = (v) => Number(v.toPrecision(8));
const samples = optics.colorants.map((c) => ({ id: c.id, T: transmission([[density[c.id], 1]]).map(round) }));
for (const r of optics.recipes) {
  samples.push({ id: `recipe:${r.id}`, T: transmission(r.melt.map((m) => [density[m.colorant], m.c]), r.thickness ?? 1).map(round) });
}
console.log(JSON.stringify({ grid: GRID, samples }));
