// Synthetic density hints for shape-edited terrain (study code, team gh).
//
// Every function here reads only the mesher region (blocks, rho,
// shapeEdited) and returns a new rho array. Arithmetic is + − × ÷ √ and
// comparisons in a fixed loop order, so a block's value is identical in
// any region that contains its whole dependency cube.
import { CHUNK } from '../../harness/core.mjs';

export const HINT_SCALE = 4; // generator v1: rho = clamp(d / 4, -1, 1)

const AIRV = 0;
const matOf = (v) => v & 0xff;

/** Odd-length symmetric integer kernels. */
export function boxK(r) { return new Array(2 * r + 1).fill(1); }
export function convK(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}
/** Box of even width w (centred after an even number of convolutions)
 *  is not centred on its own; boxPow builds width-w boxes convolved p
 *  times and trims to odd length when possible. */
export function boxPow(w, p) {
  let k = [1];
  for (let i = 0; i < p; i++) k = convK(k, new Array(w).fill(1));
  if (k.length % 2 === 0) throw new Error(`kernel box${w}^${p} is not centred`);
  return k;
}
export function kernelByName(name) {
  // 'box3' (r1), 'box5' (r2), 'box7', 'box9'; 'b3x2' = box3*box3 (r2),
  // 'b4x2' (r3), 'b5x2' (r4), 'b3x3' (r3), 'b4x3' not centred, 'b5x3' (r6),
  // 'binom4' = [1,4,6,4,1]; 'sharpb3x2' = 2K − K*K (zero 2nd moment)
  const m = /^box(\d+)$/.exec(name);
  if (m) return new Array(Number(m[1])).fill(1);
  const m2 = /^b(\d+)x(\d+)$/.exec(name);
  if (m2) return boxPow(Number(m2[1]), Number(m2[2]));
  if (name === 'binom4') return [1, 4, 6, 4, 1];
  if (name === 'binom6') return [1, 6, 15, 20, 15, 6, 1];
  const m3 = /^sharp(.+)$/.exec(name);
  if (m3) {
    const K = kernelByName(m3[1]);
    const s = K.reduce((a, b) => a + b, 0);
    const KK = convK(K, K);
    const pad = (KK.length - K.length) / 2;
    return KK.map((v, i) => 2 * s * (K[i - pad] ?? 0) - v); // scaled by s²
  }
  throw new Error(`unknown kernel ${name}`);
}

/** Separable convolution along one stride with a normalised kernel;
 *  indices outside the region clamp to the edge. Fixed summation order. */
function conv1(src, dst, region, axis, K) {
  const { nx, ny, nz } = region;
  const R = (K.length - 1) >> 1;
  let s = 0;
  for (const k of K) s += k;
  const W = K.map((k) => k / s);
  const n = axis === 0 ? nx : axis === 1 ? ny : nz;
  const st = axis === 0 ? 1 : axis === 1 ? nx * nz : nx;
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const i = (y * nz + z) * nx + x;
        const c = axis === 0 ? x : axis === 1 ? y : z;
        let acc = 0;
        for (let k = -R; k <= R; k++) {
          let cc = c + k;
          if (cc < 0) cc = 0;
          else if (cc >= n) cc = n - 1;
          acc += W[k + R] * src[i + (cc - c) * st];
        }
        dst[i] = acc;
      }
    }
  }
}
export function blur3(field, region, K) {
  const a = new Float64Array(field.length);
  const b = new Float64Array(field.length);
  conv1(field, a, region, 0, K);
  conv1(a, b, region, 2, K);
  conv1(b, a, region, 1, K);
  return a;
}

/** Exact squared EDT to the nearest `feature` block centre, searched
 *  within a cube of half-width C (exact for distances ≤ C). */
export function sqEdt(feature, region, C) {
  const { nx, ny, nz } = region;
  const BIG = 1e9;
  const total = nx * ny * nz;
  let g = new Float64Array(total).fill(BIG);
  for (let i = 0; i < total; i++) if (feature[i]) g[i] = 0;
  for (const axis of [0, 2, 1]) {
    const out = new Float64Array(total).fill(BIG);
    const n = axis === 0 ? nx : axis === 1 ? ny : nz;
    const st = axis === 0 ? 1 : axis === 1 ? nx * nz : nx;
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        for (let x = 0; x < nx; x++) {
          const i = (y * nz + z) * nx + x;
          const c = axis === 0 ? x : axis === 1 ? y : z;
          let best = BIG;
          for (let k = -C; k <= C; k++) {
            const cc = c + k;
            if (cc < 0 || cc >= n) continue;
            const v = g[i + k * st] + k * k;
            if (v < best) best = v;
          }
          out[i] = best;
        }
      }
    }
    g = out;
  }
  return g;
}

