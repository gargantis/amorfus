// The one-step bubble model as a vertex-placement rule for surface-nets
// corners (research prototype; not the repo's mesher).
//
// Field (per material m, from blocks b of that material):
//   S_m(x) = sum_b K(x - c_b),   K = k(x) k(y) k(z)   (one MBO step from blocks)
//   L_m(x) = sum_b lambda_b K(x - c_b)                (local pressure, blended)
//   D(x)   = S_all(x) + max_m (S_m + L_m / S_m) - 1   (engine costs, g = 1, eps = 0)
// The vertex of a mixed corner is the D = 0 point reached by Newton steps
// along grad D from the corner, clamped to |s| <= 0.48 inside the corner's cell.
//
// Kernel 'b1' (box * tent, sigma = h / sqrt 6): with h < 1/2 a block's
// kernel is zero beyond 1/2 + h < 1 from its centre, so inside a corner's
// cell only the corner's own 8 blocks contribute and, per axis, the two
// weights are w(s) and 1 - w(s) with the quadratic smoothstep
//   w(s) = (s + h)^2 / (2 h^2)         -h <= s <= 0
//        = 1 - (h - s)^2 / (2 h^2)      0 <= s <= h     (0 below -h, 1 above h)
// i.e. trilinear interpolation of the 8 occupancies in warped coordinates.
// Only + - * / are used, in a fixed order (the mesher's determinism rule).
// Kernel 'b3' (box * cubic B-spline, support 1/2 + 2h_3 ~ 1.19 at sigma 0.2)
// reads the 4x4x4 blocks around the corner.
//
// lambda_b = a + b * ((27 - n27_b)/26)^p, n27_b = same-material blocks in the
// 3x3x3 around b (fit: fitlam.mjs); or a constant.
import { bspline } from './kern.mjs';

export function makeRule(opts = {}) {
  const sigma = opts.sigma ?? 0.2;
  const kernel = opts.kernel ?? 'b1';
  const iters = opts.iters ?? 4;
  const lam = opts.lambda ?? { const: 0 };
  const LT = new Float64Array(28);
  for (let n = 0; n <= 27; n++) {
    if ('const' in lam) LT[n] = lam.const;
    else { const t = (27 - n) / 26; let q = 1; for (let i = 0; i < lam.local.p; i++) q *= t; LT[n] = lam.local.a + lam.local.b * q; }
  }
  return { sigma, kernel, iters, LT, alpha: opts.alpha ?? 1, solver: opts.solver ?? 'newton', bisect: opts.bisect ?? 14, h1: sigma * Math.sqrt(6), k3: kernel === 'b3' ? bspline(sigma, 3) : null };
}

/** Vertex offsets for every mixed corner of the chunk inside a region.
 *  region: Uint16Array, index y*SY + z*SZ + x (SZ = nx, SY = nx*nz), like
 *  the mesher's MeshRegionInput.blocks. Corners x in [apron, apron+32].
 *  Returns { count, corner: Int32Array (x,y,z region coords), off: Float64Array (quantised 1/256) }. */
