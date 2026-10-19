// observers.js — the same light, seen by different eyes. Pure functions only: no DOM.
// Everywhere else on the page a colour is computed for one eye, the CIE 1931 2° standard observer.
// Here the eye is a parameter: the CIE 1964 10° observer, the CIE 2006 cone model at any age from
// 20 to 80 and any field from 2° to 10° (CIE 170-1:2006), and dichromats built from those cones.
//
// To put another eye's experience on a screen calibrated for the standard eye, this file finds the
// corresponding colour: the light that would give the standard eye, adapted to daylight, the same
// adapted cone signals the glass gives the other eye. Each eye is assumed to have adapted fully to
// its own lens and macula (they change over years) and partly to the lamp (lamp.adapt, as in
// lamps.js). That is a model, and the page says so.
import data from '../data/observers.json' with { type: 'json' };
import { GRID, encode, css } from './spectra.js';
import { cmf } from './optics-core.js';
import { LAMP } from './lamps.js';

const mul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const BRADFORD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
const BRADFORD_INV = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
const XYZ_TO_SRGB = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
const D65_WHITE = [0.95047, 1, 1.08883];
const D65 = LAMP.daylight.spd;

// A table sampled every `step` nm from `start`, read on GRID; zero where the table has no data
// (CIE 2006 starts at 390 nm, where every cone is already within a few per cent of zero).
const column = ({ start, step }, rows, k) => GRID.map((w) => (w < start ? 0 : rows[(w - start) / step][k] ?? 0));
const integrate = (curves, L) => curves.map((c) => c.reduce((s, v, i) => s + v * L[i], 0));

/* ---------- the CIE 2006 cone model ---------- */
const C6 = data.cie2006;
const LOG_ABS = [0, 1, 2].map((k) => column(C6, C6.logAbsorbance, k)); // log10 low-density absorbance, peak 0
const HAS_S = column(C6, C6.logAbsorbance.map((r) => [r[2] == null ? 0 : 1]), 0); // S is tabulated to 615 nm
const OCULAR = [0, 1].map((k) => column(C6, C6.ocular, k)); // [part that grows with age, part that does not]
const MACULAR = column(C6, C6.macular.map((v) => [v]), 0); // relative, peak 1 at 460 nm
export const LMS_TO_XYZ = C6.lmsToXyz['2'];

// CIE 170-1:2006 §5–6. Lens and ocular media: D(λ) = d₁(λ)·(1 + 0.02(A − 32)) + d₂(λ) for ages 20–60,
// d₁(λ)·(1.56 + 0.0667(A − 60)) + d₂(λ) above 60 (Pokorny, Smith & Lutze 1987).
export function lensDensity(age) {
  const a = Math.min(80, Math.max(20, age));
  const k = a <= 60 ? 1 + 0.02 * (a - 32) : 1.56 + 0.0667 * (a - 60);
  return GRID.map((_, i) => OCULAR[0][i] * k + OCULAR[1][i]);
}
// Macular pigment: peak density 0.485·exp(−f/6.132), 0.35 at 2°, 0.095 at 10°.
export const macularDensity = (field) => MACULAR.map((v) => v * 0.485 * Math.exp(-field / 6.132));
// Peak photopigment densities fall with field size, because cones are shorter away from the fovea.
const pigmentPeak = (field) => [0.38 + 0.54 * Math.exp(-field / 1.333), 0.38 + 0.54 * Math.exp(-field / 1.333), 0.3 + 0.45 * Math.exp(-field / 1.333)];

