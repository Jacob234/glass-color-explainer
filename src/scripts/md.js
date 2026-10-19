// md.js — a two-dimensional molecular-dynamics model glass former. Pure functions only: no DOM.
// Atoms of two sizes interact by Lennard-Jones pair potentials in a square periodic box held at
// constant temperature and pressure. Everything is in Lennard-Jones reduced units: lengths in σ of
// the small atom, energies in ε, masses in m, time in τ = σ√(m/ε). Velocity Verlet integration,
// Berendsen thermostat and barostat.

// The mixture the page runs: half the atoms larger than the other half by a fraction m, all
// bonds equally strong, unlike pairs sized by the Lorentz rule (the mean). With m = 0 every atom
// is alike and the liquid crystallises at once; by m ≈ 0.3 the sizes no longer pack into one
// lattice and the liquid freezes into a glass however slowly it is cooled; in between the
// cooling rate decides. The tests pin those three regimes.
export const mismatch = (m) => ({
  AA: { eps: 1, sig: 1 },
  AB: { eps: 1, sig: 1 + m / 2 },
  BB: { eps: 1, sig: 1 + m },
});

// The textbook model glass former, Kob and Andersen, Phys. Rev. E 51, 4626 (1995): the unlike pair
// binds most strongly, frustrating either species from ordering alone. In two dimensions its
// 80:20 mixture forms hexagonal crystals of A, so Brüning et al. (2009) used 65:35. Kept for
// comparison; at the cooling rates a page can run it neither crystallises nor shows a rate effect.
export const KOB_ANDERSEN = {
  AA: { eps: 1.0, sig: 1.0 },
  AB: { eps: 1.5, sig: 0.8 },
  BB: { eps: 0.5, sig: 0.88 },
};
export const PAIRS = mismatch(0.2);
export const RCUT = 2.5; // cutoff in units of each pair's σ; the potential is shifted to zero there
export const DT = 0.005;

// Pair tables indexed by typeA * 2 + typeB (0 = A, 1 = B), built per system so the mixture can change.
export function pairTables(pairs = PAIRS) {
  const order = ['AA', 'AB', 'AB', 'BB'].map((k) => pairs[k]);
  const s6 = (1 / RCUT) ** 6;
  return {
    eps: order.map((p) => p.eps), sig2: order.map((p) => p.sig ** 2), rc2: order.map((p) => (RCUT * p.sig) ** 2),
    ushift: order.map((p) => 4 * p.eps * (s6 * s6 - s6)), rmax: RCUT * Math.max(...order.map((p) => p.sig)),
  };
}

// A seeded generator (mulberry32), so a run is the same on every load.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

// n atoms, a fraction xB of them type B, on a square grid at number density rho, with random
// velocities at temperature T and the box free to change size at pressure P (null fixes it).
export function createSystem({ n = 400, xB = 0.5, rho = 0.9, T = 1, P = 5, seed = 1, pairs = PAIRS } = {}) {
  const rand = rng(seed);
  const side = Math.ceil(Math.sqrt(n)), L = Math.sqrt(n / rho), a = L / side;
  const s = {
    n, L, t: 0, T, P, tauT: 0.2, tauP: 0.5, kappa: 0.1,
    x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n),
    fx: new Float64Array(n), fy: new Float64Array(n), type: new Uint8Array(n),
    U: 0, W: 0, rand, pt: pairTables(pairs),
  };
  for (let i = 0; i < n; i++) { s.x[i] = ((i % side) + 0.5) * a; s.y[i] = (Math.floor(i / side) + 0.5) * a; }
  const nB = Math.round(xB * n), idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (let k = 0; k < nB; k++) s.type[idx[k]] = 1;
  for (let i = 0; i < n; i++) { s.vx[i] = gauss(rand); s.vy[i] = gauss(rand); }
  zeroMomentum(s); setTemperature(s, T);
  forces(s);
  return s;
}

function zeroMomentum(s) {
  let px = 0, py = 0;
  for (let i = 0; i < s.n; i++) { px += s.vx[i]; py += s.vy[i]; }
  px /= s.n; py /= s.n;
  for (let i = 0; i < s.n; i++) { s.vx[i] -= px; s.vy[i] -= py; }
}

