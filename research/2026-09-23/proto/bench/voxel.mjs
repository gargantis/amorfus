// Minimal voxel terrain generator + naive Surface Nets mesher, for timing only.
import { createNoise2D, createNoise3D } from 'simplex-noise';

// Deterministic PRNG (mulberry32) — arithmetic + Math.imul only.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGen(seed) {
  const n2 = createNoise2D(mulberry32(seed));
  const n3 = createNoise3D(mulberry32(seed + 1));
  const n3c = createNoise3D(mulberry32(seed + 2));
  function height(x, z) {
    let f = 1 / 256, a = 1, h = 0;
    for (let o = 0; o < 5; o++) { h += a * n2(x * f, z * f); f *= 2; a *= 0.5; }
    return 40 + h * 36; // ~ [4, 76]
  }
  // coarse: sample 3D density on a 4-block lattice and trilinearly interpolate
  return function generate(cx, cy, cz, S, pad, coarse) {
    const N = S + 2 * pad;
    const out = new Uint16Array(N * N * N);
    const ox = cx * S - pad, oy = cy * S - pad, oz = cz * S - pad;
    const hm = new Float32Array(N * N);
    let hmin = 1e9, hmax = -1e9;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const h = height(ox + x, oz + z); hm[z * N + x] = h;
      if (h < hmin) hmin = h; if (h > hmax) hmax = h;
    }
    const BAND = 16; // 3D noise only near the surface
    if (oy > hmax + BAND) return { data: out, uniform: 0 };
    if (oy + N < hmin - BAND) { out.fill(3); return { data: out, uniform: 3 }; }
    const dens3 = (X, Y, Z) => n3(X / 48, Y / 32, Z / 48) * 10 + n3(X / 16, Y / 16, Z / 16) * 3;
    const cave = (X, Y, Z) => Math.abs(n3c(X / 40, Y / 24, Z / 40));
    let D = null, C = null, L = 4, M = 0;
    if (coarse) {
      M = Math.ceil(N / L) + 1;
      D = new Float32Array(M * M * M); C = new Float32Array(M * M * M);
      for (let k = 0; k < M; k++) for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const X = ox + i * L, Y = oy + j * L, Z = oz + k * L;
        D[(k * M + j) * M + i] = dens3(X, Y, Z); C[(k * M + j) * M + i] = cave(X, Y, Z);
      }
    }
    const tri = (A, x, y, z) => {
      const fx = x / L, fy = y / L, fz = z / L;
      const i = fx | 0, j = fy | 0, k = fz | 0, u = fx - i, v = fy - j, w = fz - k;
      const b = (k * M + j) * M + i, sy = M, sz = M * M;
      const c00 = A[b] + (A[b + 1] - A[b]) * u, c10 = A[b + sy] + (A[b + sy + 1] - A[b + sy]) * u;
      const c01 = A[b + sz] + (A[b + sz + 1] - A[b + sz]) * u, c11 = A[b + sz + sy] + (A[b + sz + sy + 1] - A[b + sz + sy]) * u;
      const c0 = c00 + (c10 - c00) * v, c1 = c01 + (c11 - c01) * v;
      return c0 + (c1 - c0) * w;
    };
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = ox + x, Y = oy + y, Z = oz + z, h = hm[z * N + x];
      let d = h - Y;
      if (d > BAND) d = BAND; else if (d < -BAND) d = -BAND;
      else d += coarse ? tri(D, x, y, z) : dens3(X, Y, Z);
      let solid = d > 0;
      if (solid && Y < h - 3 && Math.abs(d) < BAND + 20) {
        const cv = coarse ? tri(C, x, y, z) : cave(X, Y, Z);
        if (cv < 0.06) solid = false;
      }
      if (!solid) continue;
      const depth = h - Y;
      out[(z * N + y) * N + x] = depth < 1 ? (h < 22 ? 4 : 1) : depth < 4 ? 2 : 3; // grass/sand, dirt, stone
    }
    return { data: out, uniform: -1 };
  };
}

