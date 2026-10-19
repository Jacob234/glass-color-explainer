// lamps.js — the lamps the whole home page can be lit by, on the 5 nm GRID.
// Pure functions only: no DOM. Each lamp is a spectral power distribution (relative units) plus
// how far the eye adapts to it. spectrumColor already takes any SPD, so a lamp is just data.
import data from '../data/lamps.json' with { type: 'json' };
import { GRID, spectrumColor, radianceColor, encode, css } from './spectra.js';
import { cmf } from './optics-core.js';
import { FINE, lineSpectrum, SODIUM_D } from './flare.js';
import { UV, EXT, fluorescence } from './uranium.js';

// A CIE table (5 nm from `start`) cut to a grid; 0 where the table has no data (below 380 nm for
// the lamps CIE tabulates only in the visible).
const table = (id, grid = GRID) => {
  const { start, spd } = data.tables[id];
  return grid.map((w) => (w < start ? 0 : spd[(w - start) / data.step]));
};
const planckOn = (grid, T) => grid.map((w) => w ** -5 / (Math.exp(1.4388e7 / (w * T)) - 1));
const noUV = (spd) => [...UV.map(() => 0), ...spd];

// A 365 nm ultraviolet LED torch: a band about 10 nm wide, and a weak tail toward longer wavelengths
// that is the faint violet you see when you look at one. Nearly all of its power is invisible.
const BLACK = EXT.map((w) => Math.exp(-4 * Math.LN2 * ((w - 365) / 10) ** 2) + (w > 365 ? 0.01 * Math.exp(-(w - 365) / 12) : 0));

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

// ext: the lamp on EXT (300–780 nm), since the ultraviolet drives fluorescence; spd is its visible
// part on GRID. adapt: degree of adaptation (CIECAM02's D). The eye discounts most of a broadband lamp's tint but
// not all of it, which is why a tungsten-lit room still looks warm. It cannot discount a single
// wavelength at all: with nothing to compare, there is no white to adapt to.
export const LAMPS = [
  { id: 'daylight', label: 'daylight', ext: table('D65', EXT), adapt: 1,
    note: 'CIE D65, the standard for average daylight. Every color on the page was first computed under this light.' },
  { id: 'candle', label: 'candle', ext: planckOn(EXT, 1850), adapt: 0.6,
    note: 'A candle flame glows like a black body at about 1850 K. Almost no blue: cobalt goes dark and inky, and the yellows and reds look richer.' },
  { id: 'tungsten', label: 'tungsten', ext: planckOn(EXT, 2856), adapt: 0.7,
    note: 'An incandescent bulb (CIE illuminant A, a black body at 2856 K). Warm, smooth, and with every wavelength present, so colors shift but none disappear.' },
  { id: 'sodium', label: 'sodium street lamp', ext: noUV(lines(SODIUM_D)), lines: SODIUM_D, adapt: 0,
    note: 'A low-pressure sodium lamp emits almost only at 589 nm. With one wavelength there is nothing to compare, so there is no hue: each piece is the same orange, lighter or darker, and anything that absorbs 589 nm goes black.' },
  { id: 'led', label: 'white LED', ext: table('LED-B3', EXT), adapt: 0.8,
    note: 'CIE LED-B3: a blue chip at about 450 nm under a yellow phosphor. The dip near 480 nm and the weak deep red are where it differs from daylight.' },
  { id: 'tube', label: 'fluorescent tube', ext: table('FL11', EXT), adapt: 0.8,
    note: 'CIE FL11, a tri-phosphor tube. Its light comes in three narrow bands near 435, 545 and 610 nm, so glass with narrow absorption lines, like neodymium, can change color under it. CIE tabulates it from 380 nm, so its small mercury ultraviolet is left out.' },
  { id: 'black', label: 'black light', ext: BLACK, adapt: 0, dark: true,
    note: 'A 365 nm ultraviolet torch in a dark room. There is almost no visible light for any glass to take away, so every piece goes dark. Except one: uranium glass absorbs the ultraviolet and gives it back as green. Sweep the torch across the table.' },
].map((l) => ({ ...l, spd: l.ext.slice(UV.length) }));
export const LAMP = Object.fromEntries(LAMPS.map((l) => [l.id, l]));

// The color of the lamp's own light, brightest channel 1 (for a swatch of the lamp itself).
export function lampColor(spd) {
  const xyz = [0, 0, 0];
  GRID.forEach((w, i) => { const c = cmf(w); for (let k = 0; k < 3; k++) xyz[k] += spd[i] * c[k]; });
  const M = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
  const lin = M.map((r) => Math.max(0, r[0] * xyz[0] + r[1] * xyz[1] + r[2] * xyz[2])), peak = Math.max(...lin);
  return css(lin.map((v) => encode(v / peak)));
}

// Color of transmission T under a lamp, after the eye's partial adaptation. When the lamp's own
// white falls outside sRGB (a sodium lamp is a single spectral color), everything is dimmed by the
// same factor so the white just fits, rather than clipping toward a different hue.
// emitted is light the glass gives out itself (uranium.js fluorescence), on GRID.
// A dark lamp (the black light) has no white to set the eye by, so the eye is set by the brightest
// thing in view instead: a reference piece of uranium glass, drawn just short of full brightness.
const ONES = GRID.map(() => 1), exposure = new Map();
function scaleFor(lamp) {
  if (!exposure.has(lamp)) {
    let k;
    if (lamp.dark) {
      const g = radianceColor(fluorescence(lamp.ext), lamp.spd, lamp.adapt).lin;
      k = 0.95 / Math.max(...g);
    } else k = 1 / Math.max(1, ...spectrumColor(ONES, lamp.spd, lamp.adapt).lin);
    exposure.set(lamp, k);
  }
  return exposure.get(lamp);
}
export function underLamp(T, lamp, emitted = null) {
  const L = lamp.spd.map((s, i) => s * T[i] + (emitted ? emitted[i] : 0));
  const { lin } = radianceColor(L, lamp.spd, lamp.adapt, scaleFor(lamp));
  const rgb = lin.map(encode);
  return { lin, rgb, css: css(rgb) };
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
