// The color engine against an independent implementation: colour-science 0.4.7, the reference
// Python library for CIE colorimetry. Expected values are in test/fixtures/colour-science.json,
// built by scripts/build_oracle.py (see there for what is and is not meant to agree).
//
// The one deliberate difference is the observer: the engine uses Wyman, Sloan & Shirley's analytic
// fit, the oracle the tabulated CIE 1931 2° functions. The fit is close from 420 to 670 nm but its
// x̄ tail falls off too fast beyond about 680 nm (half the tabulated value at 700 nm). So the
// tolerances below are per lamp: tight where little light lies past 680 nm (daylight, LED, tube),
// looser for warm light and dull glow, where that tail carries much of the color.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fx from './fixtures/colour-science.json' with { type: 'json' };
import optics from '../src/data/optics.json' with { type: 'json' };
import * as core from '../src/scripts/optics-core.js';
import { GRID, CMF_GRID, spectrumColor, displayMatrix, planck } from '../src/scripts/spectra.js';
import { LAMP } from '../src/scripts/lamps.js';
import { deltaE00 } from '../src/scripts/fit.js';

// Linear sRGB -> XYZ, the exact inverse of the engine's XYZ -> sRGB matrix (IEC 61966-2-1, as
// tabulated by Lindbloom). Not clipped: the oracle compares out-of-gamut colors too.
const SRGB_TO_XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
const mul = (m, v) => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const lab = (xyz) => {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx_, fy, fz] = xyz.map((v, i) => f(v / fx.whiteD65[i]));
  return [116 * fy - 16, 500 * (fx_ - fy), 200 * (fy - fz)];
};
const chromaticity = (spd) => {
  const xyz = [0, 0, 0];
  spd.forEach((s, i) => { for (let k = 0; k < 3; k++) xyz[k] += s * CMF_GRID[i][k]; });
  const sum = xyz[0] + xyz[1] + xyz[2];
  return [xyz[0] / sum, xyz[1] / sum];
};
const matmul = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((t, v, k) => t + v * b[k][j], 0)));
const inverse = (m) => {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C;
  return [[A, c * h - b * i, b * f - c * e], [B, a * i - c * g, c * d - a * f], [C, b * g - a * h, a * e - b * d]].map((r) => r.map((v) => v / det));
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Worst CIEDE2000 allowed, per lamp, between the engine's color and the oracle's. 1 is about a
// just-noticeable difference side by side. Measured worst cases when written (2026-10-20), adapted
// / unadapted: D65 0.67 / 0.67, LED-B3 0.45 / 0.65, FL11 0.32 / 0.40, A 1.64 / 1.27,
// 1850 K 4.10 / 6.64 (CdSe red and cobalt's deep-red window).
const TOLERANCE = { D65: 1, 'LED-B3': 1, FL11: 1, A: 2, 'blackbody-1850': 7 };

test('fixture covers every colorant in optics.json, on the engine grid', () => {
  assert.deepEqual(fx.grid, GRID);
  const ids = new Set(fx.samples.map((s) => s.id));
  for (const c of optics.colorants) assert.ok(ids.has(c.id), c.id);
  for (const r of optics.recipes) assert.ok(ids.has(`recipe:${r.id}`), r.id);
});

test('observer: the Wyman–Sloan–Shirley fit is within 0.025 of the CIE 1931 table everywhere', () => {
  // Peaks are about 1.06 (x̄), 1.00 (ȳ) and 1.78 (z̄), so this is under 2.5% of each peak.
  GRID.forEach((w, i) => {
    const e = core.cmf(w), r = fx.cmf[i];
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(e[k] - r[k]) < 0.025, `${'xyz'[k]}̄(${w}) ${e[k].toFixed(4)} vs ${r[k].toFixed(4)}`);
  });
});

test('observer: the fit loses the red tail of x̄ beyond 680 nm (known; why warm-light tolerances are looser)', () => {
  // Pinned so a better observer shows up here: replace this test when the engine changes.
  const at = (w) => [core.cmf(w)[0], fx.cmf[GRID.indexOf(w)][0]];
  const [e700, r700] = at(700), [e730, r730] = at(730);
  assert.ok(e700 < 0.6 * r700 && e730 < 0.2 * r730);
});