// Energy-based cone fundamentals l̄, m̄, s̄ on GRID, each with peak 1, for an observer of `age`
// years looking at a field `field` degrees across. Defaults are the CIE 2006 2° standard.
const coneCache = new Map();
export function cones({ age = 32, field = 2 } = {}) {
  const key = `${age}|${field}`;
  if (!coneCache.has(key)) {
    const pk = pigmentPeak(field), lens = lensDensity(age), mac = macularDensity(field);
    const out = [0, 1, 2].map((k) => {
      const q = GRID.map((w, i) => {
        if (w < C6.start || (k === 2 && !HAS_S[i])) return 0; // no data: below 390 nm, S above 615 nm
        const alpha = 1 - 10 ** (-pk[k] * 10 ** LOG_ABS[k][i]); // fraction the pigment absorbs
        return alpha * 10 ** -(lens[i] + mac[i]) * w; // through lens and macula; quanta to energy
      });
      const m = Math.max(...q);
      return q.map((v) => v / m);
    });
    coneCache.set(key, out);
  }
  return coneCache.get(key);
}
// What reaches the cones through the lens and macula, 0..1.
export const mediaTransmission = ({ age = 32, field = 2 } = {}) => {
  const lens = lensDensity(age), mac = macularDensity(field);
  return GRID.map((_, i) => 10 ** -(lens[i] + mac[i]));
};

/* ---------- the eyes ---------- */
// kind 'xyz': an eye given as colour-matching functions; kind 'lms': the cone model, with `missing`
// naming the cone a dichromat lacks. Brettel, Viénot & Mollon (1997) anchor each dichromat's colours
// on two wavelengths it shares with trichromats: 475 and 575 nm for protans and deutans, 485 and
// 660 nm for tritans.
const CIE1931 = (() => { const c = GRID.map(cmf); return [0, 1, 2].map((k) => c.map((v) => v[k])); })();
const CIE1964 = [0, 1, 2].map((k) => column(data.cie1964, data.cie1964.xyz, k));
export const EYES = [
  { id: 'standard', label: 'the page’s eye', kind: 'xyz', curves: CIE1931, names: ['x̄', 'ȳ', 'z̄'],
    note: 'CIE 1931 2°: the average of 17 observers matching colours in a 2° field in the late 1920s. Every other colour on the page is computed for this eye.' },
  { id: 'wide', label: 'wide field', kind: 'xyz', curves: CIE1964, names: ['x̄₁₀', 'ȳ₁₀', 'z̄₁₀'],
    note: 'CIE 1964 10°: the same idea for a patch the size of your fist at arm’s length. Outside the fovea there is almost no macular pigment, so more blue reaches the cones.' },
  { id: 'cones', label: 'cones', kind: 'lms', names: ['L', 'M', 'S'],
    note: 'CIE 2006: the eye built up from its parts. Three cone pigments, behind a lens that yellows with age and a macular pigment that thins away from the centre.' },
  { id: 'protan', label: 'no L cones', kind: 'lms', missing: 0, anchors: [475, 575], names: ['L', 'M', 'S'],
    note: 'Protanopia: no long-wave cones. Reds look dark, and red and green collapse onto one axis of yellow and blue.' },
  { id: 'deutan', label: 'no M cones', kind: 'lms', missing: 1, anchors: [475, 575], names: ['L', 'M', 'S'],
    note: 'Deuteranopia: no middle-wave cones. Red and green collapse onto one axis of yellow and blue, at full brightness.' },
  { id: 'tritan', label: 'no S cones', kind: 'lms', missing: 2, anchors: [485, 660], names: ['L', 'M', 'S'],
    note: 'Tritanopia: no short-wave cones, and very rare. Blue and yellow collapse; what is left runs from turquoise to red.' },
];
export const EYE = Object.fromEntries(EYES.map((e) => [e.id, e]));

// The reference the screen is drawn for, in cone terms: CIE 2006 2° at age 32, adapted to daylight.
const REF = cones();
const lum = (lms) => LMS_TO_XYZ[1][0] * lms[0] + LMS_TO_XYZ[1][1] * lms[1];
const REF_WHITE = (() => { const w = integrate(REF, D65), y = lum(w); return w.map((v) => v / y); })();
// The XYZ of that white is a hair off the 1931 D65 white; one last Bradford step closes the gap.
const FINAL = (() => {
  const src = mul(BRADFORD, mul(LMS_TO_XYZ, REF_WHITE)), dst = mul(BRADFORD, D65_WHITE);
  return (xyz) => mul(BRADFORD_INV, mul(BRADFORD, xyz).map((v, i) => (v * dst[i]) / src[i]));
})();

