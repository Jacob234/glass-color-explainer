// vessel.js — path lengths through a blown bowl and a pulled cane, for the stage 03 vessel.
// Pure functions only: no DOM. All lengths are in millimetres. Both objects are solids of
// revolution about a vertical (bowl) or horizontal (cane) axis, so the glass a straight ray
// crosses at offset x from the axis is a difference of chords: 2(√(R² − x²) − √(r² − x²)).

// The chord a ray at offset x cuts through a disc of radius R (0 when it misses).
export const chord = (R, x) => (Math.abs(x) < R ? 2 * Math.sqrt(R * R - x * x) : 0);

// Glass crossed by a ray at offset x through a ring from radius r to R (r = 0: a solid disc).
export const ringPath = (R, r, x) => chord(R, x) - chord(Math.max(0, r), x);

export const BOWL = {
  H: 100, // rim height above the table
  foot: 8, // height of the foot pad
  footR: 32,
  baseR: 30, // outer radius where the bowl meets the foot
  rimR: 85,
  skin: 0.5, // cased: thickness of the colour layer, at right angles to the surface
};

// The bowl's profile at height y, for a wall scaled by `blow` (1 = as drawn).
// R: outer radius; t: wall thickness at right angles to the surface; r: inner radius;
// skinR: inner radius of a cased colour layer; floor: height of the inside floor.
export function profile(y, blow = 1) {
  const { H, foot, footR, baseR, rimR, skin } = BOWL;
  const floor = foot + 6 * blow;
  if (y < 0 || y > H) return null;
  if (y < foot) return { R: footR, t: floor, r: 0, skinR: footR, floor, inFoot: true };
  const s = (y - foot) / (H - foot), u = 1 - s;
  const R = baseR + (rimR - baseR) * (1 - u ** 2.2);
  const slope = ((rimR - baseR) * 2.2 * u ** 1.2) / (H - foot); // dR/dy
  const stretch = Math.sqrt(1 + slope * slope); // a normal thickness spans this much horizontally
  const t = blow * (1.1 + 1.6 * u + 3.5 * u ** 6); // 1.1 mm at the rim, about 6 at the base
  const r = y < floor ? 0 : Math.max(0, R - t * stretch);
  return { R, t: y < floor ? floor : t, r, skinR: Math.max(0, R - skin * stretch), floor, inFoot: false };
}

// Colour-bearing glass a horizontal line of sight crosses at offset x and height y.
// solid: the whole bowl is coloured; cased: only the outer skin is, and the foot is clear.
// back: only the far half of the bowl (the near half cut away).
export function bowlPath(x, y, { blow = 1, cased = false, back = false } = {}) {
  const p = profile(y, blow);
  if (!p) return 0;
  if (cased && p.inFoot) return 0;
  const inner = cased ? Math.max(p.r, p.skinR) : p.r;
  const L = ringPath(p.R, inner, x);
  return back ? L / 2 : L;
}

// The three places the meters read: thickness of coloured glass a ray crosses at right angles.
// The base is the floor and foot together, read straight down.
export function bowlReadings({ blow = 1, cased = false } = {}) {
  const { H, foot, skin } = BOWL;
  const at = (y) => profile(y, blow);
  if (cased) return { rim: skin, wall: skin, base: skin };
  return { rim: at(H).t, wall: at(foot + 0.5 * (H - foot)).t, base: at(0).floor };
}

export const CANE = { R: 6, skin: 0.5, slice: 3 };

// A cane seen from the side: coloured glass crossed at offset x from its axis.
export const canePath = (x, cased = false) => ringPath(CANE.R, cased ? CANE.R - CANE.skin : 0, x);
