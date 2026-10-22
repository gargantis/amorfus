// Lattice-corner combinatorics shared by every script of team 'table'.
//
// A lattice corner's neighbourhood is its 8 blocks. Position index
// b = ox | oz << 1 | oy << 2 (the mesher's cellBit order, so a solid/air
// mask here is the mesher's bevel mask), octant coordinates (ox, oy, oz) in
// {0, 1}; the block of octant c has its centre at offset c - 0.5 from the
// corner on each axis.
//
// A "labelling" is 8 labels, 0 = air, >0 = a material. The bubble physics
// only sees which blocks share a material (tensions are uniform: solid/air
// 1, different materials g, same material separate clusters eps), so the
// key of a labelling is its restricted-growth form RG (materials renamed
// 1, 2, ... in order of first appearance, air kept 0). A class is an orbit
// of RG strings under the 48 cube symmetries.

export const POS = []; // POS[b] = [x, y, z] in {0,1}
for (let b = 0; b < 8; b++) POS.push([b & 1, (b >> 2) & 1, (b >> 1) & 1]);
export const posIndex = (x, y, z) => x | (z << 1) | (y << 2);

// 48 symmetries: new coordinate t = old coordinate perm[t], flipped if f_t.
export const SYMS = [];
for (const perm of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
  for (let f = 0; f < 8; f++) {
    const sign = [0, 1, 2].map((t) => ((f >> t) & 1 ? -1 : 1));
    const map = POS.map((c) => {
      const q = [0, 1, 2].map((t) => ((f >> t) & 1 ? 1 - c[perm[t]] : c[perm[t]]));
      return posIndex(q[0], q[1], q[2]);
    });
    SYMS.push({ perm, sign, map });
  }
}

/** Apply symmetry g to a labelling: the label moves with its block. */
export function applySym(g, lab) {
  const out = new Array(lab.length);
  const m = SYMS[g].map;
  for (let b = 0; b < 8; b++) out[m[b]] = lab[b];
  return out;
}

/** Point transform of symmetry g on an offset d relative to the corner. */
export const symPoint = (g, d) => {
  const { perm, sign } = SYMS[g];
  return [sign[0] * d[perm[0]], sign[1] * d[perm[1]], sign[2] * d[perm[2]]];
};
/** Inverse point transform: canonical-frame offset -> occurrence frame. */
export const symPointInv = (g, v) => {
  const { perm, sign } = SYMS[g];
  const d = [0, 0, 0];
  for (let t = 0; t < 3; t++) d[perm[t]] = sign[t] * v[t];
  return d;
};

/** Restricted-growth form; also returns the map new label -> old label. */
export function rg(lab) {
  const m = new Map();
  const back = [0];
  const out = lab.map((v) => {
    if (v === 0) return 0;
    if (!m.has(v)) { m.set(v, m.size + 1); back.push(v); }
    return m.get(v);
  });
  return { out, back };
}
export const rgKey = (lab) => rg(lab).out.join('');

/** All RG strings of length 8 (air 0 anywhere, materials in growth order). */
export function allRG(len = 8) {
  const all = [];
  const lab = new Array(len);
  const rec = (i, mx) => {
    if (i === len) { all.push(lab.slice()); return; }
    for (let v = 0; v <= mx + 1; v++) { lab[i] = v; rec(i + 1, Math.max(mx, v)); }
  };
  rec(0, 0);
  return all;
}

/** Canonical form: least RG string over the 48 images; returns key and the
 *  first symmetry achieving it. */
export function canon(lab) {
  let best = null, bg = -1;
  for (let g = 0; g < 48; g++) {
    const k = rgKey(applySym(g, lab));
    if (best === null || k < best) { best = k; bg = g; }
  }
  return { key: best, g: bg };
}

/** Face-connected same-label clusters within the 2x2x2 (solid only). Returns
 *  cluster id per position (0 for air, 1.. in position order). */
export function clusterLabels(lab) {
  const cl = new Array(8).fill(-1);
  let next = 0;
  for (let b = 0; b < 8; b++) {
    if (lab[b] === 0) { cl[b] = 0; continue; }
    if (cl[b] !== -1) continue;
    next++;
    const stack = [b];
    cl[b] = next;
    while (stack.length) {
      const c = stack.pop();
      for (const bit of [1, 2, 4]) {
        const d = c ^ bit;
        if (cl[d] === -1 && lab[d] === lab[c]) { cl[d] = next; stack.push(d); }
      }
    }
  }
  return cl;
}