// Brettel, Viénot & Mollon (1997): a dichromat's colours lie on two half-planes through the white
// and one anchor wavelength each. The missing cone's signal is replaced by the value that puts the
// colour on the half-plane on its own side of the white.
export function dichromat(q, white, missing, anchors) {
  const [a, b] = missing === 2 ? [0, 1] : [missing === 0 ? 1 : 0, 2]; // the ratio that picks the side
  const side = q[b] * white[a] < white[b] * q[a]; // below the white's ratio: the long-wave anchor
  const at = (nm) => REF.map((c) => c[(nm - 380) / 5]);
  const A = at(side ? anchors[1] : anchors[0]);
  const n = [white[1] * A[2] - white[2] * A[1], white[2] * A[0] - white[0] * A[2], white[0] * A[1] - white[1] * A[0]];
  const out = q.slice();
  out[missing] = -n.reduce((s, v, j) => (j === missing ? s : s + v * q[j]), 0) / n[missing];
  return out;
}

// Adapted, standard-observer XYZ (white of the lamp → about D65 at Y = 1) of light L reaching `eye`
// under `lamp`, before exposure. opts: { age, field } for the cone eyes.
function xyzSeen(L, lamp, eye, opts) {
  const D = lamp.adapt;
  if (eye.kind === 'xyz') {
    const W = integrate(eye.curves, lamp.spd), N = integrate(eye.curves, D65);
    const g = integrate(eye.curves, L).map((v) => v / W[1]);
    const rl = mul(BRADFORD, W.map((v) => v / W[1])), rn = mul(BRADFORD, N.map((v) => v / N[1])), rr = mul(BRADFORD, D65_WHITE);
    const gain = rr.map((r, i) => (r / rl[i]) ** D * (r / rn[i]) ** (1 - D));
    return mul(BRADFORD_INV, mul(BRADFORD, g).map((v, i) => v * gain[i]));
  }
  const C = cones(opts);
  const W = integrate(C, lamp.spd), N = integrate(C, D65), wl = lum(W), wn = lum(N);
  const gain = REF_WHITE.map((r, i) => (r / (W[i] / wl)) ** D * (r / (N[i] / wn)) ** (1 - D));
  let q = integrate(C, L).map((v, i) => (v / wl) * gain[i]);
  if (eye.missing != null) q = dichromat(q, REF_WHITE, eye.missing, eye.anchors);
  return FINAL(mul(LMS_TO_XYZ, q));
}

// How bright the lamp's own white comes out, so a white that falls outside sRGB is dimmed rather
// than clipped (as lamps.js does for the standard eye). Under a dark lamp the eye is set by a
// reference glow (`ref`, light given out by the brightest thing in view) instead of a white.
const exposures = new Map();
function exposure(lamp, eye, opts, ref) {
  const key = `${lamp.id}|${eye.id}|${opts.age}|${opts.field}`;
  if (!exposures.has(key)) {
    const lin = mul(XYZ_TO_SRGB, xyzSeen(lamp.dark && ref ? ref : lamp.spd, lamp, eye, opts));
    exposures.set(key, lamp.dark && ref ? 0.95 / Math.max(...lin) : 1 / Math.max(1, ...lin));
  }
  return exposures.get(key);
}

// The colour of glass with transmission T (and light it gives out, `emitted`) under `lamp`, as
// `eye` sees it, drawn for a screen made for the standard eye. Returns linear and encoded sRGB and css.
export function seenBy(T, lamp, eye, { age = 32, field = 2, emitted = null, ref = null } = {}) {
  const opts = { age, field };
  const L = lamp.spd.map((s, i) => s * T[i] + (emitted ? emitted[i] : 0));
  const k = exposure(lamp, eye, opts, ref);
  const lin = mul(XYZ_TO_SRGB, xyzSeen(L, lamp, eye, opts)).map((v) => v * k);
  const rgb = lin.map(encode);
  return { lin, rgb, css: css(rgb) };
}

// The eye's three sensitivity curves on GRID, each scaled to peak 1, for drawing.
export function curvesOf(eye, opts = {}) {
  const c = eye.kind === 'xyz' ? eye.curves : cones(opts);
  return c.map((k) => { const m = Math.max(...k); return k.map((v) => v / m); });
}
