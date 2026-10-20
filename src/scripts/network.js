// network.js — what a silicate glass is made of, read from atom positions. Takes a periodic box of
// O, Si and Na (from the precomputed LAMMPS quenches in src/data/glass3d/) and finds the Si–O
// bonds, each oxygen's role (bridging two tetrahedra or hanging off one), each silicon's Qⁿ (how many
// of its four corners it shares) and the rings of tetrahedra, counted the way King (1967) defined
// them. Pure: runs at build time for the charts and in the browser for the viewer.

export const O = 0, SI = 1, NA = 2;
export const MASS = [15.999, 28.086, 22.99]; // g/mol
// An Si–O bond is any pair closer than the first minimum of g_SiO, which lies near 2.2 Å in
// silica and silicates (bonds are about 1.6 Å, the next oxygens beyond 3.5 Å).
export const SIO_CUT = 2.2;
// Na–O first shell, out to the first minimum of g_NaO (about 3.1 Å in sodium silicates).
export const NAO_CUT = 3.1;
export const RING_MAX = 10; // longest ring looked for, in tetrahedra

// Decode the compact form the data files use: types as one letter per atom (o, s, n) and positions
// as integers in hundredths of an ångström, flattened x, y, z.
export function decode(d) {
  const n = d.types.length, type = new Uint8Array(n), x = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) type[i] = 'osn'.indexOf(d.types[i]);
  for (let k = 0; k < 3 * n; k++) x[k] = d.pos[k] / 100;
  return { n, type, x, L: d.L };
}

// Minimum-image vector from atom i to atom j.
export function delta(s, i, j, out = [0, 0, 0]) {
  for (let a = 0; a < 3; a++) {
    let v = s.x[3 * j + a] - s.x[3 * i + a];
    const L = s.L[a];
    v -= L * Math.round(v / L);
    out[a] = v;
  }
  return out;
}

// All pairs (i of type ti, j of type tj) closer than rc, by a cell list. Returns, for each i of type
// ti, the list of j.
export function neighbors(s, ti, tj, rc) {
  const nc = s.L.map((L) => Math.max(1, Math.floor(L / rc)));
  const cell = (k) => {
    const c = [0, 1, 2].map((a) => {
      const f = s.x[3 * k + a] / s.L[a];
      return ((Math.floor((f - Math.floor(f)) * nc[a]) % nc[a]) + nc[a]) % nc[a];
    });
    return c;
  };
  const bins = new Map();
  for (let j = 0; j < s.n; j++) {
    if (s.type[j] !== tj) continue;
    const key = cell(j).join();
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(j);
  }
  const out = new Map(), d = [0, 0, 0], rc2 = rc * rc;
  for (let i = 0; i < s.n; i++) {
    if (s.type[i] !== ti) continue;
    const [cx, cy, cz] = cell(i), seen = new Set(), list = [];
    for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) for (let az = -1; az <= 1; az++) {
      const key = [(cx + ax + nc[0]) % nc[0], (cy + ay + nc[1]) % nc[1], (cz + az + nc[2]) % nc[2]].join();
      if (seen.has(key)) continue; // small boxes: the same cell can come round twice
      seen.add(key);
      for (const j of bins.get(key) ?? []) {
        if (j === i) continue;
        delta(s, i, j, d);
        if (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] < rc2) list.push(j);
      }
    }
    out.set(i, list);
  }
  return out;
}

// The network: Si–O bonds, oxygen roles, Qⁿ and the Si–Si links through bridging oxygens.
export function network(s) {
  const siO = neighbors(s, SI, O, SIO_CUT);
  const oSi = new Map();
  for (const [si, os] of siO) for (const o of os) { if (!oSi.has(o)) oSi.set(o, []); oSi.get(o).push(si); }
  const role = new Int8Array(s.n).fill(-1); // for O: number of Si bonded (2 = bridging, 1 = non-bridging)
  for (let i = 0; i < s.n; i++) if (s.type[i] === O) role[i] = oSi.get(i)?.length ?? 0;
  const q = new Int8Array(s.n).fill(-1), coord = new Int8Array(s.n).fill(-1);
  const links = new Map(); // Si → Si neighbors through a shared oxygen
  for (const [si, os] of siO) {
    coord[si] = os.length;
    q[si] = os.filter((o) => role[o] >= 2).length;
    const nb = new Set();
    for (const o of os) for (const other of oSi.get(o)) if (other !== si) nb.add(other);
    links.set(si, [...nb]);
  }
  return { siO, oSi, role, q, coord, links };
}

