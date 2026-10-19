// lamps.js — the lamps the whole home page can be lit by, on the 5 nm GRID.
// Pure functions only: no DOM. Each lamp is a spectral power distribution (relative units) plus
// how far the eye adapts to it. spectrumColor already takes any SPD, so a lamp is just data.
import data from '../data/lamps.json' with { type: 'json' };
import { GRID, planck, spectrumColor, encode, css } from './spectra.js';
import { cmf } from './optics-core.js';
import { FINE, lineSpectrum, SODIUM_D } from './flare.js';

// A CIE table (5 nm from `start`) cut to GRID.
const table = (id) => {
  const { start, spd } = data.tables[id];
  return GRID.map((w) => spd[(w - start) / data.step]);
};

// Emission lines (nm, relative power) binned onto GRID: each line's energy is shared between its
// two neighbouring samples, so a trapezoid integral over the grid gets the whole line.
export function lines(list) {
  const out = GRID.map(() => 0), step = GRID[1] - GRID[0];
  for (const [w, a] of list) {
    const i = Math.floor((w - GRID[0]) / step), f = (w - GRID[i]) / step;
    out[i] += a * (1 - f); out[i + 1] += a * f;
  }
  return out;
}

// adapt: degree of adaptation (CIECAM02's D). The eye discounts most of a broadband lamp's tint but
// not all of it, which is why a tungsten-lit room still looks warm. It cannot discount a single
// wavelength at all: with nothing to compare, there is no white to adapt to.
export const LAMPS = [
  { id: 'daylight', label: 'daylight', spd: table('D65'), adapt: 1,
    note: 'CIE D65, the standard for average daylight. Every colour on the page was first computed under this light.' },
  { id: 'candle', label: 'candle', spd: planck(1850), adapt: 0.6,
    note: 'A candle flame glows like a black body at about 1850 K. Almost no blue: cobalt goes dark and inky, and the yellows and reds look richer.' },
  { id: 'tungsten', label: 'tungsten', spd: planck(2856), adapt: 0.7,
    note: 'An incandescent bulb (CIE illuminant A, a black body at 2856 K). Warm, smooth, and with every wavelength present, so colours shift but none disappear.' },
  { id: 'sodium', label: 'sodium street lamp', spd: lines(SODIUM_D), lines: SODIUM_D, adapt: 0,
    note: 'A low-pressure sodium lamp emits almost only at 589 nm. With one wavelength there is nothing to compare, so there is no hue: each piece is the same orange, lighter or darker, and anything that absorbs 589 nm goes black.' },
  { id: 'led', label: 'white LED', spd: table('LED-B3'), adapt: 0.8,
    note: 'CIE LED-B3: a blue chip at about 450 nm under a yellow phosphor. The dip near 480 nm and the weak deep red are where it differs from daylight.' },
  { id: 'tube', label: 'fluorescent tube', spd: table('FL11'), adapt: 0.8,
    note: 'CIE FL11, a tri-phosphor tube. Its light comes in three narrow bands near 435, 545 and 610 nm, so glass with narrow absorption lines, like neodymium, can change colour under it.' },
];
export const LAMP = Object.fromEntries(LAMPS.map((l) => [l.id, l]));

// The colour of the lamp's own light, brightest channel 1 (for a swatch of the lamp itself).
export function lampColor(spd) {
  const xyz = [0, 0, 0];
  GRID.forEach((w, i) => { const c = cmf(w); for (let k = 0; k < 3; k++) xyz[k] += spd[i] * c[k]; });
  const M = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
  const lin = M.map((r) => Math.max(0, r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2])), peak = Math.max(...lin);
  return css(lin.map((v) => encode(v / peak)));
}

// Colour of transmission T under a lamp, after the eye's partial adaptation. When the lamp's own
// white falls outside sRGB (a sodium lamp is a single spectral colour), everything is dimmed by the
// same factor so the white just fits, rather than clipping toward a different hue.
const ONES = GRID.map(() => 1), exposure = new Map();
export function underLamp(T, lamp) {
  if (!exposure.has(lamp)) exposure.set(lamp, 1 / Math.max(1, ...spectrumColor(ONES, lamp.spd, lamp.adapt).lin));
  const k = exposure.get(lamp), { lin } = spectrumColor(T, lamp.spd, lamp.adapt);
  const rgb = lin.map((v) => encode(v * k));
  return { lin: lin.map((v) => v * k), rgb, css: css(rgb) };
}

// A lamp on flare.js's 1 nm grid (380–1400 nm), for the didymium lenses. Line lamps are rebuilt from
// their lines at 1 nm, since the lens notch is narrower than a 5 nm sample; the rest are interpolated.
export function fineSpd(lamp) {
  if (lamp.lines) return lineSpectrum(lamp.lines);
  return FINE.map((w) => {
    if (w > 780) return 0;
    const i = Math.min(GRID.length - 2, Math.floor((w - 380) / 5)), f = (w - GRID[i]) / 5;
    return lamp.spd[i] * (1 - f) + lamp.spd[i + 1] * f;
  });
}
