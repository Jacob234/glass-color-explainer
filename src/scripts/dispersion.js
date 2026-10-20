// dispersion.js — refraction and dispersion in clear glass. Pure functions only: no DOM.
// Index n(λ) from published Sellmeier or Cauchy fits (data/glasses.json), Snell's law and Fresnel
// reflection at each surface, a 2D ray tracer for a convex piece of glass, and the thin-lens
// achromat. The colors come from the same observer as the rest of the page (spectra.js).
import data from '../data/glasses.json' with { type: 'json' };

export const GLASSES = data.glasses;
export const GLASS = Object.fromEntries(GLASSES.map((g) => [g.id, g]));

// The Fraunhofer lines the optical industry quotes: F and C are hydrogen, d is helium.
export const LINES = { F: 486.13, d: 587.56, C: 656.27 };

// Refractive index at a wavelength in nm.
export function index(glass, nm) {
  const l2 = (nm / 1000) ** 2, k = glass.coef;
  if (glass.formula === 'cauchy') return k[0] + k[1] * l2 + k[2] / l2;
  let n2 = 1;
  for (let i = 0; i < k.length; i += 2) n2 += (k[i] * l2) / (l2 - k[i + 1]);
  return Math.sqrt(n2);
}

// Abbe number V_d = (n_d − 1)/(n_F − n_C): how much the glass bends light, over how much it spreads it.
// High V is a crown, low V a flint.
export const abbe = (g) => (index(g, LINES.d) - 1) / (index(g, LINES.F) - index(g, LINES.C));
export const spread = (g) => index(g, LINES.F) - index(g, LINES.C);

// The Sellmeier terms whose resonance lies in the ultraviolet (√C below 0.4 µm), as wavelengths in nm.
// A Sellmeier fit behaves like a sum of oscillators: each term's index rises toward its resonance.
// The nearer the ultraviolet resonance sits to the visible, the steeper n climbs at the blue end.
export function uvResonance(g) {
  if (g.formula !== 'sellmeier') return null;
  const r = [];
  for (let i = 1; i < g.coef.length; i += 2) { const w = 1000 * Math.sqrt(g.coef[i]); if (w < 400) r.push(w); }
  return Math.max(...r);
}

/* ---------- surfaces ---------- */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// Unpolarised Fresnel reflectance going from index n1 to n2 at incidence cosine ci (transmitted cosine ct).
export function fresnel(n1, n2, ci, ct) {
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
  return (rs * rs + rp * rp) / 2;
}

// Snell's law in vector form. d: unit direction; nrm: unit normal facing back toward the incoming ray.
// Returns the refracted direction and the reflectance, or null past the critical angle.
export function refract(d, nrm, n1, n2) {
  const eta = n1 / n2, ci = -dot(d, nrm), k = 1 - eta * eta * (1 - ci * ci);
  if (k < 0) return null;
  const ct = Math.sqrt(k), f = eta * ci - ct;
  return { dir: [eta * d[0] + f * nrm[0], eta * d[1] + f * nrm[1]], R: fresnel(n1, n2, ci, ct) };
}
const reflect = (d, nrm) => { const c = 2 * dot(d, nrm); return [d[0] - c * nrm[0], d[1] - c * nrm[1]]; };