/** Chebyshev dilation of a mask by r (separable max). */
export function dilate(mask, region, r) {
  const { nx, ny, nz } = region;
  let a = Uint8Array.from(mask);
  for (const axis of [0, 2, 1]) {
    const out = new Uint8Array(a.length);
    const n = axis === 0 ? nx : axis === 1 ? ny : nz;
    const st = axis === 0 ? 1 : axis === 1 ? nx * nz : nx;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = (y * nz + z) * nx + x;
      const c = axis === 0 ? x : axis === 1 ? y : z;
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const cc = c + k;
        if (cc >= 0 && cc < n && a[i + k * st]) v = 1;
      }
      out[i] = v;
    }
    a = out;
  }
  return a;
}

/** Signed distance estimate (blocks, + in solid) from occupancy:
 *  ±(distance to the nearest opposite block centre − ½), clamped. */
export function binarySdt(solid, region, clampD) {
  const C = Math.ceil(clampD + 0.5);
  const air = new Uint8Array(solid.length);
  for (let i = 0; i < solid.length; i++) air[i] = solid[i] ? 0 : 1;
  const toAir = sqEdt(air, region, C);
  const toSolid = sqEdt(solid, region, C);
  const out = new Float64Array(solid.length);
  for (let i = 0; i < solid.length; i++) {
    const d = solid[i] ? Math.sqrt(toAir[i]) - 0.5 : -(Math.sqrt(toSolid[i]) - 0.5);
    out[i] = d > clampD ? clampD : d < -clampD ? -clampD : d;
  }
  return out;
}

/** Main entry: returns { rho, zone, edited } with synthetic values inside
 *  the zone (blocks within cfg.zone of a shape-edited block). */
export function synthRho(region, cfg) {
  const { blocks, rho, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return { rho, zone: null };
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== AIRV ? 1 : 0;
  const zone = dilate(shapeEdited, region, cfg.zone ?? 2);
  const K = kernelByName(cfg.kernel ?? 'b3x2');
  let f; // distance units (blocks), + solid
  if (cfg.method === 'blurChi') {
    const chi = new Float64Array(total);
    for (let i = 0; i < total; i++) chi[i] = solid[i] ? 1 : -1;
    const b = blur3(chi, region, K);
    let s = 0;
    for (const k of K) s += k;
    const R = (K.length - 1) >> 1;
    let k0 = K[R] / s, kz = 0; // flat-ground value at the surface block, 3-D: centre row weight
    // a flat plane blurred in 3D: only the axis normal to it matters
    kz = k0;
    f = new Float64Array(total);
    for (let i = 0; i < total; i++) f[i] = (b[i] * 0.5) / kz;
  } else if (cfg.method === 'blurSdt') {
    const sdt = binarySdt(solid, region, cfg.clamp ?? 4);
    // generated (non-edited) blocks outside the zone may contribute their
    // hint distance instead of the binary one
    if (cfg.hintBase) {
      for (let i = 0; i < total; i++) {
        if (shapeEdited[i] || zone[i] && cfg.hintBase === 'outside') continue;
        if (!shapeEdited[i]) {
          const h = rho[i] * HINT_SCALE;
          // stale hints near edits: never farther than the binary distance
          sdt[i] = solid[i] ? Math.min(h, sdt[i]) : Math.max(h, sdt[i]);
        }
      }
    }
    f = blur3(sdt, region, K);
  } else {
    throw new Error(`unknown method ${cfg.method}`);
  }
  const m = cfg.margin ?? 0.05;
  const out = Float32Array.from(rho);
  for (let i = 0; i < total; i++) {
    if (!zone[i]) continue;
    let r = f[i] / HINT_SCALE;
    if (r > 1) r = 1;
    else if (r < -1) r = -1;
    if (solid[i]) { if (r < m / HINT_SCALE) r = m / HINT_SCALE; } else if (r > -m / HINT_SCALE) r = -m / HINT_SCALE;
    out[i] = r;
  }
  return { rho: out, zone, f, solid };
}

// ---------------------------------------------------------------------------
// Per-edge contour interpolation ("synthetic crossings").
//
// For a sign-changing edge between solid s and air b along axis a, with
// face orientation n = (b − s): look in the plane ⊥ a through s for the
// nearest air block that sits on an n-facing face (an "A-site": air c with
// c − n solid), and in the plane through b for the nearest solid block under
// an n-facing face ("S-site": solid c with c + n air). Those are the
// neighbouring contour lines of the surface seen as a height field along n.
// The crossing interpolates linearly between them, which puts every
// crossing of a 1:k or k:1 staircase on the plane through its riser
// midpoints. A missing contour (none within R) is a plateau edge: the
// surface returns to the face plane within w0.
const ORIENTS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];