// Kinetic temperature: two degrees of freedom per atom, less the two of the fixed centre of mass.
export function kineticT(s) {
  let k2 = 0;
  for (let i = 0; i < s.n; i++) k2 += s.vx[i] ** 2 + s.vy[i] ** 2;
  return k2 / (2 * s.n - 2);
}
function setTemperature(s, T) {
  const f = Math.sqrt(T / (kineticT(s) || 1e-12));
  for (let i = 0; i < s.n; i++) { s.vx[i] *= f; s.vy[i] *= f; }
}

// Pressure from the virial theorem in two dimensions: P = (N k T + ½ Σ r·F) / A.
export const pressure = (s) => ((2 * s.n - 2) * kineticT(s) / 2 + s.W / 2) / (s.L * s.L);
export const areaPerAtom = (s) => (s.L * s.L) / s.n;
export const potentialPerAtom = (s) => s.U / s.n;

// Neighbour cells at least RMAX wide; each pair is visited once by scanning half the stencil.
function cells(s, rmin) {
  const m = Math.max(3, Math.floor(s.L / rmin)), w = s.L / m;
  const head = new Int32Array(m * m).fill(-1), next = new Int32Array(s.n);
  for (let i = 0; i < s.n; i++) {
    const cx = Math.min(m - 1, Math.floor(s.x[i] / w)), cy = Math.min(m - 1, Math.floor(s.y[i] / w));
    const c = cy * m + cx; next[i] = head[c]; head[c] = i;
  }
  return { m, head, next };
}
const HALF = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// Visit every pair closer than rmax once: fn(i, j, dx, dy, r²) with (dx, dy) from i to j.
export function eachPair(s, rmax, fn) {
  const { m, head, next } = cells(s, rmax), L = s.L, hL = L / 2, r2max = rmax * rmax;
  for (let cy = 0; cy < m; cy++) for (let cx = 0; cx < m; cx++) {
    for (const [ox, oy] of HALF) {
      const c2 = ((cy + oy + m) % m) * m + ((cx + ox + m) % m), same = ox === 0 && oy === 0;
      for (let i = head[cy * m + cx]; i >= 0; i = next[i]) {
        for (let j = same ? next[i] : head[c2]; j >= 0; j = next[j]) {
          let dx = s.x[j] - s.x[i], dy = s.y[j] - s.y[i];
          if (dx > hL) dx -= L; else if (dx < -hL) dx += L;
          if (dy > hL) dy -= L; else if (dy < -hL) dy += L;
          const r2 = dx * dx + dy * dy;
          if (r2 < r2max) fn(i, j, dx, dy, r2);
        }
      }
    }
  }
}

// Forces, potential energy and virial (Σ r·F over pairs).
export function forces(s) {
  const { fx, fy, type } = s, { eps, sig2, rc2, ushift, rmax } = s.pt;
  fx.fill(0); fy.fill(0);
  let U = 0, W = 0;
  eachPair(s, rmax, (i, j, dx, dy, r2) => {
    const k = type[i] * 2 + type[j];
    if (r2 >= rc2[k]) return;
    const sr2 = sig2[k] / r2, sr6 = sr2 * sr2 * sr2;
    U += 4 * eps[k] * (sr6 * sr6 - sr6) - ushift[k];
    const f = (24 * eps[k] * (2 * sr6 * sr6 - sr6)) / r2; // |F| / r, positive is repulsive
    fx[i] -= f * dx; fy[i] -= f * dy; fx[j] += f * dx; fy[j] += f * dy;
    W += f * r2;
  });
  s.U = U; s.W = W;
}

