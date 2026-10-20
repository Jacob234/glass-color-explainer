// labs.js — the labs index. Each lab is shown as one piece of glass on the light table, and each
// piece's color is computed like every other on the site: optics.json absorbance, Beer–Lambert,
// D65, CIE 1931 2°, sRGB. Pure: runs at build time in Labs.astro and in the tests.
import optics from '../data/optics.json' with { type: 'json' };
import { colorantDensity, transmission, spectrumColor } from './spectra.js';
import { LAMP } from './lamps.js';

const density = Object.fromEntries(optics.colorants.map((c) => [c.id, colorantDensity(c, optics.wavelengths)]));

// melt: [[colorantId, concentration], ...] in optics.json's units, seen through its reference path.
export const meltColor = (melt) =>
  spectrumColor(transmission(melt.map(([id, c]) => [density[id], c])), LAMP.daylight.spd, LAMP.daylight.adapt).css;

// glass: the piece's melt. Mixing shows two melts and, where they overlap, both in one path.
export const LABS = [
  { slug: 'light-lab', name: 'Light Lab', kicker: 'refraction, ray by ray', shape: 'prism',
    blurb: 'Rake a beam across a dark table through prisms and lenses of seven glasses, each ray bent by its own index.',
    glass: [['cobalt', 0.5]] },
  { slug: 'forming-lab', name: 'Forming lab', kicker: 'viscosity at the pipe', shape: 'gather',
    blurb: 'Keep a gather on the pipe: viscosity from a measured glass, sag, blowing and cooling computed.',
    glass: [['gold-colloid', 0.6]] },
  { slug: 'structure-lab', name: 'Structure lab', kicker: 'the glass transition, with atoms', shape: 'network',
    blurb: 'Cool a liquid of 400 atoms fast or slow and watch it lock into a glass or order into a crystal.',
    glass: [['iron-ferrous', 0.5]] },
  { slug: 'mixing-lab', name: 'Mixing lab', kicker: 'Beer–Lambert by hand', shape: 'pair',
    blurb: 'Melt up to four colorants, set the wall thickness, and see the color the batch would make.',
    glass: [['copper', 1]], second: [['cds', 1]] },
  { slug: 'library', name: 'Library', kicker: 'where the numbers come from', shape: 'slides',
    blurb: 'Every datasheet, standard table and measurement the site computes from, and what each license allows.',
    glass: [['neodymium', 1]] },
].map((lab) => ({
  ...lab,
  color: meltColor(lab.glass),
  ...(lab.second && { color2: meltColor(lab.second), overlap: meltColor([...lab.glass, ...lab.second]) }),
}));