export function siteMasks(solid, region) {
  const { nx, ny, nz } = region;
  const st = [1, nx * nz, nx];
  const total = solid.length;
  const A = [], S = [];
  for (const [a, sg] of ORIENTS) {
    const Am = new Uint8Array(total), Sm = new Uint8Array(total);
    const d = sg * st[a];
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = (y * nz + z) * nx + x;
      const c = a === 0 ? x : a === 1 ? y : z;
      const n = a === 0 ? nx : a === 1 ? ny : nz;
      const back = c - sg, fwd = c + sg;
      if (!solid[i] && back >= 0 && back < n && solid[i - d]) Am[i] = 1;
      if (solid[i] && fwd >= 0 && fwd < n && !solid[i + d]) Sm[i] = 1;
    }
    A.push(Am);
    S.push(Sm);
  }
  return { A, S };
}

/** Nearest masked block in the plane ⊥ axis through (x,y,z), Euclidean
 *  centre distance, searched in Chebyshev rings up to R. Infinity if none. */
export function planeNearest(mask, region, axis, x, y, z, R) {
  const { nx, ny, nz } = region;
  // plane coordinates (u, v)
  let best = Infinity;
  for (let r = 1; r <= R; r++) {
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
        let X = x, Y = y, Z = z;
        if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        if (!mask[(Y * nz + Z) * nx + X]) continue;
        const d2 = du * du + dv * dv;
        if (d2 < best) best = d2;
      }
    }
    if (best <= (r + 1) * (r + 1)) break;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

export function contourCross(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== AIRV ? 1 : 0;
  const { A, S } = siteMasks(solid, region);
  const st = [1, nx * nz, nx];
  const crossT = new Float32Array(total * 3).fill(-1);
  let n = 0;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? x : a === 1 ? y : z;
      const nA = a === 0 ? nx : a === 1 ? ny : nz;
      if (c + 1 >= nA) continue;
      const q = p + st[a];
      if (solid[p] === solid[q]) continue;
      if (!shapeEdited[p] && !shapeEdited[q]) continue;
      const sIsP = solid[p] === 1;
      const o = a * 2 + (sIsP ? 0 : 1); // orientation index: from s toward b
      const sIdx = sIsP ? p : q, bIdx = sIsP ? q : p;
      const sc = sIsP ? [x, y, z] : [x + (a === 0), y + (a === 1), z + (a === 2)];
      const bc = sIsP ? [x + (a === 0), y + (a === 1), z + (a === 2)] : [x, y, z];
      const ds = planeNearest(A[o], region, a, sc[0], sc[1], sc[2], R);
      const db = planeNearest(S[o], region, a, bc[0], bc[1], bc[2], R);
      const ea = ds - 0.5, eb = db - 0.5;
      let t;
      if (ds !== Infinity && db !== Infinity) t = ea / (ea + eb);
      else if (ds !== Infinity) t = Math.min(0.5, ea / (2 * w0));
      else if (db !== Infinity) t = Math.max(0.5, 1 - eb / (2 * w0));
      else t = 0.5;
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      n++;
      void sIdx; void bIdx;
    }
  }
  return { crossT, edges: n };
}

/** Like planeNearest, but also returns the unit direction (in plane
 *  coordinates u,v) toward the nearest site(s): the normalised sum of the
 *  offsets of every site at the minimal distance (ties averaged). */