// Advance n steps of velocity Verlet at the system's target T and P. With P = null the box is fixed.
export function step(s, steps = 1) {
  const { n, x, y, vx, vy, fx, fy } = s, h = DT / 2;
  for (let k = 0; k < steps; k++) {
    for (let i = 0; i < n; i++) {
      vx[i] += h * fx[i]; vy[i] += h * fy[i];
      x[i] += DT * vx[i]; y[i] += DT * vy[i];
    }
    if (s.P != null) { // Berendsen barostat: scale lengths so the pressure relaxes toward P
      const mu = Math.max(0.995, Math.min(1.005, 1 - (s.kappa * DT / s.tauP) * (s.P - pressure(s)) / 2));
      s.L *= mu;
      for (let i = 0; i < n; i++) { x[i] *= mu; y[i] *= mu; }
    }
    const L = s.L;
    for (let i = 0; i < n; i++) {
      x[i] -= Math.floor(x[i] / L) * L; y[i] -= Math.floor(y[i] / L) * L;
    }
    forces(s);
    for (let i = 0; i < n; i++) { vx[i] += h * fx[i]; vy[i] += h * fy[i]; }
    // Berendsen thermostat: rescale velocities so the temperature relaxes toward T
    const Tk = kineticT(s), lam = Math.sqrt(Math.max(0.8, Math.min(1.25, 1 + (DT / s.tauT) * (s.T / (Tk || 1e-12) - 1))));
    for (let i = 0; i < n; i++) { vx[i] *= lam; vy[i] *= lam; }
    s.t += DT;
  }
  return s;
}

// Local sixfold bond order, the two-dimensional measure of crystallinity. For each atom,
// ψ6 = (1/n) Σ exp(6iθ) over neighbours within 1.4 σ of the pair. A perfect triangular lattice
// gives |ψ6| = 1 everywhere. An atom counts as crystalline when |ψ6| > 0.7 and at least five of
// its neighbours' ψ6 point the same way as its own (normalised Re ψ6ᵢ ψ6ⱼ* > 0.9): locally
// hexagonal and agreeing with the atoms around it, in the manner of ten Wolde, Ruiz-Montero and
// Frenkel (1995). The thresholds were chosen so a quenched liquid's chance hexagons mostly fail.
export const NEIGH = 1.4;
export function order(s) {
  const { n, type } = s, { sig2 } = s.pt;
  const re = new Float64Array(n), im = new Float64Array(n), cnt = new Uint8Array(n);
  const pairs = [];
  eachPair(s, NEIGH * Math.sqrt(Math.max(...sig2)), (i, j, dx, dy, r2) => {
    const k = type[i] * 2 + type[j];
    if (r2 > NEIGH * NEIGH * sig2[k]) return;
    const th = Math.atan2(dy, dx), c = Math.cos(6 * th), sn = Math.sin(6 * th);
    re[i] += c; im[i] += sn; re[j] += c; im[j] += sn; cnt[i]++; cnt[j]++;
    pairs.push(i, j);
  });
  const mag = new Float64Array(n);
  for (let i = 0; i < n; i++) if (cnt[i]) { re[i] /= cnt[i]; im[i] /= cnt[i]; mag[i] = Math.hypot(re[i], im[i]); }
  const agree = new Uint8Array(n);
  for (let p = 0; p < pairs.length; p += 2) {
    const i = pairs[p], j = pairs[p + 1], d = mag[i] * mag[j];
    if (d > 0 && (re[i] * re[j] + im[i] * im[j]) / d > 0.9 && mag[i] > 0.7 && mag[j] > 0.7) { agree[i]++; agree[j]++; }
  }
  const crystal = new Uint8Array(n);
  let nc = 0, sum = 0;
  for (let i = 0; i < n; i++) { if (agree[i] >= 5) { crystal[i] = 1; nc++; } sum += mag[i]; }
  return { psi: mag, coord: cnt, crystal, fraction: nc / n, meanPsi: sum / n };
}

// Radial distribution function g(r) for all atoms, out to rmax in bins of dr.
export function rdf(s, rmax = 4, dr = 0.05) {
  const bins = Math.ceil(rmax / dr), h = new Float64Array(bins);
  eachPair(s, Math.min(rmax, s.L / 2), (i, j, dx, dy, r2) => { h[Math.floor(Math.sqrt(r2) / dr)] += 2; });
  const rho = s.n / (s.L * s.L);
  const g = Array.from(h, (c, b) => { const r0 = b * dr, r1 = r0 + dr; return c / (s.n * rho * Math.PI * (r1 * r1 - r0 * r0)); });
  return { r: g.map((_, b) => (b + 0.5) * dr), g };
}

// Cool at a steady rate (ε/k per τ) toward Tlo for a number of steps: the thermostat's target
// falls by rate · dt each step and stops at Tlo.
export function cool(s, rate, Tlo, steps = 1) {
  for (let k = 0; k < steps; k++) { s.T = Math.max(Tlo, s.T - rate * DT); step(s, 1); }
  return s;
}
