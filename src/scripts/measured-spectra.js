// measured-spectra.js — colorant absorption from measurements (src/data/measured.json), on any wavelength grid.
// Pure functions only: no DOM. Two kinds of entry:
//   bands      Gaussian bands fitted to measured glasses of known composition and thickness
//              (Volotinen 2007; Thiemsorn et al. 2007 for Mn³⁺), in decadic absorbance per cm per
//              mol% of the ion. Absolute: c = 1 is `amount` mol% of the ion through the 10 mm wall.
//   digitised  a curve traced from a published figure (Meulebroeck et al. 2016) whose absorbance is
//              in arbitrary units. Measured shape. With a `calibration` (a molar absorptivity ε at one
//              wavelength, from a melt of known composition) the curve is put in the same absolute
//              units as bands and c = 1 is `amount` mol%; without one, c = 1 is `scale` times the
//              traced curve, a scale chosen to keep the old drawn curve's daylight color.
import data from '../data/measured.json' with { type: 'json' };

const { from, to, step } = data.wavelengths;
export const MEASURED_WAVELENGTHS = Array.from({ length: (to - from) / step + 1 }, (_, i) => from + step * i);

// Linear interpolation of samples ys (on MEASURED_WAVELENGTHS) at w, held flat beyond the ends.
function sample(ys, w) {
  if (w <= from) return ys[0];
  if (w >= to) return ys[ys.length - 1];
  const f = (w - from) / step, i = Math.floor(f);
  return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
}

// Sum of Gaussian bands [ν₀ cm⁻¹, σ cm⁻¹, a] at wavelength w nm: A = Σ a·exp(−(ν − ν₀)²/2σ²).
export const sigmaBands = (bands, w) => {
  const nu = 1e7 / w;
  return bands.reduce((s, [c, sd, a]) => s + a * Math.exp(-((nu - c) ** 2) / (2 * sd * sd)), 0);
};

// Least-squares fit of y ≈ Σ kᵢ·xᵢ with kᵢ ≥ 0, for two or fewer basis curves: drop a basis whose
// coefficient comes out negative and refit with the rest.
function nonNegativeFit(basis, y) {
  let use = basis.map((_, i) => i);
  for (;;) {
    const n = use.length;
    if (!n) return basis.map(() => 0);
    const A = use.map((i) => use.map((j) => basis[i].reduce((s, v, k) => s + v * basis[j][k], 0)));
    const b = use.map((i) => basis[i].reduce((s, v, k) => s + v * y[k], 0));
    const k = n === 1 ? [b[0] / A[0][0]]
      : (() => { const det = A[0][0] * A[1][1] - A[0][1] * A[1][0]; return [(b[0] * A[1][1] - b[1] * A[0][1]) / det, (A[0][0] * b[1] - A[1][0] * b[0]) / det]; })();
    const neg = k.findIndex((v) => v < 0);
    if (neg < 0) { const out = basis.map(() => 0); use.forEach((i, m) => { out[i] = k[m]; }); return out; }
    use = use.filter((_, m) => m !== neg);
  }
}

// The iron in a digitized glass, fitted where the colorant itself is clear, as relative units on
// MEASURED_WAVELENGTHS. Returns { curve, coefficients } (coefficients in relative units per mol%·cm).
export function background(id) {
  const e = data.colorants[id], bg = e.background;
  if (!bg) return { curve: MEASURED_WAVELENGTHS.map(() => 0), coefficients: [] };
  const shapes = bg.ions.map((ion) => MEASURED_WAVELENGTHS.map((w) => sigmaBands(data.colorants[ion].bands, w)));
  const idx = MEASURED_WAVELENGTHS.map((w, i) => (w <= bg.fitBelow || w >= bg.fitAbove ? i : -1)).filter((i) => i >= 0);
  const k = nonNegativeFit(shapes.map((s) => idx.map((i) => s[i])), idx.map((i) => e.relative[i]));
  return { curve: MEASURED_WAVELENGTHS.map((_, i) => shapes.reduce((s, sh, j) => s + k[j] * sh[i], 0)), coefficients: k };
}

// A digitized curve with its background taken away (relative units, never below zero).
export function cleaned(id) {
  const e = data.colorants[id], bg = background(id).curve;
  return e.relative.map((v, i) => Math.max(0, v - bg[i]));
}