export function planeNearestDir(mask, region, axis, x, y, z, R, out) {
  const { nx, ny, nz } = region;
  let best = Infinity, su = 0, sv = 0;
  for (let r = 1; r <= R; r++) {
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
        let X = x, Y = y, Z = z;
        if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        if (!mask[(Y * nz + Z) * nx + X]) continue;
        const d2 = du * du + dv * dv;
        if (d2 < best) { best = d2; su = du; sv = dv; } else if (d2 === best) { su += du; sv += dv; }
      }
    }
    if (best <= (r + 1) * (r + 1)) break;
  }
  if (best === Infinity) { out[0] = Infinity; out[1] = 0; out[2] = 0; return out; }
  const d = Math.sqrt(best);
  const l = Math.sqrt(su * su + sv * sv);
  out[0] = d; out[1] = l > 0 ? su / l : 0; out[2] = l > 0 ? sv / l : 0;
  return out;
}

/** Contour crossings with per-crossing normals (see contourCross). */
export function contourCrossN(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const plateauInformative = cfg.plateauInformative ?? true;
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== AIRV ? 1 : 0;
  const { A, S } = siteMasks(solid, region);
  const st = [1, nx * nz, nx];
  const crossT = new Float32Array(total * 3).fill(-1);
  const crossN = new Float32Array(total * 9);
  const kind = new Uint8Array(total * 3);
  const ra = [0, 0, 0], rb = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? x : a === 1 ? y : z;
      const nA = a === 0 ? nx : a === 1 ? ny : nz;
      if (c + 1 >= nA) continue;
      const q = p + st[a];
      if (solid[p] === solid[q]) continue;
      if (!shapeEdited[p] && !shapeEdited[q]) continue;
      const sIsP = solid[p] === 1;
      const o = a * 2 + (sIsP ? 0 : 1);
      const sc = sIsP ? [x, y, z] : [x + (a === 0), y + (a === 1), z + (a === 2)];
      const bc = sIsP ? [x + (a === 0), y + (a === 1), z + (a === 2)] : [x, y, z];
      planeNearestDir(A[o], region, a, sc[0], sc[1], sc[2], R, ra);
      planeNearestDir(S[o], region, a, bc[0], bc[1], bc[2], R, rb);
      const fa = ra[0] !== Infinity, fb = rb[0] !== Infinity;
      const ea = ra[0] - 0.5, eb = rb[0] - 0.5;
      let t, gu = 0, gv = 0, info = true;
      if (fa && fb) {
        t = ea / (ea + eb);
        const D = (ea + eb) * (ea + eb);
        // ∇e_a = −dirA, ∇e_b = −dirB
        gu = (eb * -ra[1] - ea * -rb[1]) / D;
        gv = (eb * -ra[2] - ea * -rb[2]) / D;
      } else if (fa) {
        t = Math.min(0.5, ea / (2 * w0));
        if (ea < w0) { gu = -ra[1] / (2 * w0); gv = -ra[2] / (2 * w0); } else info = plateauInformative;
      } else if (fb) {
        t = Math.max(0.5, 1 - eb / (2 * w0));
        if (eb < w0) { gu = rb[1] / (2 * w0); gv = rb[2] / (2 * w0); } else info = plateauInformative;
      } else { t = 0.5; info = false; }
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      kind[p * 3 + a] = fa && fb ? 2 : fa || fb ? 1 : 0;
      if (info) {
        // N ∝ n̂ − ∇t (in-plane); n̂ = ±e_a (from solid to air)
        const sg = sIsP ? 1 : -1;
        let N0 = 0, N1 = 0, N2 = 0;
        if (a === 0) { N0 = sg; N1 = -gu; N2 = -gv; } else if (a === 1) { N1 = sg; N0 = -gu; N2 = -gv; } else { N2 = sg; N0 = -gu; N1 = -gv; }
        const l = Math.sqrt(N0 * N0 + N1 * N1 + N2 * N2);
        crossN[p * 9 + a * 3] = N0 / l;
        crossN[p * 9 + a * 3 + 1] = N1 / l;
        crossN[p * 9 + a * 3 + 2] = N2 / l;
      }
      n++;
    }
  }
  const res = { crossT, crossN, kind, edges: n };
  if (cfg.override) res.crossN = overrideNormals(region, res, kind, cfg);
  return res;
}

