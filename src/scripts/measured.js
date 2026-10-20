// measured.js — real melts from SciGlass beside the stage 01 bench's models. Pure functions only:
// no DOM. The data (public/data/sciglass/bench.json, ODbL 1.0, built by tools/sciglass/extract.py)
// is fetched by the page; here it is only searched and compared.
//
// Nearness is the straight-line distance between two batches in mol% over the bench's nine
// oxides: 1 means, say, half a mol% of soda traded for half a mol% of lime would be ~0.7 away.

// Mole percents in the data's oxide order, from a { SiO2: …, Na2O: … } batch.
export const vec = (mol, oxides) => oxides.map((k) => mol[k] ?? 0);

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// The k nearest measured glasses within `within` mol%, nearest first, optionally only those
// carrying every property in `has` ('visc', 'nd', 'vd'). Glasses within 0.05 mol% of each other
// count as equally near (the same glass, reported twice), and the one with more viscosity points wins.
export function nearest(mol, data, { k = 6, within = 3, has = [] } = {}) {
  const x = vec(mol, data.oxides), out = [];
  for (const g of data.glasses) {
    if (has.some((p) => g[p] == null)) continue;
    const d = distance(x, g.mol);
    if (d > within) continue;
    out.push({ ...g, d });
  }
  return out.sort((p, q) => Math.round(p.d * 20) - Math.round(q.d * 20) || (q.visc?.length ?? 0) - (p.visc?.length ?? 0) || p.d - q.d).slice(0, k);
}

// The model's temperature minus the measured one at each of a glass's viscosity points (°C).
// `model` is a viscosity from batch.js for that glass's own composition, so the gap is the
// model's error, not the distance between the batches.
export const viscGaps = (g, model) => (g.visc ?? []).map(([L, T]) => ({ L, T, model: model.tempAt(L), gap: model.tempAt(L) - T }));

// The glass's own composition as a batch, for running the models on it.
export const molOf = (g, oxides) => Object.fromEntries(oxides.map((k, i) => [k, g.mol[i]]));

// "Taylor and others 1937", and the full reference.
export const cite = (data, g) => data.sources[String(g.src)]?.[0] ?? `SciGlass ${g.id}`;
export const reference = (data, g) => data.sources[String(g.src)]?.[1] ?? '';