// The 6 lattice half-edges at the corner: axis a, side s; the 4 blocks
// around it in cyclic order of the other two axes (u, v): (0,0) (1,0) (1,1) (0,1).
export const HALF_EDGES = [];
for (let a = 0; a < 3; a++) {
  const [u, v] = [0, 1, 2].filter((t) => t !== a);
  for (let s = 0; s < 2; s++) {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([pu, pv]) => {
      const c = [0, 0, 0]; c[a] = s; c[u] = pu; c[v] = pv;
      return posIndex(c[0], c[1], c[2]);
    });
    HALF_EDGES.push({ axis: a, side: s, ring });
  }
}

const popcount3 = (x) => (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1);

/** Junction properties of a labelling (material labels, air 0). */
export function classify(lab) {
  const mats = new Set(lab.filter((v) => v !== 0));
  const hasAir = lab.includes(0);
  const cl = clusterLabels(lab);
  const nClu = Math.max(0, ...cl);
  const nMat = mats.size;
  // edges: interfaces around each half-edge (air is one phase)
  let xEdges = 0, x4Distinct = 0, xAmbig = 0, tripleEdges = 0;
  for (const { ring } of HALF_EDGES) {
    const L = ring.map((b) => lab[b]);
    let films = 0;
    for (let i = 0; i < 4; i++) if (L[i] !== L[(i + 1) % 4]) films++;
    if (films === 3) tripleEdges++;
    if (films === 4) {
      xEdges++;
      if (new Set(L).size === 4) x4Distinct++; else xAmbig++;
    }
  }
  // same material in two clusters inside the window
  let ambUnion = false, ambEdge = false, ambVertex = false;
  for (const m of mats) {
    const cs = new Set();
    for (let b = 0; b < 8; b++) if (lab[b] === m) cs.add(cl[b]);
    if (cs.size > 1) {
      ambUnion = true;
      // closest contact between different clusters of m
      let minHam = 4;
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
        if (lab[a] === m && lab[b] === m && cl[a] !== cl[b]) minHam = Math.min(minHam, popcount3(a ^ b));
      }
      if (minHam === 2) ambEdge = true; else ambVertex = true;
    }
  }
  // air split inside the window (classic marching-cubes ambiguity)
  const airLab = lab.map((v) => (v === 0 ? 1 : 0));
  const airCl = clusterLabels(airLab);
  const nAirParts = Math.max(0, ...airLab.map((v, b) => (v ? airCl[b] : 0)));
  const bubblesMat = nMat + (hasAir ? 1 : 0);
  const bubblesClu = nClu + (hasAir ? 1 : 0);
  const over4Mat = bubblesMat > 4, over4Clu = bubblesClu > 4;
  return {
    nMat, nClu, hasAir, bubblesMat, bubblesClu, xEdges, x4Distinct, xAmbig, tripleEdges,
    ambUnion, ambEdge, ambVertex, airSplit: nAirParts > 1, over4Mat, over4Clu,
    plateau: xEdges === 0 && !over4Clu && !ambUnion,
    solidMask: lab.reduce((m, v, b) => m | (v ? 1 << b : 0), 0),
  };
}

/** Build the class table: every RG string -> { cls, g, back } where cls is
 *  the class index, g a symmetry mapping it to the class representative. */
export function buildClassTable() {
  const all = allRG(8);
  const keyToCls = new Map();
  const classes = [];
  const lookup = new Map(); // RG key -> { cls, g }
  for (const lab of all) {
    const { key, g } = canon(lab);
    if (!keyToCls.has(key)) {
      keyToCls.set(key, classes.length);
      classes.push({ key, rep: key.split('').map(Number), size: 0 });
    }
    const cls = keyToCls.get(key);
    classes[cls].size++;
    lookup.set(lab.join(''), { cls, g });
  }
  return { classes, lookup, keyToCls };
}

/** Class of an arbitrary labelling (raw materials): class index, symmetry g
 *  (occurrence -> canonical frame) and the canonical-label -> material map. */
export function classOf(T, lab) {
  const { out } = rg(lab);
  const e = T.lookup.get(out.join(''));
  // canonical labels -> occurrence materials
  const img = applySym(e.g, lab);
  const { back } = rg(img);
  return { cls: e.cls, g: e.g, back };
}