/** Second pass: replace each synthetic crossing's normal by the weighted
 *  mean of the normals of nearby staircase-type crossings (both contours
 *  found), weight |N_own-axis|^p, so a riser on a gentle slope takes the
 *  tread's normal and a tread on a steep slope the riser's. Crossings with
 *  no staircase neighbour keep their own (plateau) normal. */
export function overrideNormals(region, res, kind, cfg = {}) {
  const { nx, ny, nz } = region;
  const pw = cfg.pow ?? 8;
  const { crossT, crossN } = res;
  const out = Float32Array.from(crossN);
  for (let y = 1; y < ny - 1; y++) for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      if (crossT[p * 3 + a] < 0) continue;
      let s0 = 0, s1 = 0, s2 = 0, ws = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const q = p + (dy * nz + dz) * nx + dx;
        for (let b = 0; b < 3; b++) {
          if (crossT[q * 3 + b] < 0 || kind[q * 3 + b] !== 2) continue;
          const N0 = crossN[q * 9 + b * 3], N1 = crossN[q * 9 + b * 3 + 1], N2 = crossN[q * 9 + b * 3 + 2];
          const own = Math.abs(b === 0 ? N0 : b === 1 ? N1 : N2);
          let w = 1;
          for (let k = 0; k < pw; k++) w *= own;
          s0 += w * N0; s1 += w * N1; s2 += w * N2; ws += w;
        }
      }
      if (ws > 0) {
        const l = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2);
        if (l > 1e-9) {
          out[p * 9 + a * 3] = s0 / l; out[p * 9 + a * 3 + 1] = s1 / l; out[p * 9 + a * 3 + 2] = s2 / l;
        }
      }
    }
  }
  return out;
}

/** Nearest masked block in the plane ⊥ axis through (x,y,z) restricted to
 *  the half-plane where offset·(hu,hv) < 0 (hu=hv=0: no restriction). */
export function planeNearestHalf(mask, region, axis, x, y, z, R, hu, hv) {
  const { nx, ny, nz } = region;
  let best = Infinity;
  for (let r = 1; r <= R; r++) {
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
        if ((hu !== 0 || hv !== 0) && du * hu + dv * hv >= 0) continue;
        let X = x, Y = y, Z = z;
        if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        if (!mask[(Y * nz + Z) * nx + X]) continue;
        const d2 = du * du + dv * dv;
        if (d2 < best) best = d2;
      }
    }
    if (best <= (r + 1) * (r + 1)) break;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