// Naive Surface Nets over a padded (S+2)^3 sample grid (pad=1).
// Chunk owns sample positions [0,S) (padded index 1..S). Cells are between samples.
// Emits a vertex per mixed cell (average of edge-crossing midpoints = binary data),
// quads for each sign-changing edge whose lower sample is owned by the chunk.
export function surfaceNets(data, S) {
  const N = S + 2; // pad = 1
  const C = N - 1; // cells per axis in padded grid
  const vidx = new Int32Array(C * C * C).fill(-1);
  let pos = new Float32Array(4096 * 3), nv = 0;
  let idx = new Uint32Array(8192 * 3), ni = 0;
  const solid = (x, y, z) => data[(z * N + y) * N + x] !== 0;
  // edge table for cube corners
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  for (let z = 0; z < C; z++) for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const k = corners[c];
      if (solid(x + k[0], y + k[1], z + k[2])) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) {
      const a = edges[e][0], b = edges[e][1];
      if (((mask >> a) & 1) !== ((mask >> b) & 1)) {
        const A = corners[a], B = corners[b];
        sx += (A[0] + B[0]) * 0.5; sy += (A[1] + B[1]) * 0.5; sz += (A[2] + B[2]) * 0.5; cnt++;
      }
    }
    if (nv * 3 + 3 > pos.length) { const p = new Float32Array(pos.length * 2); p.set(pos); pos = p; }
    pos[nv * 3] = x + sx / cnt; pos[nv * 3 + 1] = y + sy / cnt; pos[nv * 3 + 2] = z + sz / cnt;
    vidx[(z * C + y) * C + x] = nv++;
  }
  // quads: for owned samples p in [1..S] (padded coords), edge p -> p+axis
  const quad = (a, b, c, d, flip) => {
    if (ni + 6 > idx.length) { const q = new Uint32Array(idx.length * 2); q.set(idx); idx = q; }
    if (flip) { idx[ni++] = a; idx[ni++] = c; idx[ni++] = b; idx[ni++] = b; idx[ni++] = c; idx[ni++] = d; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = b; idx[ni++] = d; idx[ni++] = c; }
  };
  const V = (x, y, z) => vidx[(z * C + y) * C + x];
  let quads = 0;
  for (let z = 1; z <= S; z++) for (let y = 1; y <= S; y++) for (let x = 1; x <= S; x++) {
    const s0 = solid(x, y, z);
    if (x < N - 1 && s0 !== solid(x + 1, y, z)) {
      const a = V(x, y - 1, z - 1), b = V(x, y, z - 1), c = V(x, y - 1, z), d = V(x, y, z);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { quad(a, b, c, d, s0); quads++; }
    }
    if (y < N - 1 && s0 !== solid(x, y + 1, z)) {
      const a = V(x - 1, y, z - 1), b = V(x, y, z - 1), c = V(x - 1, y, z), d = V(x, y, z);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { quad(a, b, c, d, !s0); quads++; }
    }
    if (z < N - 1 && s0 !== solid(x, y, z + 1)) {
      const a = V(x - 1, y - 1, z), b = V(x, y - 1, z), c = V(x - 1, y, z), d = V(x, y, z);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) { quad(a, b, c, d, s0); quads++; }
    }
  }
  return { positions: pos.subarray(0, nv * 3), indices: idx.subarray(0, ni), nv, quads };
}

