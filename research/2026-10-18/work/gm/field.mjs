// gm — per-vertex generator material fields.
//
// Inputs (region fields, see input.mjs): gmS (Int16 per column, S·256),
// gmD (Int8 per block, D·16), gmEd (edited solid cells).
// Per vertex at position p (region coords), with the 8 block centres
// around p (trilinear) and the 4 column centres (bilinear):
//   s = S(p)                       sand ⇔ s ≥ 0 (the H = SEA+2 contour)
//   e = D(p − α·n)                 depth sampled α blocks INSIDE the surface
//                                  along the vertex normal (α = 0: rule 'a',
//                                  the literal continuous v1 rule)
// The fragment applies the v1 thresholds to the interpolated (s, e):
//   e ≤ t1 → top (sand if s ≥ 0, else grass); e ≤ t2 → dirt; else stone.
// Stored values are deterministic: integer planes, trilinear weights from
// the 1/256-quantised position and the decoded (quantised) normal, only
// + − × ÷ (√ for the normal decode), fixed order; then quantised.
import { SAND, GRASS, DIRT, STONE } from './gen-gm.mjs';

export const S_SCALE = 256, D_SCALE = 16;

/** Trilinear sample of a per-block Int8 plane at region point (x,y,z);
 *  block (i,j,k) has its centre at (i+½, j+½, k+½). */
export function triD(gmD, nx, ny, nz, x, y, z) {
  let qx = x - 0.5, qy = y - 0.5, qz = z - 0.5;
  let ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
  if (ix < 0) ix = 0; else if (ix > nx - 2) ix = nx - 2;
  if (iy < 0) iy = 0; else if (iy > ny - 2) iy = ny - 2;
  if (iz < 0) iz = 0; else if (iz > nz - 2) iz = nz - 2;
  const tx = qx - ix, ty = qy - iy, tz = qz - iz;
  const SY = nx * nz, SZ = nx;
  const b = (iy * nz + iz) * nx + ix;
  const c000 = gmD[b], c100 = gmD[b + 1], c010 = gmD[b + SY], c110 = gmD[b + SY + 1];
  const c001 = gmD[b + SZ], c101 = gmD[b + SZ + 1], c011 = gmD[b + SY + SZ], c111 = gmD[b + SY + SZ + 1];
  const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
  const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
  const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
  return (y0 + (y1 - y0) * tz) / D_SCALE;
}
/** Bilinear sample of the per-column plane at region (x, z). */
export function biS(gmS, nx, nz, x, z) {
  let qx = x - 0.5, qz = z - 0.5;
  let ix = Math.floor(qx), iz = Math.floor(qz);
  if (ix < 0) ix = 0; else if (ix > nx - 2) ix = nx - 2;
  if (iz < 0) iz = 0; else if (iz > nz - 2) iz = nz - 2;
  const tx = qx - ix, tz = qz - iz;
  const b = iz * nx + ix;
  const a0 = gmS[b] + (gmS[b + 1] - gmS[b]) * tx;
  const a1 = gmS[b + nx] + (gmS[b + nx + 1] - gmS[b + nx]) * tx;
  return (a0 + (a1 - a0) * tz) / S_SCALE;
}
/** Gradient magnitude of the bilinear S at (x, z) (H units per block). */
export function gradS(gmS, nx, nz, x, z) {
  let qx = x - 0.5, qz = z - 0.5;
  let ix = Math.floor(qx), iz = Math.floor(qz);
  if (ix < 0) ix = 0; else if (ix > nx - 2) ix = nx - 2;
  if (iz < 0) iz = 0; else if (iz > nz - 2) iz = nz - 2;
  const tx = qx - ix, tz = qz - iz;
  const b = iz * nx + ix;
  const s00 = gmS[b], s10 = gmS[b + 1], s01 = gmS[b + nx], s11 = gmS[b + nx + 1];
  const gx = ((s10 - s00) * (1 - tz) + (s11 - s01) * tz) / S_SCALE;
  const gz = ((s01 - s00) * (1 - tx) + (s11 - s10) * tx) / S_SCALE;
  return Math.sqrt(gx * gx + gz * gz);
}