/** Contour crossings with a curvature-aware plateau rule (dome/bowl). */
export function contourCross2(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const dome = cfg.dome ?? true;
  const axes = cfg.axes ?? [0, 1, 2];
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== AIRV ? 1 : 0;
  const { A, S } = siteMasks(solid, region);
  const st = [1, nx * nz, nx];
  const crossT = new Float32Array(total * 3).fill(-1);
  const kind = new Uint8Array(total * 3);
  const ra = [0, 0, 0], rb = [0, 0, 0];
  const inR = (X, Y, Z) => X >= 0 && Y >= 0 && Z >= 0 && X < nx && Y < ny && Z < nz;
  let n = 0, nd = 0;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? x : a === 1 ? y : z;
      const nA = a === 0 ? nx : a === 1 ? ny : nz;
      if (c + 1 >= nA) continue;
      const q = p + st[a];
      if (solid[p] === solid[q]) continue;
      if (!shapeEdited[p] && !shapeEdited[q]) continue;
      if (!axes.includes(a)) { if (cfg.binaryOther) { crossT[p * 3 + a] = 0.5; n++; } continue; }
      const sIsP = solid[p] === 1;
      const sg = sIsP ? 1 : -1;
      const o = a * 2 + (sIsP ? 0 : 1);
      const sc = sIsP ? [x, y, z] : [x + (a === 0), y + (a === 1), z + (a === 2)];
      const bc = sIsP ? [x + (a === 0), y + (a === 1), z + (a === 2)] : [x, y, z];
      planeNearestDir(A[o], region, a, sc[0], sc[1], sc[2], R, ra);
      planeNearestDir(S[o], region, a, bc[0], bc[1], bc[2], R, rb);
      const fa = ra[0] !== Infinity, fb = rb[0] !== Infinity;
      const ea = ra[0] - 0.5, eb = rb[0] - 0.5;
      let t;
      if (fa && fb) t = ea / (ea + eb);
      else if (fa) {
        t = Math.min(0.5, ea / (2 * w0));
        if (dome) {
          // far edge of the plateau (opposite half-plane) and the next
          // contour one level behind (plane through s − n)
          const eo = planeNearestHalf(A[o], region, a, sc[0], sc[1], sc[2], R, ra[1], ra[2]) - 0.5;
          const s2 = [sc[0] - (a === 0) * sg, sc[1] - (a === 1) * sg, sc[2] - (a === 2) * sg];
          const e2 = inR(s2[0], s2[1], s2[2]) ? planeNearestDir(A[o], region, a, s2[0], s2[1], s2[2], R, rb)[0] - 0.5 : Infinity;
          const sig = e2 - ea;
          if (eo !== Infinity && e2 !== Infinity && sig > 0) {
            const rho = (ea + eo) / 2, u = Math.abs(eo - ea) / 2;
            const td = (rho * rho - u * u) / (2 * rho * sig);
            if (td > t) { t = td; nd++; }
          }
        }
      } else if (fb) {
        t = Math.max(0.5, 1 - eb / (2 * w0));
        if (dome) {
          const eo = planeNearestHalf(S[o], region, a, bc[0], bc[1], bc[2], R, rb[1], rb[2]) - 0.5;
          const b2 = [bc[0] + (a === 0) * sg, bc[1] + (a === 1) * sg, bc[2] + (a === 2) * sg];
          const e2 = inR(b2[0], b2[1], b2[2]) ? planeNearestDir(S[o], region, a, b2[0], b2[1], b2[2], R, ra)[0] - 0.5 : Infinity;
          const sig = e2 - eb;
          if (eo !== Infinity && e2 !== Infinity && sig > 0) {
            const rho = (eb + eo) / 2, u = Math.abs(eo - eb) / 2;
            const td = 1 - (rho * rho - u * u) / (2 * rho * sig);
            if (td < t) { t = td; nd++; }
          }
        }
      } else t = 0.5;
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      kind[p * 3 + a] = fa && fb ? 2 : fa || fb ? 1 : 0;
      n++;
    }
  }
  return { crossT, kind, edges: n, domed: nd };
}

// ---------------------------------------------------------------------------
// Accelerated contour crossings (same results as contourCross2 with
// dome:false): per-plane 2-D summed-area tables of each site mask make the
// "no site within R" case O(1) and let the ring scan start at the first
// non-empty Chebyshev radius.
function planeSat(mask, region, axis) {
  const { nx, ny, nz } = region;
  // plane coordinates: axis 0 → (u=y, v=z); 1 → (u=x, v=z); 2 → (u=x, v=y)
  const na = axis === 0 ? nx : axis === 1 ? ny : nz;
  const nu = axis === 0 ? ny : nx;
  const nv = axis === 2 ? ny : nz;
  const W = nu + 1, H = nv + 1;
  const sat = new Int32Array(na * W * H);
  for (let c = 0; c < na; c++) {
    const o = c * W * H;
    for (let v = 1; v <= nv; v++) {
      let row = 0;
      for (let u = 1; u <= nu; u++) {
        let X, Y, Z;
        if (axis === 0) { X = c; Y = u - 1; Z = v - 1; } else if (axis === 1) { X = u - 1; Y = c; Z = v - 1; } else { X = u - 1; Y = v - 1; Z = c; }
        row += mask[(Y * nz + Z) * nx + X];
        sat[o + v * W + u] = sat[o + (v - 1) * W + u] + row;
      }
    }
  }
  return { sat, W, H, nu, nv };
}
function satCount(P, c, u0, v0, u1, v1) {
  // inclusive block range [u0,u1]×[v0,v1], clamped
  if (u0 < 0) u0 = 0; if (v0 < 0) v0 = 0;
  if (u1 > P.nu - 1) u1 = P.nu - 1; if (v1 > P.nv - 1) v1 = P.nv - 1;
  if (u1 < u0 || v1 < v0) return 0;
  const o = c * P.W * P.H, W = P.W, s = P.sat;
  return s[o + (v1 + 1) * W + (u1 + 1)] - s[o + v0 * W + (u1 + 1)] - s[o + (v1 + 1) * W + u0] + s[o + v0 * W + u0];
}
function nearestFast(mask, P, region, axis, x, y, z, R, out) {
  const c = axis === 0 ? x : axis === 1 ? y : z;
  const u = axis === 0 ? y : x;
  const v = axis === 2 ? y : z;
  if (satCount(P, c, u - R, v - R, u + R, v + R) === 0) { out[0] = Infinity; out[1] = 0; out[2] = 0; return out; }
  let r0 = 1;
  while (r0 < R && satCount(P, c, u - r0, v - r0, u + r0, v + r0) === 0) r0++;
  // r0 = first Chebyshev radius holding a site; scan rings r0.. as before
  const { nx, ny, nz } = region;
  let best = Infinity, su = 0, sv = 0;
  for (let r = r0; r <= R; r++) {
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
        let X = x, Y = y, Z = z;
        if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        if (!mask[(Y * nz + Z) * nx + X]) continue;
        const d2 = du * du + dv * dv;
        if (d2 < best) { best = d2; su = du; sv = dv; } else if (d2 === best) { su += du; sv += dv; }
      }
    }
    if (best <= (r + 1) * (r + 1)) break;
  }
  const d = Math.sqrt(best);
  const l = Math.sqrt(su * su + sv * sv);
  out[0] = d; out[1] = l > 0 ? su / l : 0; out[2] = l > 0 ? sv / l : 0;
  return out;
}