// Trace one ray through a convex polygon of glass of index n in air. Follows the transmitted ray at
// each surface (the reflected share is counted as lost) and reflects totally when the ray inside meets
// a face past the critical angle. Returns the path, the final direction, the share of light that
// gets through (Fresnel), and how many total internal reflections it took.
export function trace(poly, n, origin, dir, maxEvents = 8) {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
    let nx = ey / len, ny = -ex / len;
    if ((a[0] + b[0]) / 2 * nx - cx * nx + ((a[1] + b[1]) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
    return { a, ex, ey, out: [nx, ny] };
  });
  let o = origin, d = dir, inside = false, T = 1, tir = 0, last = -1;
  const pts = [o];
  for (let ev = 0; ev < maxEvents; ev++) {
    let best = Infinity, hit = -1;
    edges.forEach((e, i) => {
      if (i === last) return;
      const den = d[0] * e.ey - d[1] * e.ex;
      if (Math.abs(den) < 1e-12) return;
      const qx = e.a[0] - o[0], qy = e.a[1] - o[1];
      const t = (qx * e.ey - qy * e.ex) / den, u = (qx * d[1] - qy * d[0]) / den;
      if (t > 1e-9 && u >= 0 && u <= 1 && t < best) { best = t; hit = i; }
    });
    if (hit < 0) return { pts, dir: d, T: inside ? 0 : T, tir, out: !inside && ev > 0 };
    o = [o[0] + best * d[0], o[1] + best * d[1]]; pts.push(o); last = hit;
    const out = edges[hit].out;
    if (!inside) {
      const r = refract(d, out, 1, n);
      d = r.dir; T *= 1 - r.R; inside = true;
    } else {
      const nrm = [-out[0], -out[1]], r = refract(d, nrm, n, 1);
      if (!r) { d = reflect(d, nrm); tir++; } else { d = r.dir; T *= 1 - r.R; inside = false; }
    }
  }
  return { pts, dir: d, T: inside ? 0 : T, tir, out: !inside };
}

// An equilateral prism (60° apex) of side s, centred on its centroid at (cx, cy), turned by deg.
// y runs downward, as on screen; at deg = 0 the apex points up.
export function prism(cx, cy, s, deg) {
  const th = (deg * Math.PI) / 180, R = s / Math.sqrt(3);
  return [-90, 30, 150].map((a) => {
    const t = (a * Math.PI) / 180 + th;
    return [cx + R * Math.cos(t), cy + R * Math.sin(t)];
  });
}

/* ---------- a cut piece: total internal reflection ---------- */
const DEG = Math.PI / 180;

// Past the critical angle, sin θ_c = 1/n, light inside the glass cannot get out into air at all.
export const criticalAngle = (n) => Math.asin(1 / n) / DEG;

// The section of a brilliant-cut piece through its axis, girdle radius R, centered on the girdle's
// top edge at (cx, cy), y downward: a flat table on top, crown facets sloping down to the girdle at
// crown°, a thin girdle, and pavilion facets meeting at the culet at pavilion° to the girdle plane.
// The default proportions are Tolkowsky's (1919) for diamond: table 53% of the width, crown 34.5°.
export function brilliant(cx, cy, R, pavilion, { table = 0.53, crown = 34.5, girdle = 0.02 } = {}) {
  const t = table * R, hc = (R - t) * Math.tan(crown * DEG), g = girdle * R, d = R * Math.tan(pavilion * DEG);
  return [[-t, -hc], [t, -hc], [R, 0], [R, g], [0, g + d], [-R, g], [-R, 0]].map(([x, y]) => [cx + x, cy + y]);
}

// Pavilion angles that send a ray coming straight down the axis back up after two total reflections,
// in this section: the first pavilion facet meets it at the pavilion angle α, so α must pass θ_c; the
// ray then crosses to the opposite facet and meets it at 180° − 3α, which must pass θ_c too.
export const returnWindow = (n) => { const c = criticalAngle(n); return [c, (180 - c) / 3]; };

// Light falling on the piece along dir as a beam of parallel rays wide enough to cover it, count
// rays across. Each ray is traced at index n and sorted by where it leaves: up (through the table
// or crown, back toward a viewer above), down (through the pavilion or girdle), or not at all.
// Shares are of the light that meets the piece; what each surface reflects partially (Fresnel)
// is lost, counted in neither. only: [x0, x1] limits the beam to rays aimed between those x at y = cy.
export function beamFate(poly, n, dir, count, { cy = 0, only = null, rays = false } = {}) {
  const perp = [-dir[1], dir[0]], s = poly.map((p) => dot(p, perp)), far = 1e3;
  const c = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
  let lo = Math.min(...s), hi = Math.max(...s);
  if (only) {
    // a ray through (x, cy) along dir sits at x·perp[0] + cy·perp[1] across the beam
    const a = only[0] * perp[0] + cy * perp[1], b = only[1] * perp[0] + cy * perp[1];
    lo = Math.min(a, b); hi = Math.max(a, b);
  }
  const back = dot(c, dir) - far, w = (hi - lo) / count, out = { up: 0, down: 0, list: rays ? [] : null };
  for (let k = 0; k < count; k++) {
    const q = lo + (k + 0.5) * w, o = [q * perp[0] + back * dir[0], q * perp[1] + back * dir[1]];
    const r = trace(poly, n, o, dir, 12);
    if (r.pts.length < 2) continue;
    const exit = r.pts[r.pts.length - 1], up = r.out && exit[1] <= cy + 1e-9;
    if (r.out) out[up ? 'up' : 'down'] += r.T / count;
    if (rays) out.list.push({ r, up, w });
  }
  return out;
}

