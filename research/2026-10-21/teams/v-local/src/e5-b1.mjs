// E5: (d) is the b1 field inside a corner's dual cell a function of its 8
// blocks only? (e) independent re-implementation of the vertex rule's field
// (kern.mjs box*tent kernel summed per block, own n27 count), residual |D|
// at the vertices each solver returns, clamp hits, solver disagreement,
// and seam agreement when the region apron is cut to 2 and 1.
//   node e5-b1.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { bspline } from '../../fast/src/kern.mjs';
import { buildGenMeshInput } from '../../fast/src/repo-bundle.mjs';
import { L20, rules, bubbleVertices, r4 } from './common.mjs';

const [out] = process.argv.slice(2);
const res = {};
let seed = 99;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };

// ---- (d) 8-block locality of the kernel sum ----
function localityTest(sigma, trials = 4000) {
  const K = bspline(sigma, 1);
  let maxDiff = 0, worst = null, nz = 0;
  for (let t = 0; t < trials; t++) {
    // 6x6x6 random occupancy around the corner at the origin: blocks with min corner -3..2
    const occ = [];
    for (let x = -3; x < 3; x++) for (let y = -3; y < 3; y++) for (let z = -3; z < 3; z++) if (rnd() < 0.5) occ.push([x, y, z]);
    // a point in the dual cell, biased to the boundary
    const p = [0, 1, 2].map(() => { const u = rnd(); return u < 0.3 ? (rnd() < 0.5 ? -0.5 : 0.5) * (0.98 + 0.02 * rnd()) : u - 0.5; });
    let all = 0, own = 0;
    for (const [x, y, z] of occ) {
      const w = K.k(p[0] - (x + 0.5)) * K.k(p[1] - (y + 0.5)) * K.k(p[2] - (z + 0.5));
      all += w;
      if (x >= -1 && x <= 0 && y >= -1 && y <= 0 && z >= -1 && z <= 0) own += w;
    }
    const d = Math.abs(all - own);
    if (d > 0) nz++;
    if (d > maxDiff) { maxDiff = d; worst = p.map((v) => +v.toFixed(4)); }
  }
  return { sigma, support: +K.support.toFixed(4), trials, maxDiff, trialsWithDiff: nz, worstPoint: worst };
}
res.locality = [0.15, 0.2, 0.204, 0.21, 0.25].map((s) => localityTest(s));
console.log('locality', JSON.stringify(res.locality));

// ---- (e) independent field: D(s) for a corner of a region ----
const K1 = bspline(0.2, 1);
const LT = []; for (let n = 0; n <= 27; n++) { const t = (27 - n) / 26; LT.push(L20.a + L20.b * t ** L20.p); }
function cornerField(reg, NX, NZ, x, y, z) {
  // returns D(s) evaluated from the 8 blocks (x-1..x, y-1..y, z-1..z) and their n27 lambdas
  const SY = NX * NZ, SZ = NX;
  const at = (i, j, k) => reg[j * SY + k * SZ + i] & 0xff;
  const bl = [];
  for (let dy = -1; dy <= 0; dy++) for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
    const m = at(x + dx, y + dy, z + dz);
    if (!m) continue;
    let c = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) if (at(x + dx + a, y + dy + b, z + dz + e) === m) c++;
    bl.push({ c: [dx + 0.5, dy + 0.5, dz + 0.5], m, lam: LT[c] });
  }
  return (s) => {
    let Sa = 0; const S = new Map(), L = new Map();
    for (const b of bl) {
      const w = K1.k(s[0] - b.c[0]) * K1.k(s[1] - b.c[1]) * K1.k(s[2] - b.c[2]);
      Sa += w; S.set(b.m, (S.get(b.m) ?? 0) + w); L.set(b.m, (L.get(b.m) ?? 0) + b.lam * w);
    }
    let best = -Infinity;
    for (const [m, v] of S) if (v > 1e-9) best = Math.max(best, v + L.get(m) / v);
    if (best === -Infinity) best = 0;
    return Sa + best - 1;
  };
}
const grad = (f, s, e = 1e-4) => [0, 1, 2].map((t) => { const a = s.slice(), b = s.slice(); a[t] += e; b[t] -= e; return (f(a) - f(b)) / (2 * e); });