export function contourCross3(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== AIRV ? 1 : 0;
  const { A, S } = siteMasks(solid, region);
  const PA = [], PS = [];
  for (let o = 0; o < 6; o++) { PA.push(planeSat(A[o], region, o >> 1)); PS.push(planeSat(S[o], region, o >> 1)); }
  const st = [1, nx * nz, nx];
  const crossT = new Float32Array(total * 3).fill(-1);
  const ra = [0, 0, 0], rb = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? x : a === 1 ? y : z;
      const nA = a === 0 ? nx : a === 1 ? ny : nz;
      if (c + 1 >= nA) continue;
      const q = p + st[a];
      if (solid[p] === solid[q]) continue;
      if (!shapeEdited[p] && !shapeEdited[q]) continue;
      const sIsP = solid[p] === 1;
      const o = a * 2 + (sIsP ? 0 : 1);
      const sx = sIsP ? x : x + (a === 0), sy = sIsP ? y : y + (a === 1), sz = sIsP ? z : z + (a === 2);
      const bx = sIsP ? x + (a === 0) : x, by = sIsP ? y + (a === 1) : y, bz = sIsP ? z + (a === 2) : z;
      nearestFast(A[o], PA[o], region, a, sx, sy, sz, R, ra);
      nearestFast(S[o], PS[o], region, a, bx, by, bz, R, rb);
      const fa = ra[0] !== Infinity, fb = rb[0] !== Infinity;
      const ea = ra[0] - 0.5, eb = rb[0] - 0.5;
      let t;
      if (fa && fb) t = ea / (ea + eb);
      else if (fa) t = Math.min(0.5, ea / (2 * w0));
      else if (fb) t = Math.max(0.5, 1 - eb / (2 * w0));
      else t = 0.5;
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      n++;
    }
  }
  return { crossT, edges: n };
}