test('sRGB matrix and Bradford adaptation agree with colour-science', () => {
  // displayMatrix maps XYZ to linear sRGB after adapting from a lamp's white to D65. With no
  // adaptation it is just the engine's sRGB matrix (IEC 61966-2-1, which publishes 4 decimals).
  const plain = displayMatrix(fx.lamps.A.spd, 0);
  plain.forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(v - fx.srgbMatrix[i][j]) < 5e-4, `sRGB[${i}][${j}]`)));
  // With full adaptation it is sRGB · Bradford⁻¹ · diag(D65 / white) · Bradford, built here from
  // colour-science's Bradford matrix and the engine's own white for the lamp (so the observer
  // cancels out and only the adaptation is tested).
  for (const lamp of ['A', 'FL11', 'blackbody-1850']) {
    const spd = fx.lamps[lamp].spd, white = [0, 0, 0];
    spd.forEach((s, i) => { for (let k = 0; k < 3; k++) white[k] += s * CMF_GRID[i][k]; });
    const B = fx.bradford, src = mul(B, white.map((v) => v / white[1])), dst = mul(B, fx.whiteD65);
    const scaled = B.map((row, i) => row.map((v) => (v * dst[i]) / src[i]));
    const expected = matmul(fx.srgbMatrix, matmul(inverse(B), scaled));
    displayMatrix(spd, 1).forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(v - expected[i][j]) < 1e-3, `${lamp}[${i}][${j}] ${v} vs ${expected[i][j]}`)));
  }
});

test('lamp whites: chromaticity of colour-science\'s illuminants through the engine observer', () => {
  // Δxy allowed; D65 sits where the fit is good, tungsten and candle lean on the red tail.
  const allowed = { D65: 2e-4, 'LED-B3': 0.001, FL11: 0.001, A: 0.002, 'blackbody-1850': 0.005 };
  for (const [id, lamp] of Object.entries(fx.lamps)) {
    const d = dist(chromaticity(lamp.spd), lamp.xy);
    assert.ok(d < allowed[id], `${id}: Δxy ${d.toFixed(5)}`);
  }
});

test('the page\'s own lamps match the CIE illuminants they stand for', () => {
  // lamps.js builds daylight, tube and LED from lamps.json and tungsten from Planck's law at 2856 K;
  // CIE A is that black body too (with the older c₂ = 1.435e-2), so they agree in chromaticity.
  const pairs = { daylight: 'D65', tube: 'FL11', led: 'LED-B3', tungsten: 'A', candle: 'blackbody-1850' };
  for (const [page, cie] of Object.entries(pairs)) {
    const d = dist(chromaticity(LAMP[page].spd), chromaticity(fx.lamps[cie].spd));
    assert.ok(d < 2e-4, `${page} vs ${cie}: Δxy ${d.toFixed(5)}`);
  }
});

test('black-body glow: chromaticity of Planck\'s law matches the oracle at furnace temperatures', () => {
  // Δxy allowed by temperature. Glass at a dull red heat (800–1000 K) emits mostly past 650 nm,
  // where the observer fit is weakest, so its glow color is the engine's least accurate number.
  const allowed = (T) => (T >= 2800 ? 0.002 : T >= 1400 ? 0.008 : 0.03);
  for (const { T, xy } of fx.blackbody) {
    const d = dist(chromaticity(planck(T)), xy);
    assert.ok(d < allowed(T), `${T} K: Δxy ${d.toFixed(5)}`);
  }
});

for (const adapted of [true, false]) {
  test(`spectrumColor matches colour-science for every colorant and recipe (${adapted ? 'eye adapted to the lamp' : 'no adaptation'})`, () => {
    for (const s of fx.samples) {
      for (const [lamp, ref] of Object.entries(adapted ? s.adapted : s.unadapted)) {
        const { lin } = spectrumColor(s.T, fx.lamps[lamp].spd, adapted ? 1 : 0);
        const d = deltaE00(lab(mul(SRGB_TO_XYZ, lin)), ref.Lab);
        assert.ok(d < TOLERANCE[lamp], `${s.id} under ${lamp}: ΔE00 ${d.toFixed(2)}`);
      }
    }
  });
}

test('optics-core transmittedXYZ matches colour-science on optics.json\'s 25 nm curves', () => {
  // The mixing lab's path. optics.json's daylight is a hand-drawn ≈D65 and its incandescent a ≈A ramp.
  const allowed = { daylight: 1, incandescent: 2 };
  for (const c of fx.coarse) {
    const colorant = optics.colorants.find((x) => x.id === c.colorant);
    const illuminant = optics.illuminants.find((x) => x.id === c.illuminant);
    const xyz = core.transmittedXYZ(optics.wavelengths, colorant.absorbance, illuminant.spd);
    const d = deltaE00(lab(xyz), c.Lab);
    assert.ok(d < allowed[c.illuminant], `${c.colorant} under ${c.illuminant}: ΔE00 ${d.toFixed(2)}`);
  }
});
