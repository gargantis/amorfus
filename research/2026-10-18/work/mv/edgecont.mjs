// Continuity of the rendered material across triangle edges: for every edge
// shared by two triangles (by position, any material), sample the fragment's
// material along the edge from each side (16 samples) and count edges whose
// sequences differ (a boundary that steps at the edge). Also across chunk
// borders of the seams.mjs world: edges on x = 32 / z = 32 seen from both
// chunks.   node work/mv/edgecont.mjs <module> [apron]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS } from '../../harness/core.mjs';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const ap = Number(process.argv[3] ?? mod.apron ?? 10);
const NS = 16;
const HIST = { le2: 0, le4: 0, gt4: 0, count: 0 };
const h = (x, z) => 9 + 4 * Math.exp(-((x - 30) ** 2 + (z - 34) ** 2) / (2 * 7 ** 2)) + 0.6 * Math.sin(x * 0.31) * Math.cos(z * 0.27);
const plan = (x, z) => {
  if (Math.hypot(x + 0.5 - 31.2, z + 0.5 - 30.4) < 4.3) return STONE;
  if (z + 0.5 > 0.5 * (x + 0.5) + 30.7) return SAND;
  if (x - z === 6 && x > 20 && x < 44) return STONE;
  return GRASS;
};
const world = (x, y, z) => {
  if (Math.hypot(x + 0.5 - 33, y + 0.5 - 12, z + 0.5 - 12) < 5.2 && y >= 12) return { v: PLANKS, edited: true };
  if (z >= 40 && z < 48 && x >= 24 && x < 40 && y >= 12 && y + 0.5 < 12 + (x + 0.5 - 24) / 4) return { v: STONE, edited: true };
  if (Math.hypot(x + 0.5 - 40, y + 0.5 - 13, z + 0.5 - 31) < 4 && y < 13) return { v: AIR, edited: true };
  const d = h(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const q = (v) => Math.round(v * 256);
// transition positions along a sample string; two sides agree if they have
// the same number of transitions at positions within one sample
const trans = (s) => { const t = []; for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) t.push(i); return t; };
const agree = (a, b) => { const ta = trans(a), tb = trans(b); if (ta.length !== tb.length) return false; for (let i = 0; i < ta.length; i++) if (Math.abs(ta[i] - tb[i]) > 1) return false; return true; };
function edgeSamples(m, frag) {
  // map: edge key (sorted quantised endpoints) → list of material strings (one per incident triangle)
  const out = new Map();
  const dim = m.attrDim ?? 0, tmp = new Float64Array(Math.max(1, dim));
  const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
  for (let t = 0; t < m.T; t++) {
    const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const i = e, j = (e + 1) % 3, k = (e + 2) % 3;
      const P = (v) => `${q(m.pos[v * 3] + m.shift[0])},${q(m.pos[v * 3 + 1])},${q(m.pos[v * 3 + 2] + m.shift[2])}`;
      const ka = P(vs[i]), kb = P(vs[j]);
      const fwd = ka < kb;
      const key = fwd ? `${ka}|${kb}` : `${kb}|${ka}`;
      let s = '';
      for (let n = 0; n < NS; n++) {
        let u = (n + 0.5) / NS; if (!fwd) u = 1 - u;
        const w = [0, 0, 0]; w[i] = 1 - u; w[j] = u; w[k] = 0;
        for (let d = 0; d < dim; d++) tmp[d] = w[0] * m.attrs[vs[0] * dim + d] + w[1] * m.attrs[vs[1] * dim + d] + w[2] * m.attrs[vs[2] * dim + d];
        info.t = t; info.a = vs[0]; info.b = vs[1]; info.c = vs[2]; info.ownMat = m.mat[vs[0]];
        s += frag ? frag(tmp, info) : m.mat[vs[0]];
      }

      const l = out.get(key); if (l) l.push(s); else out.set(key, [s]);
    }
  }
  return out;
}
function interior(label, m) {
  m.shift = [0, 0, 0];
  const es = edgeSamples(m, mod.fragment ? (a, i) => mod.fragment(a, i, null) : null);
  let shared = 0, bad = 0, withB = 0;
  for (const l of es.values()) {
    if (l.length !== 2) continue;
    shared++;
    const mixed = /(.)(?!\1)./.test(l[0] + l[1]) ;
    if (new Set((l[0] + l[1]).split('')).size > 1) withB++;
    if (!agree(l[0], l[1])) {
      bad++;
      const ta = trans(l[0]), tb = trans(l[1]);
      if (ta.length !== tb.length) HIST.count++;
      else { let mx = 0; for (let i = 0; i < ta.length; i++) mx = Math.max(mx, Math.abs(ta[i] - tb[i])); HIST[mx <= 2 ? 'le2' : mx <= 4 ? 'le4' : 'gt4']++; }
      if (process.env.SHOW && bad <= 12) console.log('  ', label, l[0], l[1]);
    }
  }
  return { shared, withB, bad };
}
// interior continuity on bench chunks (shared edges inside one chunk; edges between materials always differ in hints, so count only edges where both triangles have the same own material)
let tot = { shared: 0, withB: 0, bad: 0 };
for (const c of [[-1, 1, 1], [0, 0, -3], [1, 0, 0], [-2, 1, 2]]) {
  const m = mod.mesh(buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: ap }).input, null, core);
  const r = interior(c.join(','), m);
  tot.shared += r.shared; tot.withB += r.withB; tot.bad += r.bad;
}
console.log('  step sizes (in 1/16 of an edge):', JSON.stringify(HIST));
console.log(`interior edges (4 bench chunks): ${tot.shared} shared, ${tot.withB} show a material change, ${tot.bad} have a boundary that steps at the edge`);
// chunk borders of the seams world
let bShared = 0, bBad = 0, bWithB = 0;
for (const [a, b, axis] of [[[0, 0], [1, 0], 0], [[0, 0], [0, 1], 2], [[0, 1], [1, 1], 0]]) {
  const ma = mod.mesh(core.buildRegion((x, y, z) => world(x + a[0] * 32, y, z + a[1] * 32), ap), null, core); ma.shift = [a[0] * 32, 0, a[1] * 32];
  const ea = edgeSamples(ma, mod.fragment ? (x, i) => mod.fragment(x, i, null) : null);
  const mb = mod.mesh(core.buildRegion((x, y, z) => world(x + b[0] * 32, y, z + b[1] * 32), ap), null, core); mb.shift = [b[0] * 32, 0, b[1] * 32];
  const eb = edgeSamples(mb, mod.fragment ? (x, i) => mod.fragment(x, i, null) : null);
  const border = (axis === 0 ? b[0] : b[1]) * 32 * 256;
  for (const [k, la] of ea) {
    const [p, r] = k.split('|').map((s) => s.split(',').map(Number));
    if (p[axis] !== border || r[axis] !== border) continue;
    const lb = eb.get(k);
    if (!lb) continue;
    bShared++;
    if (new Set((la.join('') + lb.join('')).split('')).size > 1) bWithB++;
    if (!agree(la[0], lb[0])) bBad++;
  }
}
console.log(`chunk-border edges (seams world, apron ${ap}): ${bShared} shared, ${bWithB} show a material change, ${bBad} have a boundary that steps at the border`);
// borders between adjacent real-terrain chunks
let tS = 0, tB = 0, tW = 0;
for (const [a, b, axis] of [[[-2, 1, 1], [-1, 1, 1], 0], [[-1, 1, 1], [-1, 1, 2], 2], [[-2, 1, 1], [-2, 1, 2], 2], [[-3, 1, 0], [-2, 1, 0], 0], [[-3, 1, 1], [-2, 1, 1], 0], [[0, 0, 0], [1, 0, 0], 0], [[0, 0, 0], [0, 0, 1], 2], [[-1, 0, 0], [0, 0, 0], 0], [[-2, 1, 0], [-2, 1, 1], 2], [[-1, 1, 2], [0, 1, 2], 0]]) {
  const ma = mod.mesh(buildGenMeshInput([1, 1], ...a, new Map(), { forceApron: ap }).input, null, core); ma.shift = [a[0] * 32, 0, a[2] * 32];
  const ea = edgeSamples(ma, mod.fragment ? (x, i) => mod.fragment(x, i, null) : null);
  const mb = mod.mesh(buildGenMeshInput([1, 1], ...b, new Map(), { forceApron: ap }).input, null, core); mb.shift = [b[0] * 32, 0, b[2] * 32];
  const eb = edgeSamples(mb, mod.fragment ? (x, i) => mod.fragment(x, i, null) : null);
  const border = (axis === 0 ? b[0] : b[2]) * 32 * 256;
  for (const [k, la] of ea) {
    const [p, r] = k.split('|').map((s) => s.split(',').map(Number));
    if (p[axis] !== border || r[axis] !== border) continue;
    const lb = eb.get(k);
    if (!lb) continue;
    tS++;
    if (new Set((la.join('') + lb.join('')).split('')).size > 1) tW++;
    if (!agree(la[0], lb[0])) tB++;
  }
}
console.log(`chunk-border edges (10 real-terrain chunk pairs, apron ${ap}): ${tS} shared, ${tW} show a material change, ${tB} have a boundary that steps at the border`);