// Lazy variant: rings 1..2 scanned directly; per-plane summed-area tables
// are built on first need (keyed by orientation, site type, plane).
function lazyPlaneSat(cache, mask, region, axis, c) {
  let P = cache.get(c);
  if (P) return P;
  const { nx, ny, nz } = region;
  const nu = axis === 0 ? ny : nx;
  const nv = axis === 2 ? ny : nz;
  const W = nu + 1, H = nv + 1;
  const sat = new Int32Array(W * H);
  for (let v = 1; v <= nv; v++) {
    let row = 0;
    for (let u = 1; u <= nu; u++) {
      let X, Y, Z;
      if (axis === 0) { X = c; Y = u - 1; Z = v - 1; } else if (axis === 1) { X = u - 1; Y = c; Z = v - 1; } else { X = u - 1; Y = v - 1; Z = c; }
      row += mask[(Y * nz + Z) * nx + X];
      sat[v * W + u] = sat[(v - 1) * W + u] + row;
    }
  }
  P = { sat, W, H: H, nu, nv };
  cache.set(c, P);
  return P;
}
function satCount1(P, u0, v0, u1, v1) {
  if (u0 < 0) u0 = 0; if (v0 < 0) v0 = 0;
  if (u1 > P.nu - 1) u1 = P.nu - 1; if (v1 > P.nv - 1) v1 = P.nv - 1;
  if (u1 < u0 || v1 < v0) return 0;
  const W = P.W, s = P.sat;
  return s[(v1 + 1) * W + (u1 + 1)] - s[v0 * W + (u1 + 1)] - s[(v1 + 1) * W + u0] + s[v0 * W + u0];
}
function ringScan(mask, region, axis, x, y, z, r0, R, out) {
  const { nx, ny, nz } = region;
  let best = Infinity, su = 0, sv = 0;
  for (let r = r0; r <= R; r++) {
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
        let X = x, Y = y, Z = z;
        if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        if (!mask[(Y * nz + Z) * nx + X]) continue;
        const d2 = du * du + dv * dv;
        if (d2 < best) { best = d2; su = du; sv = dv; } else if (d2 === best) { su += du; sv += dv; }
      }
    }
    if (best <= (r + 1) * (r + 1)) break;
    if (r === 2 && best === Infinity) return null; // hand over to the table
  }
  if (best === Infinity) { out[0] = Infinity; out[1] = 0; out[2] = 0; return out; }
  const d = Math.sqrt(best), l = Math.sqrt(su * su + sv * sv);
  out[0] = d; out[1] = l > 0 ? su / l : 0; out[2] = l > 0 ? sv / l : 0;
  return out;
}
function nearestLazy(mask, cache, region, axis, x, y, z, R, out) {
  if (ringScan(mask, region, axis, x, y, z, 1, R, out)) return out;
  const c = axis === 0 ? x : axis === 1 ? y : z;
  const u = axis === 0 ? y : x;
  const v = axis === 2 ? y : z;
  const P = lazyPlaneSat(cache, mask, region, axis, c);
  if (satCount1(P, u - R, v - R, u + R, v + R) === 0) { out[0] = Infinity; out[1] = 0; out[2] = 0; return out; }
  let r0 = 3;
  while (r0 < R && satCount1(P, u - r0, v - r0, u + r0, v + r0) === 0) r0++;
  return ringScan(mask, region, axis, x, y, z, r0, R, out) ?? out;
}

/** Production-shaped contour crossings: identical output to contourCross2
 *  (dome:false), bounded cost. */
export function contourCross4(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== AIRV ? 1 : 0;
  const { A, S } = siteMasks(solid, region);
  const CA = [], CS = [];
  for (let o = 0; o < 6; o++) { CA.push(new Map()); CS.push(new Map()); }
  const st = [1, nx * nz, nx];
  const crossT = new Float32Array(total * 3).fill(-1);
  const ra = [0, 0, 0], rb = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? x : a === 1 ? y : z;
      const nA = a === 0 ? nx : a === 1 ? ny : nz;
      if (c + 1 >= nA) continue;
      const q = p + st[a];
      if (solid[p] === solid[q]) continue;
      if (!shapeEdited[p] && !shapeEdited[q]) continue;
      const sIsP = solid[p] === 1;
      const o = a * 2 + (sIsP ? 0 : 1);
      const sx = sIsP ? x : x + (a === 0), sy = sIsP ? y : y + (a === 1), sz = sIsP ? z : z + (a === 2);
      const bx = sIsP ? x + (a === 0) : x, by = sIsP ? y + (a === 1) : y, bz = sIsP ? z + (a === 2) : z;
      nearestLazy(A[o], CA[o], region, a, sx, sy, sz, R, ra);
      nearestLazy(S[o], CS[o], region, a, bx, by, bz, R, rb);
      const fa = ra[0] !== Infinity, fb = rb[0] !== Infinity;
      const ea = ra[0] - 0.5, eb = rb[0] - 0.5;
      let t;
      if (fa && fb) t = ea / (ea + eb);
      else if (fa) t = Math.min(0.5, ea / (2 * w0));
      else if (fb) t = Math.max(0.5, 1 - eb / (2 * w0));
      else t = 0.5;
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      n++;
    }
  }
  return { crossT, edges: n };
}