const CH = [[0, 0, 0], [1, 0, 0], [-2, 1, 1], [-2, -1, 1], [-2, -1, 0], [-2, 0, 1]];
const ruleIds = ['bub-b1-newton4', 'bub-b1-newton16', 'bub-b1-line', 'bub-b1-line40'];
const R = Object.fromEntries(ruleIds.map((id) => [id, rules[id]()]));
res.solvers = {};
const agg = Object.fromEntries(ruleIds.map((id) => [id, { corners: 0, clampHits: 0, resid: [], distErr: [], bad: 0, worst: null }]));
const disagree = { n4_vs_line40: 0, n16_vs_line40: 0, line14_vs_line40: 0, maxN4: 0, maxN16: 0 };
for (const c of CH) {
  const { input } = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map());
  const outs = Object.fromEntries(ruleIds.map((id) => [id, bubbleVertices(input.blocks, input.nx, input.ny, input.nz, input.apron, R[id])]));
  const ref = outs['bub-b1-line40'];
  for (const id of ruleIds) {
    const o = outs[id], A = agg[id];
    for (let v = 0; v < o.count; v++) {
      const x = o.corner[v * 3], y = o.corner[v * 3 + 1], z = o.corner[v * 3 + 2];
      const s = [o.off[v * 3], o.off[v * 3 + 1], o.off[v * 3 + 2]];
      const f = cornerField(input.blocks, input.nx, input.nz, x, y, z);
      const D = f(s), g = Math.hypot(...grad(f, s));
      A.corners++;
      if (s.some((q) => Math.abs(q) >= 0.48)) A.clampHits++;
      A.resid.push(Math.abs(D));
      const de = g > 1e-6 ? Math.abs(D) / g : 1;
      A.distErr.push(de);
      if (de > 0.02) { A.bad++; if (!A.worst || de > A.worst.distErr) A.worst = { chunk: c, corner: [x, y, z], s, D: r4(D), distErr: r4(de) }; }
    }
    if (o.count !== ref.count) throw new Error('corner count differs');
  }
  for (let v = 0; v < ref.count; v++) {
    const d = (o) => Math.max(...[0, 1, 2].map((t) => Math.abs(o.off[v * 3 + t] - ref.off[v * 3 + t])));
    const d4 = d(outs['bub-b1-newton4']), d16 = d(outs['bub-b1-newton16']), d14 = d(outs['bub-b1-line']);
    if (d4 > 1 / 256 + 1e-9) disagree.n4_vs_line40++;
    if (d16 > 1 / 256 + 1e-9) disagree.n16_vs_line40++;
    if (d14 > 1 / 256 + 1e-9) disagree.line14_vs_line40++;
    disagree.maxN4 = Math.max(disagree.maxN4, d4); disagree.maxN16 = Math.max(disagree.maxN16, d16);
  }
}
const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
for (const id of ruleIds) {
  const A = agg[id];
  res.solvers[id] = { corners: A.corners, clampHits: A.clampHits, residD_p50: +pct(A.resid, 0.5).toExponential(2), residD_p999: +pct(A.resid, 0.999).toExponential(2), residD_max: +Math.max(...A.resid).toExponential(2),
    distErr_p99: r4(pct(A.distErr, 0.99)), distErr_max: r4(Math.max(...A.distErr)), cornersDistErrOver0_02: A.bad, worst: A.worst };
  console.log(id, JSON.stringify(res.solvers[id]));
}
res.disagreeWithLine40 = { ...disagree, maxN4: r4(disagree.maxN4), maxN16: r4(disagree.maxN16) };
console.log('disagree', JSON.stringify(res.disagreeWithLine40));

// ---- seams with a cut apron ----
function crop(input, k) {
  const NR = input.nx, M = NR - 2 * k, outR = new Uint16Array(M * M * M);
  for (let y = 0; y < M; y++) for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) outR[(y * M + z) * M + x] = input.blocks[((y + k) * NR + (z + k)) * NR + (x + k)];
  return { blocks: outR, n: M, apron: input.apron - k };
}
res.apron = [];
for (const c of [[0, 0, 0], [-2, 1, 1], [-2, -1, 1]]) {
  const { input } = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map());
  const full = bubbleVertices(input.blocks, input.nx, input.ny, input.nz, input.apron, R['bub-b1-line40']);
  for (const k of [1, 2]) {
    const cr = crop(input, k);
    const o = bubbleVertices(cr.blocks, cr.n, cr.n, cr.n, cr.apron, R['bub-b1-line40']);
    let mism = 0, maxd = 0;
    const map = new Map();
    for (let v = 0; v < full.count; v++) map.set([full.corner[v * 3] - input.apron, full.corner[v * 3 + 1] - input.apron, full.corner[v * 3 + 2] - input.apron].join(','), [full.off[v * 3], full.off[v * 3 + 1], full.off[v * 3 + 2]]);
    let seen = 0;
    for (let v = 0; v < o.count; v++) {
      const kk = [o.corner[v * 3] - cr.apron, o.corner[v * 3 + 1] - cr.apron, o.corner[v * 3 + 2] - cr.apron].join(',');
      const q = map.get(kk); seen++;
      if (!q) { mism++; continue; }
      const d = Math.max(...[0, 1, 2].map((t) => Math.abs(q[t] - o.off[v * 3 + t])));
      if (d > 0) mism++;
      maxd = Math.max(maxd, d);
    }
    res.apron.push({ chunk: c, apron: cr.apron, corners: o.count, fullCorners: full.count, mismatchesVsApron3: mism, maxAbsDiff: r4(maxd) });
    console.log('apron', cr.apron, c.join(','), 'mismatches', mism, 'of', o.count, 'max', r4(maxd));
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
