// raytrace.js — a 2D spectral light tracer for glass on the light table. Pure functions: no DOM.
// Light is traced one wavelength at a time, so refraction can depend on wavelength (dispersion)
// and absorption can follow the glass's own density spectrum along the path (Beer–Lambert).
// It is a model: the world is a flat plane (a beam raking across paper), each ray carries one
// wavelength, and polarisation is averaged away in the Fresnel terms.
import { GRID } from './spectra.js';

// Sellmeier coefficients (λ in µm, C in µm²) from the SCHOTT catalogue, via refractiveindex.info.
// N-BK7 is a borosilicate crown (nd 1.5168, Abbe 64); N-SF11 a dense flint (nd 1.7847, Abbe 25.7).
// Soda-lime window and studio glass is a crown with dispersion close to BK7's.
export const GLASSES = {
  crown: { label: 'crown (N-BK7)', B: [1.03961212, 0.231792344, 1.01046945], C: [0.00600069867, 0.0200179144, 103.560653] },
  flint: { label: 'dense flint (N-SF11)', B: [1.73759695, 0.313747346, 1.89878101], C: [0.013188707, 0.0623068142, 155.23629] },
};
export function sellmeier({ B, C }, nm) {
  const l2 = (nm / 1000) ** 2;
  return Math.sqrt(1 + B.reduce((s, b, k) => s + (b * l2) / (l2 - C[k]), 0));
}

// Unpolarised Fresnel reflectance at a dielectric boundary, from relative index eta = n1/n2.
// Returns 1 past the critical angle (total internal reflection).
export function fresnel(cosI, eta) {
  const sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T >= 1) return 1;
  const cosT = Math.sqrt(1 - sin2T);
  const rs = (eta * cosI - cosT) / (eta * cosI + cosT), rp = (cosI - eta * cosT) / (cosI + eta * cosT);
  return 0.5 * (rs * rs + rp * rp);
}

// Regular polygon helpers, in scene units (mm).
export const prism = (cx, cy, side, rot = 0) => regular(cx, cy, side / Math.sqrt(3), 3, rot - Math.PI / 2);
export const slab = (cx, cy, w, h, rot = 0) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => turn(cx, cy, x, y, rot));
// A biconvex lens as a polygon: two circular arcs of radius R meeting at the rim, height h.
export function lens(cx, cy, h, R, rot = 0, steps = 96) {
  const a = Math.asin(h / 2 / R), sag = R - R * Math.cos(a), pts = [];
  for (let i = 0; i <= steps; i++) { const t = -a + (2 * a * i) / steps; pts.push([R * Math.cos(t) - R + sag, R * Math.sin(t)]); }
  for (let i = 0; i <= steps; i++) { const t = a - (2 * a * i) / steps; pts.push([-(R * Math.cos(t) - R + sag), R * Math.sin(t)]); }
  return pts.map(([x, y]) => turn(cx, cy, x, y, rot));
}
function regular(cx, cy, r, n, rot) {
  return Array.from({ length: n }, (_, i) => { const t = rot + (2 * Math.PI * i) / n; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });
}
function turn(cx, cy, x, y, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [cx + c * x - s * y, cy + s * x + c * y];
}

// Nearest crossing of the ray (o, d) with any piece's edge beyond eps.
function hit(pieces, ox, oy, dx, dy) {
  let best = Infinity, piece = -1, nx = 0, ny = 0;
  pieces.forEach((p, k) => {
    const v = p.poly;
    for (let i = 0; i < v.length; i++) {
      const [ax, ay] = v[i], [bx, by] = v[(i + 1) % v.length];
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((ax - ox) * ey - (ay - oy) * ex) / den, u = ((ax - ox) * dy - (ay - oy) * dx) / den;
      if (t > 1e-6 && u >= 0 && u <= 1 && t < best) { best = t; piece = k; nx = ey; ny = -ex; }
    }
  });
  const len = Math.hypot(nx, ny) || 1;
  return { t: best, piece, nx: nx / len, ny: ny / len };
}

// Trace one ray of wavelength index i (on GRID, jittered to nm) carrying power w.
// pieces: [{ poly, glass, density }] where density[i] is decadic absorbance per mm (0 for clear).
// Calls deposit(x0, y0, x1, y1, i, w) for each straight run; the power w is what the run carries.
// rand: () => 0..1. bounds: [x0, y0, x1, y1] the scene, past which rays are dropped.
export function traceRay(pieces, ray, rand, deposit, bounds, maxBounces = 12) {
  let { x, y, dx, dy, i, nm, w } = ray, inside = -1;
  for (let b = 0; b <= maxBounces && w > 1e-4; b++) {
    const h = hit(pieces, x, y, dx, dy);
    const t = Math.min(h.t, exitDistance(x, y, dx, dy, bounds));
    const ex = x + dx * t, ey = y + dy * t;
    if (inside >= 0) {
      const after = w * 10 ** -(pieces[inside].density[i] * t); // Beer–Lambert along the run
      deposit(x, y, ex, ey, i, w, after);
      w = after;
    } else deposit(x, y, ex, ey, i, w, w);
    if (h.t > t || h.piece < 0) return;
    // Orient the normal against the ray; entering if we are in air, else leaving this piece.
    let { nx, ny } = h;
    let cosI = -(dx * nx + dy * ny);
    if (cosI < 0) { nx = -nx; ny = -ny; cosI = -cosI; }
    const entering = inside < 0, n = sellmeier(GLASSES[pieces[h.piece].glass], nm);
    const eta = entering ? 1 / n : n;
    x = ex; y = ey;
    if (rand() < fresnel(cosI, eta)) { // reflect
      dx += 2 * cosI * nx; dy += 2 * cosI * ny;
    } else { // refract (Snell)
      const cosT = Math.sqrt(1 - eta * eta * (1 - cosI * cosI));
      dx = eta * dx + (eta * cosI - cosT) * nx; dy = eta * dy + (eta * cosI - cosT) * ny;
      inside = entering ? h.piece : -1;
    }
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  }
}

function exitDistance(x, y, dx, dy, [x0, y0, x1, y1]) {
  const tx = dx > 0 ? (x1 - x) / dx : dx < 0 ? (x0 - x) / dx : Infinity;
  const ty = dy > 0 ? (y1 - y) / dy : dy < 0 ? (y0 - y) / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

// A beam from a slit: parallel rays across a width, wavelength drawn uniformly over GRID with the
// lamp's power as weight, so a line lamp (sodium) gives one colour and daylight all of them.
export function slitRay(beam, spd, rand) {
  const i = Math.floor(rand() * GRID.length), s = (rand() - 0.5) * beam.width;
  const dx = Math.cos(beam.angle), dy = Math.sin(beam.angle);
  return { x: beam.x - dy * s, y: beam.y + dx * s, dx, dy, i, nm: GRID[i] + (rand() - 0.5) * 5, w: spd[i] };
}