/** Vertex encoding of the gen pair (s, e).
 *  s: horizontal signed distance to the sand contour, s/|∇S| clamped ±sMax
 *     blocks, `sBits` bits (or raw S in H units when sDist is false);
 *  e: depth in blocks over [eLo, eHi), `eBits` bits. bits 0 = float. */
export function makeEnc({ sBits = 8, eBits = 8, sMax = 2, eLo = -1, eHi = 7 } = {}) {
  const sq = sBits ? (1 << (sBits - 1)) - 1 : 0;
  const eq = eBits ? (1 << eBits) - 1 : 0;
  return {
    s: (v) => {
      const c = v < -sMax ? -sMax : v > sMax ? sMax : v;
      return sq ? (Math.round((c / sMax) * sq) / sq) * sMax : c;
    },
    e: (v) => {
      const c = v < eLo ? eLo : v > eHi ? eHi : v;
      return eq ? eLo + (Math.round(((c - eLo) / (eHi - eLo)) * eq) / eq) * (eHi - eLo) : c;
    },
  };
}

/** Adds attrs [mode=1, s, e] to every vertex of a plain mesh from the gen
 *  planes. o: { alpha, sDist, enc } */
export function genAttrsAll(m, region, o = {}) {
  const alpha = o.alpha ?? 0;
  const enc = o.enc ?? makeEnc(o);
  const sDist = o.sDist ?? true;
  const { nx, ny, nz, apron, gmS, gmD } = region;
  const dim = 3;
  const attrs = new Float64Array(m.V * dim);
  for (let v = 0; v < m.V; v++) {
    const x = m.pos[v * 3] + apron, y = m.pos[v * 3 + 1] + apron, z = m.pos[v * 3 + 2] + apron;
    let s = biS(gmS, nx, nz, x, z);
    if (sDist) { const g = gradS(gmS, nx, nz, x, z); s = s / (g > 0.02 ? g : 0.02); }
    const e = triD(gmD, nx, ny, nz, x - alpha * m.nrm[v * 3], y - alpha * m.nrm[v * 3 + 1], z - alpha * m.nrm[v * 3 + 2]);
    attrs[v * dim] = 1;
    attrs[v * dim + 1] = enc.s(s);
    attrs[v * dim + 2] = enc.e(e);
  }
  m.attrs = attrs;
  m.attrDim = dim;
  return m;
}

export function makeGenFragment({ t1 = 1, t2 = 4 } = {}) {
  return function fragmentGen(a, info) {
    if (a[0] < 0.5) return info.ownMat;
    const e = a[2];
    if (e <= t1) return a[1] >= 0 ? SAND : GRASS;
    if (e <= t2) return DIRT;
    return STONE;
  };
}

// ---------------------------------------------------------------- rule 'g'
/** Per-block |∇D| by central differences of a D plane (lazy, cached);
 *  trilinear at a point. Plane P with `scale` (16 for D8, 256 for D16). */