// Deviation of a ray, in degrees, from its incoming direction.
export const deviation = (din, dout) => (Math.acos(Math.max(-1, Math.min(1, dot(din, dout)))) * 180) / Math.PI;

// Where a beam of half-width w lands on a card. The card is perpendicular to the reference exit ray
// (ref: { p, dir }) at distance D along it; s is the position across the card. Returns, per wavelength,
// the interval [a, b] the beam covers and the share of its light that got through, or null if lost.
export function onCard(poly, glass, wavelengths, origin, dir, w, ref, D) {
  const perp = [-dir[1], dir[0]];
  const c0 = [ref.p[0] + D * ref.dir[0], ref.p[1] + D * ref.dir[1]], across = [-ref.dir[1], ref.dir[0]];
  return wavelengths.map((nm) => {
    const n = index(glass, nm), ends = [-w, w].map((k) => {
      const r = trace(poly, n, [origin[0] + k * perp[0], origin[1] + k * perp[1]], dir);
      if (!r.out || r.T === 0 || r.tir) return null;
      const p = r.pts[r.pts.length - 1], den = dot(r.dir, ref.dir);
      if (den <= 1e-6) return null;
      const t = dot([c0[0] - p[0], c0[1] - p[1]], ref.dir) / den, q = [p[0] + t * r.dir[0], p[1] + t * r.dir[1]];
      return { s: dot([q[0] - c0[0], q[1] - c0[1]], across), T: r.T };
    });
    if (!ends[0] || !ends[1]) return null;
    return { a: Math.min(ends[0].s, ends[1].s), b: Math.max(ends[0].s, ends[1].s), T: (ends[0].T + ends[1].T) / 2 };
  });
}

/* ---------- lenses ---------- */
// A thin lens's power scales with n(λ) − 1. For a lens of focal length f at the d line, the focal
// length at λ. A cemented thin achromat splits the power between a crown and a flint so that the F and
// C foci coincide: φ₁ = φV₁/(V₁ − V₂), φ₂ = −φV₂/(V₁ − V₂). The residual is the secondary spectrum.
export function focal(f, crown, flint = null) {
  const nd1 = index(crown, LINES.d) - 1;
  if (!flint) return (nm) => f * nd1 / (index(crown, nm) - 1);
  const V1 = abbe(crown), V2 = abbe(flint), nd2 = index(flint, LINES.d) - 1, phi = 1 / f;
  const p1 = (phi * V1) / (V1 - V2), p2 = (-phi * V2) / (V1 - V2);
  return (nm) => 1 / (p1 * (index(crown, nm) - 1) / nd1 + p2 * (index(flint, nm) - 1) / nd2);
}

// Share of a uniformly lit disc of radius 1 lying left of x = u (the blur of a defocused point,
// seen across an edge).
export function discCdf(u) {
  if (u <= -1) return 0;
  if (u >= 1) return 1;
  return 0.5 + (u * Math.sqrt(1 - u * u) + Math.asin(u)) / Math.PI;
}

// A thin black line of width bar on white paper, imaged by a lens of aperture radius a onto a card at
// distance z. Each wavelength focuses at fl(λ), so it blurs into a disc of radius a|z − fl|/fl, never
// smaller than the diffraction spot. Returns the share of each wavelength's light reaching position x
// (same units as bar), ready to color as a transmission spectrum.
export function lineImage(fl, wavelengths, a, z, bar, x) {
  return wavelengths.map((nm) => {
    const F = fl(nm), r = Math.max((a * Math.abs(z - F)) / F, (1.22 * nm * 1e-6 * F) / (2 * a));
    return 1 - (discCdf((x + bar / 2) / r) - discCdf((x - bar / 2) / r));
  });
}