// Shortest-path rings in King's sense: for every Si and every pair of its linked neighbors, the
// shortest closed path through that Si and those two neighbors. Each distinct ring is kept once.
// Returns rings as lists of Si indices in order around the ring.
export function rings(net, max = RING_MAX) {
  const found = new Map();
  for (const [si, nb] of net.links) {
    for (let a = 0; a < nb.length; a++) for (let b = a + 1; b < nb.length; b++) {
      const path = shortestPath(net.links, nb[a], nb[b], si, max - 1);
      if (!path) continue;
      const ring = [si, ...path];
      const key = [...ring].sort((u, v) => u - v).join();
      if (!found.has(key)) found.set(key, ring);
    }
  }
  return [...found.values()];
}

// Breadth-first shortest path from a to b that never visits `avoid`; null if longer than maxNodes.
function shortestPath(links, a, b, avoid, maxNodes) {
  const prev = new Map([[a, -1]]);
  let frontier = [a];
  for (let depth = 1; depth < maxNodes && frontier.length; depth++) {
    const next = [];
    for (const u of frontier) for (const v of links.get(u)) {
      if (v === avoid || prev.has(v)) continue;
      prev.set(v, u);
      if (v === b) {
        const path = [b];
        for (let w = u; w !== -1; w = prev.get(w)) path.push(w);
        return path.reverse();
      }
      next.push(v);
    }
    frontier = next;
  }
  return null;
}

// Si–O–Si angle at every bridging oxygen, in degrees.
export function bridgeAngles(s, net) {
  const out = [], u = [0, 0, 0], v = [0, 0, 0];
  for (const [o, sis] of net.oSi) {
    if (sis.length !== 2) continue;
    delta(s, o, sis[0], u); delta(s, o, sis[1], v);
    const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v);
    out.push((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return out;
}

export function density(s) {
  let m = 0;
  for (let i = 0; i < s.n; i++) m += MASS[s.type[i]];
  return m / 6.02214076e23 / (s.L[0] * s.L[1] * s.L[2] * 1e-24); // g/cm³
}

// Everything the page reports about one glass.
export function summarize(s) {
  const net = network(s), rs = rings(net);
  const count = (t) => s.type.reduce((k, ti) => k + (ti === t), 0);
  const nSi = count(SI), nO = count(O), nNa = count(NA);
  const qn = [0, 0, 0, 0, 0], co = { 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < s.n; i++) if (s.type[i] === SI) {
    if (net.coord[i] === 4) qn[net.q[i]]++;
    co[Math.max(3, Math.min(5, net.coord[i]))]++;
  }
  const ringCounts = {};
  for (const r of rs) ringCounts[r.length] = (ringCounts[r.length] ?? 0) + 1;
  let nbo = 0, bo = 0;
  for (let i = 0; i < s.n; i++) if (s.type[i] === O) { if (net.role[i] === 1) nbo++; else if (net.role[i] === 2) bo++; }
  const angles = bridgeAngles(s, net);
  const hist = new Array(18).fill(0); // 90°–180° in 5° bins
  for (const a of angles) hist[Math.min(17, Math.max(0, Math.floor((a - 90) / 5)))]++;
  const peak = 90 + 5 * hist.indexOf(Math.max(...hist)) + 2.5;
  let naO = 0;
  if (nNa) for (const [, os] of neighbors(s, NA, O, NAO_CUT)) naO += os.length;
  return {
    atoms: { O: nO, Si: nSi, Na: nNa },
    density: density(s),
    qn: qn.map((k) => k / nSi), // fraction of all Si; four-coordinated only
    siCoord: { 3: co[3] / nSi, 4: co[4] / nSi, 5: co[5] / nSi },
    nbo: nbo / nO, bo: bo / nO,
    rings: Object.fromEntries(Object.entries(ringCounts).map(([k, v]) => [k, v / nSi])), // rings per Si
    angle: { mean: angles.reduce((a, b) => a + b, 0) / angles.length, peak, hist },
    naO: nNa ? naO / nNa : null,
  };
}

// The binary (Zachariasen–Warren) model of a modified network: each Na₂O breaks one Si–O–Si bridge
// into two non-bridging oxygens, and the breaks fall on as few tetrahedra as possible, so only two
// neighboring Qⁿ species coexist. x is the mole fraction of Na₂O.
export function binaryQn(x) {
  const nboPerSi = (2 * x) / (1 - x), q = [0, 0, 0, 0, 0];
  const lo = 4 - Math.ceil(nboPerSi), f = Math.ceil(nboPerSi) - nboPerSi;
  if (nboPerSi === 0) { q[4] = 1; return q; }
  q[lo] = 1 - f; q[lo + 1] = f;
  return q;
}