export function makeGradField(P, scale, nx, ny, nz, mode = 'grad', cap = 8) {
  const N = nx * ny * nz, SY = nx * nz, SZ = nx;
  const G = new Float64Array(N).fill(-1);
  const at = (i) => {
    let g = G[i];
    if (g >= 0) return g;
    const x = i % nx, z = Math.floor(i / nx) % nz, y = Math.floor(i / SY);
    const gx = x > 0 && x < nx - 1 ? (P[i + 1] - P[i - 1]) / (2 * scale) : 0;
    const gy = y > 0 && y < ny - 1 ? (P[i + SY] - P[i - SY]) / (2 * scale) : 0;
    const gz = z > 0 && z < nz - 1 ? (P[i + SZ] - P[i - SZ]) / (2 * scale) : 0;
    g = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (mode === 'slope') { // 1/cosθ of the generator surface through this block
      const ay = gy < 0 ? -gy : gy;
      g = ay * cap > g ? g / ay : cap;
    }
    G[i] = g;
    return g;
  };
  return function gradAt(x, y, z) {
    const qx = x - 0.5, qy = y - 0.5, qz = z - 0.5;
    const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
    const tx = qx - ix, ty = qy - iy, tz = qz - iz, b = (iy * nz + iz) * nx + ix;
    const c000 = at(b), c100 = at(b + 1), c010 = at(b + SY), c110 = at(b + SY + 1);
    const c001 = at(b + SZ), c101 = at(b + SZ + 1), c011 = at(b + SY + SZ), c111 = at(b + SY + SZ + 1);
    const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  };
}
export function triP(P, scale, nx, ny, nz, x, y, z) {
  const qx = x - 0.5, qy = y - 0.5, qz = z - 0.5;
  const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
  const tx = qx - ix, ty = qy - iy, tz = qz - iz, SY = nx * nz, SZ = nx, b = (iy * nz + iz) * nx + ix;
  const c000 = P[b], c100 = P[b + 1], c010 = P[b + SY], c110 = P[b + SY + 1];
  const c001 = P[b + SZ], c101 = P[b + SZ + 1], c011 = P[b + SY + SZ], c111 = P[b + SY + SZ + 1];
  const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
  const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
  return (y0 + (y1 - y0) * tz) / scale;
}
/** Exposure field: E = α·|∇D| + max(0, D − δ). α = 0 → the literal rule
 *  with the near-surface band clipped (natural surface → E = 0 → top). */
export function genAttrsG(m, region, o = {}) {
  const alpha = o.alpha ?? 0.5, delta = o.delta ?? 0.3, fine = o.fine ?? true;
  const enc = o.enc ?? makeEnc(o);
  const { nx, ny, nz, apron, gmS } = region;
  const P = fine ? region.gmD16 : region.gmD, scale = fine ? 256 : 16;
  const gradAt = alpha ? makeGradField(P, scale, nx, ny, nz, o.mode ?? 'grad') : null;
  const attrs = new Float64Array(m.V * 3);
  for (let v = 0; v < m.V; v++) {
    const x = m.pos[v * 3] + apron, y = m.pos[v * 3 + 1] + apron, z = m.pos[v * 3 + 2] + apron;
    let s = biS(gmS, nx, nz, x, z);
    if (o.sDist ?? false) { const g = gradS(gmS, nx, nz, x, z); s = s / (g > 0.02 ? g : 0.02); }
    const D = triP(P, scale, nx, ny, nz, x, y, z);
    const e = (alpha ? alpha * gradAt(x, y, z) : 0) + (D > delta ? D - delta : 0);
    attrs[v * 3] = 1;
    attrs[v * 3 + 1] = enc.s(s);
    attrs[v * 3 + 2] = enc.e(e);
  }
  m.attrs = attrs;
  m.attrDim = 3;
  return m;
}
/** Fragment-side value noise (world space, exempt from determinism). */
export function valueNoise3(x, y, z, seed = 0) {
  const hash = (ix, iy, iz) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 1103515245) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    r += (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz) * hash(ix + dx, iy + dy, iz + dz);
  }
  return r;
}
export function makeGenFragmentNoise({ t1 = 1, t2 = 4, beta = 0.25, freq = 0.25 } = {}) {
  return function fragmentGenNoise(a, info) {
    if (a[0] < 0.5) return info.ownMat;
    const n = valueNoise3(info.x * freq, info.y * freq, info.z * freq, 11) + 0.5 * valueNoise3(info.x * freq * 2.1, info.y * freq * 2.1, info.z * freq * 2.1, 12);
    const e = a[2] + beta * ((n / 1.5) * 2 - 1);
    if (e <= t1) return a[1] >= 0 ? SAND : GRASS;
    if (e <= t2) return DIRT;
    return STONE;
  };
}
