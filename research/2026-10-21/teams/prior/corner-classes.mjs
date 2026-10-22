// Junction classes of lattice corners for "each block is a bubble".
// A corner's neighbourhood is 2x2 (2D) or 2x2x2 (3D) cells, each air or a
// material. For the bubble model only equality matters (which cells share a
// material; which are air), so a configuration is a set partition of the
// cells with at most one block marked "air". We count them, count their
// classes under the square / cube symmetry group, and classify each class by
// Plateau's laws (Taylor 1976; Surface Evolver's popping criteria):
//  - a lattice line through the corner is surrounded by 4 cells in cyclic
//    order; films = cyclic neighbours with different labels. 0 or 2 films:
//    fine; 3: a triple line (Plateau-legal); 4: an X line - not an
//    equilibrium, must undergo a T1-type split (Evolver: "edges with more
//    than three facets ... split into triple-facet edges").
//  - at the corner point (3D), more than 4 distinct regions can never be an
//    equilibrium (Taylor's cones have at most 4 regions).
// For each X line we also say whether the split is decided by tensions:
// the two possible central films are the two diagonals (a,c) and (b,d);
// the first-order energy change of splitting with central film tension tau
// is (tau - sqrt2) L for unit outer films at 90 deg (derivation in REPORT),
// so the lower-tension diagonal wins; equal tensions are a tie that a rule
// must break. Tensions: same label 0 (same material unites, air is one
// phase), solid-air 1, solid-solid g (generic g != 1 assumed for "decided").
// Pure combinatorics; writes corner-classes.json.
import { writeFileSync } from 'node:fs';

function setPartitionsWithAir(n) {
  // restricted growth strings over n cells; then optionally mark one block as air
  const out = [];
  const rec = (i, arr, mx) => {
    if (i === n) { out.push(arr.slice()); return; }
    for (let b = 0; b <= mx + 1; b++) { arr[i] = b; rec(i + 1, arr, Math.max(mx, b)); }
  };
  rec(0, new Array(n), -1);
  const res = [];
  for (const p of out) {
    const blocks = Math.max(...p) + 1;
    res.push(p.map((b) => b + 1)); // no air: labels 1..k
    for (let a = 0; a < blocks; a++) res.push(p.map((b) => (b === a ? 0 : b + 1))); // block a is air (label 0)
  }
  return res;
}

// canonical form: relabel solids by first appearance, air stays 0
function canon(cfg) {
  const map = new Map([[0, 0]]); let next = 1;
  return cfg.map((v) => { if (!map.has(v)) map.set(v, next++); return map.get(v); }).join(',');
}

// symmetry groups as cell permutations
function group2D() {
  // cells (x,y) in {0,1}^2, index x + 2y
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const idx = (x, y) => x + 2 * y;
  const ops = [];
  for (const swap of [false, true]) for (const fx of [false, true]) for (const fy of [false, true]) {
    ops.push(pts.map(([x, y]) => { let [u, v] = swap ? [y, x] : [x, y]; if (fx) u = 1 - u; if (fy) v = 1 - v; return idx(u, v); }));
  }
  return ops;
}
function group3D() {
  const pts = []; for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) pts.push([x, y, z]);
  const idx = (x, y, z) => x + 2 * y + 4 * z;
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const ops = [];
  for (const P of perms) for (let f = 0; f < 8; f++) {
    ops.push(pts.map((p) => { const q = P.map((a) => p[a]); for (let t = 0; t < 3; t++) if (f >> t & 1) q[t] = 1 - q[t]; return idx(...q); }));
  }
  return ops;
}

function orbitKey(cfg, ops) {
  let best = null;
  for (const op of ops) {
    const img = new Array(cfg.length);
    for (let i = 0; i < cfg.length; i++) img[op[i]] = cfg[i];
    const k = canon(img);
    if (best === null || k < best) best = k;
  }
  return best;
}

// lines through the corner: the 4 cells around it in cyclic order
const LINES2D = [[0, 1, 3, 2]]; // the corner point itself in 2D
function lines3D() {
  const idx = (x, y, z) => x + 2 * y + 4 * z;
  const L = [];
  // line along axis a at the two half-lines (other coordinate of the axis = 0 or 1)
  for (let a = 0; a < 3; a++) for (let h = 0; h < 2; h++) {
    const [b, c] = [0, 1, 2].filter((t) => t !== a);
    const cyc = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => { const p = [0, 0, 0]; p[a] = h; p[b] = u; p[c] = v; return idx(...p); });
    L.push(cyc);
  }
  return L;
}
const tau = (x, y) => (x === y ? 0 : x === 0 || y === 0 ? 1 : 'g');