// True when c = 1 is a stated amount of the ion (bands, or a calibrated trace), not a fitted scale.
export const isAbsolute = (e) => e.kind === 'bands' || Boolean(e.calibration);

// ε (L mol⁻¹ cm⁻¹) to absorbance per cm per mol% of the ion.
export const perMolPercent = (epsilon) => epsilon * data.molarDensity.value / 100;

// Optical density per unit c (before scaling): absorbance per cm per mol% for bands and calibrated
// traces, relative units for an uncalibrated trace. Returns a function of wavelength.
export function unitDensity(id) {
  const e = data.colorants[id];
  if (e.kind === 'bands') return (w) => sigmaBands(e.bands, w);
  const ys = cleaned(id);
  if (!e.calibration) return (w) => sample(ys, w);
  const { at, epsilon } = e.calibration, k = perMolPercent(epsilon) / sample(ys, at);
  return (w) => k * sample(ys, w);
}

// The factor from unitDensity to the page's reference amount (c = 1 through 10 mm).
export const referenceFactor = (id) => {
  const e = data.colorants[id];
  return isAbsolute(e) ? e.amount * 1 /* cm: the 10 mm reference wall */ : e.scale;
};

// Decadic density on a wavelength grid at c = 1, for each measured colorant.
export const MEASURED_MODELS = Object.fromEntries(Object.keys(data.colorants).map((id) => {
  const f = unitDensity(id);
  return [id, (grid) => { const k = referenceFactor(id); return grid.map((w) => k * f(w)); }];
}));

export const measuredEntry = (id) => data.colorants[id];
export const MEASURED = data;

// The amount at c = 1 as weight percent of the oxide, for a calibrated trace: mol% of the ion times
// the oxide mass per ion over the mean formula mass of the reference glass (59.8 g/mol). Dilute only.
export const weightPercent = (id) => {
  const e = data.colorants[id];
  return e.calibration ? (e.amount * e.calibration.massPerIon) / 59.8 : undefined;
};

// One line for the page on where a colorant's curve comes from.
const CITE = { 'volotinen-2007': 'Volotinen 2007', 'meulebroeck-2016': 'Meulebroeck et al. 2016', 'thiemsorn-2007': 'Thiemsorn et al. 2007', 'chimalawong-2010': 'Chimalawong et al. 2010' };
const TRACED = {
  'meulebroeck-2016': 'traced from a stained-glass spectrum',
  'chimalawong-2010': 'traced from soda-lime glasses melted with 1–3 mol% Nd₂O₃',
};
const ION = { 'iron-ferrous': 'Fe²⁺', 'iron-ferric': 'Fe³⁺', copper: 'Cu²⁺', manganese: 'Mn³⁺' };
export function basisLine(id) {
  const e = data.colorants[id];
  if (!e) return 'Illustrative curve, drawn from the shape of published spectra.';
  if (e.kind === 'bands' && e.fit) return `Measured: bands fitted here to a published spectrum of soda-lime glass, scaled by its measured absorptivity (${CITE[e.source]}). ×1 is ${e.amount} mol% ${ION[id]} through 10 mm.`;
  if (e.kind === 'bands') return `Measured: bands fitted to soda-lime glass of known composition (${CITE[e.source]}). ×1 is ${e.amount} mol% ${ION[id]} through 10 mm.`;
  if (e.source === 'chimalawong-2010') return `Measured shape, ${TRACED[e.source]} (${CITE[e.source]}). ×1 is scaled to the color the old drawn curve gave; read as plotted, that is about ${(e.scale * 0.3).toFixed(1)} mol% Nd₂O₃ through 10 mm.`;
  const shape = `Measured shape, ${TRACED[e.source]} (${CITE[e.source]}).`;
  if (!e.calibration) return `${shape} The paper gives no thickness, so ×1 is scaled to the color the old drawn curve gave.`;
  const c = e.calibration, wt = Number(weightPercent(id).toPrecision(2));
  return `${shape} Strength from the absorptivity of ${c.ion} at ${c.at} nm in soda-lime glass (${CITE[c.source]}): ×1 is ${e.amount} mol% ${c.ion} (about ${wt} wt% ${c.oxide}) through 10 mm.${c.caveat ? ' Cr⁶⁺ is not calibrated.' : ''}`;
}