// Optimised variant: occupancy bytes, flat index offsets, per-mask vertex table.
const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
const edgesT = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
const VTAB = new Float32Array(256 * 3);
for (let m = 1; m < 255; m++) {
  let sx = 0, sy = 0, sz = 0, cnt = 0;
  for (const [a, b] of edgesT) if (((m >> a) & 1) !== ((m >> b) & 1)) {
    const A = corners[a], B = corners[b];
    sx += (A[0] + B[0]) / 2; sy += (A[1] + B[1]) / 2; sz += (A[2] + B[2]) / 2; cnt++;
  }
  VTAB[m * 3] = sx / cnt; VTAB[m * 3 + 1] = sy / cnt; VTAB[m * 3 + 2] = sz / cnt;
}
export function surfaceNetsFast(data, S, scratch) {
  const N = S + 2, C = N - 1, N2 = N * N;
  const occ = scratch.occ ??= new Uint8Array(N * N * N);
  for (let i = 0; i < occ.length; i++) occ[i] = data[i] !== 0 ? 1 : 0;
  const vidx = scratch.vidx ??= new Int32Array(C * C * C);
  let pos = scratch.pos ??= new Float32Array(16384 * 3);
  let idx = scratch.idx ??= new Uint32Array(32768 * 3);
  let nv = 0, ni = 0;
  const o1 = 1, o2 = N, o3 = N + 1, o4 = N2, o5 = N2 + 1, o6 = N2 + N, o7 = N2 + N + 1;
  let ci = 0;
  for (let z = 0; z < C; z++) for (let y = 0; y < C; y++) {
    let i = z * N2 + y * N;
    for (let x = 0; x < C; x++, i++, ci++) {
      const m = occ[i] | (occ[i + o1] << 1) | (occ[i + o2] << 2) | (occ[i + o3] << 3) |
        (occ[i + o4] << 4) | (occ[i + o5] << 5) | (occ[i + o6] << 6) | (occ[i + o7] << 7);
      if (m === 0 || m === 255) { vidx[ci] = -1; continue; }
      if (nv * 3 + 3 > pos.length) { const p = new Float32Array(pos.length * 2); p.set(pos); pos = scratch.pos = p; }
      const t = m * 3, b = nv * 3;
      pos[b] = x + VTAB[t]; pos[b + 1] = y + VTAB[t + 1]; pos[b + 2] = z + VTAB[t + 2];
      vidx[ci] = nv++;
    }
  }
  const C2 = C * C;
  let quads = 0;
  for (let z = 1; z <= S; z++) for (let y = 1; y <= S; y++) {
    let i = z * N2 + y * N + 1;
    let c = z * C2 + y * C + 1;
    for (let x = 1; x <= S; x++, i++, c++) {
      const s0 = occ[i];
      if (ni + 18 > idx.length) { const q = new Uint32Array(idx.length * 2); q.set(idx); idx = scratch.idx = q; }
      if (x < N - 1 && s0 !== occ[i + 1]) {
        const a = vidx[c - C - C2], b = vidx[c - C2], cc = vidx[c - C], d = vidx[c];
        if (s0) { idx[ni++] = a; idx[ni++] = cc; idx[ni++] = b; idx[ni++] = b; idx[ni++] = cc; idx[ni++] = d; }
        else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = cc; idx[ni++] = b; idx[ni++] = d; idx[ni++] = cc; }
        quads++;
      }
      if (y < N - 1 && s0 !== occ[i + N]) {
        const a = vidx[c - 1 - C2], b = vidx[c - C2], cc = vidx[c - 1], d = vidx[c];
        if (!s0) { idx[ni++] = a; idx[ni++] = cc; idx[ni++] = b; idx[ni++] = b; idx[ni++] = cc; idx[ni++] = d; }
        else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = cc; idx[ni++] = b; idx[ni++] = d; idx[ni++] = cc; }
        quads++;
      }
      if (z < N - 1 && s0 !== occ[i + N2]) {
        const a = vidx[c - 1 - C], b = vidx[c - C], cc = vidx[c - 1], d = vidx[c];
        if (s0) { idx[ni++] = a; idx[ni++] = cc; idx[ni++] = b; idx[ni++] = b; idx[ni++] = cc; idx[ni++] = d; }
        else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = cc; idx[ni++] = b; idx[ni++] = d; idx[ni++] = cc; }
        quads++;
      }
    }
  }
  // copy out (what would be transferred)
  return { positions: pos.slice(0, nv * 3), indices: idx.slice(0, ni), nv, quads };
}