export function bubbleVertices(region, nx, ny, nz, apron, rule, span = 32) {
  const SX = 1, SZ = nx, SY = nx * nz;
  const total = nx * ny * nz;
  const mat = new Uint8Array(total);
  for (let i = 0; i < total; i++) mat[i] = region[i] & 0xff;
  const n27 = new Int8Array(total).fill(-1);
  const lamOf = (i) => {
    let c = n27[i];
    if (c < 0) {
      const m = mat[i];
      c = 0;
      for (let dy = -SY; dy <= SY; dy += SY) for (let dz = -SZ; dz <= SZ; dz += SZ) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dy + dz + dx;
        if (j >= 0 && j < total && mat[j] === m) c++;
      }
      n27[i] = c;
    }
    return rule.LT[c];
  };
  const maxCorners = (span + 1) ** 3;
  const corner = new Int32Array(maxCorners * 3);
  const off = new Float64Array(maxCorners * 3);
  let count = 0;
  const h = rule.h1, inv2h2 = 1 / (2 * h * h);
  const ms = new Uint8Array(8), ls = new Float64Array(8);
  const uniq = new Uint8Array(8);
  // per-axis weight of the + block and its derivative (b1)
  const wq = (s) => (s <= -h ? 0 : s >= h ? 1 : s <= 0 ? (s + h) * (s + h) * inv2h2 : 1 - (h - s) * (h - s) * inv2h2);
  const dwq = (s) => (s <= -h || s >= h ? 0 : s <= 0 ? (s + h) * 2 * inv2h2 : (h - s) * 2 * inv2h2);
  const W = new Float64Array(8), Wx = new Float64Array(8), Wy = new Float64Array(8), Wz = new Float64Array(8);
  const out = [0, 0, 0, 0]; // D, dDx, dDy, dDz
  const evalB1 = (sx, sy, sz, nu) => {
    const ax = wq(sx), ay = wq(sy), az = wq(sz), dax = dwq(sx), day = dwq(sy), daz = dwq(sz);
    for (let j = 0; j < 8; j++) {
      const ox = j & 1, oz = (j >> 1) & 1, oy = (j >> 2) & 1; // mesher bit order: ox | oz<<1 | oy<<2
      const fx = ox ? ax : 1 - ax, fy = oy ? ay : 1 - ay, fz = oz ? az : 1 - az;
      const gx = ox ? dax : -dax, gy = oy ? day : -day, gz = oz ? daz : -daz;
      W[j] = fx * fy * fz; Wx[j] = gx * fy * fz; Wy[j] = fx * gy * fz; Wz[j] = fx * fy * gz;
    }
    let Sa = 0, Sax = 0, Say = 0, Saz = 0;
    for (let j = 0; j < 8; j++) if (ms[j]) { Sa += W[j]; Sax += Wx[j]; Say += Wy[j]; Saz += Wz[j]; }
    let best = -Infinity, bx = 0, by = 0, bz = 0;
    for (let u = 0; u < nu; u++) {
      const m = uniq[u];
      let S = 0, Sx = 0, Sy = 0, Sz = 0, L = 0, Lx = 0, Ly = 0, Lz = 0;
      for (let j = 0; j < 8; j++) if (ms[j] === m) {
        S += W[j]; Sx += Wx[j]; Sy += Wy[j]; Sz += Wz[j];
        L += ls[j] * W[j]; Lx += ls[j] * Wx[j]; Ly += ls[j] * Wy[j]; Lz += ls[j] * Wz[j];
      }
      if (S < 1e-9) continue;
      const v = S + L / S;
      if (v > best) {
        best = v;
        const iS2 = 1 / (S * S);
        bx = Sx + (Lx * S - L * Sx) * iS2; by = Sy + (Ly * S - L * Sy) * iS2; bz = Sz + (Lz * S - L * Sz) * iS2;
      }
    }
    if (best === -Infinity) { best = 0; }
    out[0] = Sa + best - 1; out[1] = Sax + bx; out[2] = Say + by; out[3] = Saz + bz;
  };
  // b3 path: 4 blocks per axis (c-2..c+1), weights from the cubic-B-spline profile
  const K3 = rule.k3;
  const mats64 = new Uint8Array(64), lam64 = new Float64Array(64);
  const kx = new Float64Array(4), ky = new Float64Array(4), kz = new Float64Array(4), dkx = new Float64Array(4), dky = new Float64Array(4), dkz = new Float64Array(4);
  const Sm = new Float64Array(8 * 8), Lm = new Float64Array(8 * 8); // per unique material: S, Sx, Sy, Sz, L, Lx, Ly, Lz
  let nu64 = 0; const uniq64 = new Uint8Array(64), slot64 = new Int8Array(64);
  const evalB3 = (sx, sy, sz) => {
    for (let a = 0; a < 4; a++) { const t0 = a - 1.5; kx[a] = K3.k(sx - t0); dkx[a] = K3.dk(sx - t0); ky[a] = K3.k(sy - t0); dky[a] = K3.dk(sy - t0); kz[a] = K3.k(sz - t0); dkz[a] = K3.dk(sz - t0); }
    Sm.fill(0);
    let Sa = 0, Sax = 0, Say = 0, Saz = 0;
    for (let q = 0; q < 64; q++) {
      const s = slot64[q];
      if (s < 0) continue;
      const a = q & 3, b = (q >> 2) & 3, c = q >> 4; // x, z, y
      const w = kx[a] * ky[c] * kz[b];
      if (w === 0) continue;
      const wx = dkx[a] * ky[c] * kz[b], wy = kx[a] * dky[c] * kz[b], wz = kx[a] * ky[c] * dkz[b];
      Sa += w; Sax += wx; Say += wy; Saz += wz;
      const o = s * 8, l = lam64[q];
      Sm[o] += w; Sm[o + 1] += wx; Sm[o + 2] += wy; Sm[o + 3] += wz; Sm[o + 4] += l * w; Sm[o + 5] += l * wx; Sm[o + 6] += l * wy; Sm[o + 7] += l * wz;
    }
    let best = -Infinity, bx = 0, by = 0, bz = 0;
    for (let u = 0; u < nu64; u++) {
      const o = u * 8, S = Sm[o];
      if (S < 1e-9) continue;
      const L = Sm[o + 4], v = S + L / S;
      if (v > best) { best = v; const iS2 = 1 / (S * S); bx = Sm[o + 1] + (Sm[o + 5] * S - L * Sm[o + 1]) * iS2; by = Sm[o + 2] + (Sm[o + 6] * S - L * Sm[o + 2]) * iS2; bz = Sm[o + 3] + (Sm[o + 7] * S - L * Sm[o + 3]) * iS2; }
    }
    if (best === -Infinity) best = 0;
    out[0] = Sa + best - 1; out[1] = Sax + bx; out[2] = Say + by; out[3] = Saz + bz;
  };
  const lo = apron, hi = apron + span;
  for (let y = lo; y <= hi; y++) for (let z = lo; z <= hi; z++) for (let x = lo; x <= hi; x++) {
    const i000 = (y - 1) * SY + (z - 1) * SZ + (x - 1);
    let solidCount = 0;
    for (let j = 0; j < 8; j++) {
      const i = i000 + (j & 1) + ((j >> 1) & 1) * SZ + ((j >> 2) & 1) * SY;
      ms[j] = mat[i];
      if (ms[j]) solidCount++;
    }
    if (solidCount === 0 || solidCount === 8) continue;
    let sx = 0, sy = 0, sz = 0;
    if (rule.kernel === 'b1') {
      let nu = 0;
      for (let j = 0; j < 8; j++) {
        const m = ms[j];
        if (!m) { ls[j] = 0; continue; }
        const i = i000 + (j & 1) + ((j >> 1) & 1) * SZ + ((j >> 2) & 1) * SY;
        ls[j] = lamOf(i);
        let seen = false; for (let u = 0; u < nu; u++) if (uniq[u] === m) seen = true;
        if (!seen) uniq[nu++] = m;
      }
      if (rule.solver === 'line') {
        // safeguarded: fixed direction = grad D at the corner, sign-change
        // bisection on [0, tmax] (tmax: the clamp box |s| <= 0.48)
        evalB1(0, 0, 0, nu);
        const D0 = out[0];
        let gx = out[1], gy = out[2], gz = out[3];
        const gl2 = gx * gx + gy * gy + gz * gz;
        if (gl2 > 1e-12 && D0 !== 0) {
          const sg = D0 > 0 ? -1 : 1;
          gx *= sg; gy *= sg; gz *= sg;
          const m = Math.max(Math.abs(gx), Math.abs(gy), Math.abs(gz));
          const tmax = 0.48 / m;
          let a = 0, b = tmax;
          evalB1(gx * b, gy * b, gz * b, nu);
          if ((out[0] > 0) === (D0 > 0)) a = b; // no crossing inside the box: take the box edge
          else for (let it = 0; it < rule.bisect; it++) { const t = 0.5 * (a + b); evalB1(gx * t, gy * t, gz * t, nu); if ((out[0] > 0) === (D0 > 0)) a = t; else b = t; }
          const t = a === b ? a : 0.5 * (a + b);
          sx = gx * t; sy = gy * t; sz = gz * t;
        }
      }
      for (let it = 0; rule.solver !== 'line' && it < rule.iters; it++) {
        evalB1(sx, sy, sz, nu);
        const g2 = out[1] * out[1] + out[2] * out[2] + out[3] * out[3];
        if (g2 < 1e-12) break;
        const t = out[0] / g2;
        sx -= t * out[1]; sy -= t * out[2]; sz -= t * out[3];
        sx = sx < -0.48 ? -0.48 : sx > 0.48 ? 0.48 : sx;
        sy = sy < -0.48 ? -0.48 : sy > 0.48 ? 0.48 : sy;
        sz = sz < -0.48 ? -0.48 : sz > 0.48 ? 0.48 : sz;
      }
    } else {
      nu64 = 0;
      for (let q = 0; q < 64; q++) {
        const a = q & 3, b = (q >> 2) & 3, c = q >> 4;
        const i = (y - 2 + c) * SY + (z - 2 + b) * SZ + (x - 2 + a);
        const m = mat[i];
        mats64[q] = m;
        if (!m) { slot64[q] = -1; continue; }
        lam64[q] = lamOf(i);
        let s = -1; for (let u = 0; u < nu64; u++) if (uniq64[u] === m) s = u;
        if (s < 0) { uniq64[nu64] = m; s = nu64++; }
        slot64[q] = s;
      }
      for (let it = 0; it < rule.iters; it++) {
        evalB3(sx, sy, sz);
        const g2 = out[1] * out[1] + out[2] * out[2] + out[3] * out[3];
        if (g2 < 1e-12) break;
        const t = out[0] / g2;
        sx -= t * out[1]; sy -= t * out[2]; sz -= t * out[3];
        sx = sx < -0.48 ? -0.48 : sx > 0.48 ? 0.48 : sx;
        sy = sy < -0.48 ? -0.48 : sy > 0.48 ? 0.48 : sy;
        sz = sz < -0.48 ? -0.48 : sz > 0.48 ? 0.48 : sz;
      }
    }
    corner[count * 3] = x; corner[count * 3 + 1] = y; corner[count * 3 + 2] = z;
    if (rule.alpha !== 1) { sx *= rule.alpha; sy *= rule.alpha; sz *= rule.alpha; }
    off[count * 3] = Math.round(sx * 256) / 256; off[count * 3 + 1] = Math.round(sy * 256) / 256; off[count * 3 + 2] = Math.round(sz * 256) / 256;
    count++;
  }
  return { count, corner: corner.subarray(0, count * 3), off: off.subarray(0, count * 3) };
}