function classify(cfg, lines) {
  let xLines = 0, xTie = 0, xDecided = 0, triple = 0, xTieG1 = 0;
  const xKinds = {};
  for (const L of lines) {
    const v = L.map((i) => cfg[i]);
    let films = 0; for (let t = 0; t < 4; t++) if (v[t] !== v[(t + 1) % 4]) films++;
    if (films === 3) triple++;
    if (films === 4) {
      xLines++;
      const t1 = tau(v[0], v[2]), t2 = tau(v[1], v[3]);
      const kind = `${t1}|${t2}`.split('|').sort().join('|');
      xKinds[kind] = (xKinds[kind] ?? 0) + 1;
      if (t1 === t2) xTie++; else xDecided++;
      const h = (t) => (t === 'g' ? 1 : t);
      if (h(t1) === h(t2)) xTieG1++;
    }
  }
  const regions = new Set(cfg).size;
  const solids = new Set(cfg.filter((v) => v !== 0)).size;
  return { xLines, xTie, xDecided, xTieG1, triple, regions, solids, xKinds };
}

function run(dim) {
  const n = dim === 2 ? 4 : 8;
  const ops = dim === 2 ? group2D() : group3D();
  const lines = dim === 2 ? LINES2D : lines3D();
  const all = setPartitionsWithAir(n);
  const classes = new Map();
  for (const c of all) {
    const k = orbitKey(c, ops);
    if (!classes.has(k)) classes.set(k, { rep: k, count: 0, ...classify(c, lines) });
    classes.get(k).count++;
  }
  const list = [...classes.values()];
  const mixed = list.filter((c) => c.rep.split(',').includes('0') && c.rep.split(',').some((x) => x !== '0')); // corner has air and solid: a surface corner
  const summ = (L) => ({
    classes: L.length,
    configs: L.reduce((a, c) => a + c.count, 0),
    withXLine: L.filter((c) => c.xLines > 0).length,
    withTiedXLine: L.filter((c) => c.xTie > 0).length,
    withOnlyDecidedX: L.filter((c) => c.xLines > 0 && c.xTie === 0).length,
    withTiedXLineAtG1: L.filter((c) => c.xTieG1 > 0).length,
    over4Regions: L.filter((c) => c.regions > 4).length,
    plateauLegalTopology: L.filter((c) => c.xLines === 0 && c.regions <= 4).length,
    byRegions: Object.fromEntries([...new Set(L.map((c) => c.regions))].sort().map((r) => [r, L.filter((c) => c.regions === r).length])),
  });
  // binary (air/solid only) check against the known 22 classes of 2^8 under 48 ops
  let binary = null;
  if (dim === 3) {
    const seen = new Set();
    for (let m = 0; m < 256; m++) {
      const cfg = Array.from({ length: 8 }, (_, i) => (m >> i & 1 ? 1 : 0));
      seen.add(orbitKey(cfg, ops));
    }
    binary = seen.size;
  }
  const le = (k) => mixed.filter((c) => c.solids <= k);
  return { dim, labelledConfigs: all.length, groupOrder: ops.length, all: summ(list), surfaceCorners: summ(mixed), surfaceUpTo1Solid: summ(le(1)), surfaceUpTo2Solids: summ(le(2)), surfaceUpTo3Solids: summ(le(3)), binaryClasses: binary,
    examples: list.filter((c) => c.xLines > 0).slice(0, 12).map((c) => ({ rep: c.rep, xLines: c.xLines, xTie: c.xTie, xKinds: c.xKinds, regions: c.regions })) };
}

const res = { note: 'labels: 0 = air, 1.. = distinct materials (equality pattern only); cell index x + 2y (+ 4z)', d2: run(2), d3: run(3) };
writeFileSync(new URL('./corner-classes.json', import.meta.url), JSON.stringify(res, null, 1));
const pick = (r) => ({ labelled: r.labelledConfigs, binary: r.binaryClasses, all: r.all, surface: r.surfaceCorners, surf1: r.surfaceUpTo1Solid, surf2: r.surfaceUpTo2Solids, surf3: r.surfaceUpTo3Solids });
console.log(JSON.stringify({ d2: pick(res.d2), d3: pick(res.d3) }));
