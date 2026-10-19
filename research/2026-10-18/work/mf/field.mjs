// mf — per-vertex material fields, decided per fragment.
//
// Geometry is the production 'hints' mesh. Optionally a quad that a material
// boundary crosses is drawn as a 4-triangle fan around the midpoint of its
// existing diagonal ('fan'): the four triangles lie exactly in the planes of
// the original two, so the surface (and collision) is unchanged; the extra
// vertex carries the field at the lattice face centre. 'flip' instead swaps
// the diagonal where the two triangulations differ by under `flipTwist`.
//
// Per lattice corner: a kernel over nearby SURFACE blocks (solid, not
// sharp, with an air 6-neighbour) gives one weight per material, w_m.
// Per vertex (corner, own material A): r_m = w_m − w_A for every m ≠ A,
// clamped to [−R, R] and quantised to `bits` signed bits — what would sit
// in the vertex. The GPU interpolates r linearly in each triangle; the
// fragment shows argmax over {A: 0, m: r_m}. Every quad meeting at a corner
// derives r from the same w, so the boundary is one continuous curve.
//
// Thin-feature guards scale a block's kernel weight ("boost"):
//   'support' — by its own-material share at its own centre;
//   'corner'  — by its own-material share at its best surface corner, so
//               every block wins at least one corner (a lone block shows, a
//               1-wide diagonal line connects through its shared corners).
//
// Everything stored per vertex uses + − × ÷ only, in a fixed order; the
// kernel weights are constants (a table of literals in production).

const AIR = 0;
const SHARP = 256;

// ---------------------------------------------------------------- kernels
function k1Factory(k) {
  switch (k.type) {
    case 'box': return (t) => (t < 1 ? 1 : 0);
    case 'gauss': { const s2 = 2 * k.sigma * k.sigma; return (t) => Math.exp(-(t * t) / s2); }
    case 'tent': return (t) => Math.max(0, 1 - t / k.r);
    case 'bspline3': {
      const s = k.scale;
      return (t) => {
        const x = Math.abs(t / s);
        if (x < 1) return 2 / 3 - x * x + (x * x * x) / 2;
        if (x < 2) return ((2 - x) ** 3) / 6;
        return 0;
      };
    }
    case 'bspline2': {
      const s = k.scale;
      return (t) => {
        const x = Math.abs(t / s);
        if (x < 0.5) return 0.75 - x * x;
        if (x < 1.5) return ((1.5 - x) ** 2) / 2;
        return 0;
      };
    }
    case 'keys': { // Keys cubic (a = −0.5: Catmull–Rom), interpolating
      const s = k.scale, a = k.a ?? -0.5;
      return (t) => {
        const x = Math.abs(t / s);
        if (x < 1) return (a + 2) * x ** 3 - (a + 3) * x * x + 1;
        if (x < 2) return a * x ** 3 - 5 * a * x * x + 8 * a * x - 4 * a;
        return 0;
      };
    }
    case 'poly': { // (1 − (t/r)²)^p, compact; p integer
      const r = k.r, p = k.p ?? 2;
      return (t) => { const u = 1 - (t / r) * (t / r); return u > 0 ? u ** p : 0; };
    }
    default: throw new Error(`kernel ${k.type}`);
  }
}

/** Weight lookup for a block-centre offset (tx, ty, tz), each a multiple of
 *  0.5. Separable kernels multiply 1-D weights; radial ones use r. Results
 *  are memoised, i.e. a constant table. */
function makeWeight(k) {
  const trunc = k.trunc ?? 2.5;
  const f = k1Factory(k);
  const yScale = k.yScale ?? 1;
  const cache = new Map();
  const raw = k.radial
    ? (tx, ty, tz) => f(Math.sqrt(tx * tx + (ty * ty) / (yScale * yScale) + tz * tz))
    : (tx, ty, tz) => f(Math.abs(tx)) * f(Math.abs(ty) / yScale) * f(Math.abs(tz));
  return (tx, ty, tz) => {
    if (Math.abs(tx) > trunc || Math.abs(ty) > trunc || Math.abs(tz) > trunc) return 0;
    const key = ((tx * 2 + 32) * 128 + (ty * 2 + 32)) * 128 + (tz * 2 + 32);
    let w = cache.get(key);
    if (w === undefined) { w = raw(tx, ty, tz); cache.set(key, w); }
    return w;
  };
}

// ---------------------------------------------------------------- build
export const DEFAULTS = {
  kernel: { type: 'gauss', sigma: 1.0, trunc: 2.5 },
  guard: { type: 'corner', tau: 0.58 },
  ownBonus: 0,
  R: 0.5, // clamp range of r_m
  bits: 5, // signed bits per r_m (null = float)
  diag: 'fan', // 'keep' | 'flip' | 'fan'
  flipTwist: 0.03, // 'flip': max diagonal-midpoint separation (blocks)
  blend: null, // fragment-side: { amp, freq } noise-modulated threshold
};

export function build(opts) {
  const o = { ...DEFAULTS, ...opts, kernel: { ...DEFAULTS.kernel, ...(opts.kernel ?? {}) }, guard: { ...DEFAULTS.guard, ...(opts.guard ?? {}) } };
  const W = o.kernel.type === 'aniso' || o.kernel.type === 'curved' ? null : makeWeight(o.kernel);
  const trunc = o.kernel.trunc ?? 2.5;

  function mesh(region, scene, core) {
    const base = core.decodeMesh(core.meshRegion({ ...region, params: o.meshParams ?? {} }));
    return addField(base, region);
  }

  function addField(m, region) {
    const { nx, ny, nz, apron, blocks } = region;
    const N = nx * ny * nz;
    const SY = nx * nz, SZ = nx;
    const mat = new Uint8Array(N);
    const surf = new Uint8Array(N);
    for (let i = 0; i < N; i++) mat[i] = blocks[i] & 0xff;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = (y * nz + z) * nx + x;
      if (mat[i] === AIR || (blocks[i] & SHARP) !== 0) continue;
      if ((x > 0 && mat[i - 1] === AIR) || (x < nx - 1 && mat[i + 1] === AIR) ||
          (y > 0 && mat[i - SY] === AIR) || (y < ny - 1 && mat[i + SY] === AIR) ||
          (z > 0 && mat[i - SZ] === AIR) || (z < nz - 1 && mat[i + SZ] === AIR)) surf[i] = 1;
    }
    const boost = new Float64Array(N).fill(1);
    // exposed-face mask per surface block: bit 2a = −axis a, bit 2a+1 = +axis a
    const faces = new Uint8Array(N);
    for (let y = 1; y < ny - 1; y++) for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) {
      const i = (y * nz + z) * nx + x;
      if (!surf[i]) continue;
      faces[i] = (mat[i - 1] === AIR ? 1 : 0) | (mat[i + 1] === AIR ? 2 : 0) | (mat[i - SY] === AIR ? 4 : 0) |
        (mat[i + SY] === AIR ? 8 : 0) | (mat[i - SZ] === AIR ? 16 : 0) | (mat[i + SZ] === AIR ? 32 : 0);
    }
    const nw = o.normalWeight ?? false;
    const nwLo = o.nwLo ?? 0, nwHi = o.nwHi ?? 1;
    // how much of block i faces direction n: max over its exposed faces of max(0, n·face normal)
    const facing = (i, n) => {
      const f = faces[i];
      let best = 0;
      if (f & 1 && -n[0] > best) best = -n[0];
      if (f & 2 && n[0] > best) best = n[0];
      if (f & 4 && -n[1] > best) best = -n[1];
      if (f & 8 && n[1] > best) best = n[1];
      if (f & 16 && -n[2] > best) best = -n[2];
      if (f & 32 && n[2] > best) best = n[2];
      return best;
    };
    const blockNormal = (i, out) => {
      const f = faces[i];
      out[0] = ((f >> 1) & 1) - (f & 1); out[1] = ((f >> 3) & 1) - ((f >> 2) & 1); out[2] = ((f >> 5) & 1) - ((f >> 4) & 1);
      const l = Math.sqrt(out[0] * out[0] + out[1] * out[1] + out[2] * out[2]);
      if (l > 0) { out[0] /= l; out[1] /= l; out[2] /= l; } else { out[0] = 0; out[1] = 1; out[2] = 0; }
      return out;
    };

    // ---- anisotropic kernel (kernel.type 'aniso') ----
    // Boundary elements: midpoints of surface-block pairs (face or edge
    // neighbours) of different materials. Their weighted covariance around a
    // point gives the boundary direction t and an anisotropy a ∈ [0, 1];
    // the kernel is (1 − u²/Lt²)² (1 − v²/Ln²)² with u along t, v the
    // distance off the t axis, Lt = Ln + a²(Llong − Ln).
    const ANI = o.kernel.type === 'aniso' || o.kernel.type === 'curved';
    const kk = o.kernel;
    const grid = new Map();
    if (ANI) {
      const offs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]];
      for (let y = 1; y < ny - 1; y++) for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) {
        const i = (y * nz + z) * nx + x;
        if (!surf[i]) continue;
        for (const [dx, dy, dz] of offs) {
          const j = i + dy * SY + dz * SZ + dx;
          if (!surf[j] || mat[j] === mat[i]) continue;
          const ex = x + 0.5 + dx / 2, ey = y + 0.5 + dy / 2, ez = z + 0.5 + dz / 2;
          const key = (Math.floor(ey) * nz + Math.floor(ez)) * nx + Math.floor(ex);
          let list = grid.get(key);
          if (!list) { list = []; grid.set(key, list); }
          list.push(ex, ey, ez, (dx === 0 || dy === 0 || dz === 0) && dx + dy + dz !== 0 && Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1 ? 1 : (kk.edgeW ?? 0.5));
        }
      }
    }
    const dirCache = new Map();
    const C = new Float64Array(9);
    const powerIt = (M, v) => {
      // major eigenvector of symmetric 3×3 M; start from its largest column
      let best = -1;
      for (let c = 0; c < 3; c++) {
        const l = M[c] * M[c] + M[3 + c] * M[3 + c] + M[6 + c] * M[6 + c];
        if (l > best) { best = l; v[0] = M[c]; v[1] = M[3 + c]; v[2] = M[6 + c]; }
      }
      if (best <= 1e-18) { v[0] = 1; v[1] = 0; v[2] = 0; return 0; }
      for (let it = 0; it < 16; it++) {
        const a = M[0] * v[0] + M[1] * v[1] + M[2] * v[2];
        const b = M[3] * v[0] + M[4] * v[1] + M[5] * v[2];
        const c = M[6] * v[0] + M[7] * v[1] + M[8] * v[2];
        const l = Math.sqrt(a * a + b * b + c * c);
        if (l <= 1e-18) break;
        v[0] = a / l; v[1] = b / l; v[2] = c / l;
      }
      return v[0] * (M[0] * v[0] + M[1] * v[1] + M[2] * v[2]) + v[1] * (M[3] * v[0] + M[4] * v[1] + M[5] * v[2]) + v[2] * (M[6] * v[0] + M[7] * v[1] + M[8] * v[2]);
    };
    const dirAt = (px, py, pz) => {
      const key = ((py * 2) * 4096 + pz * 2) * 4096 + px * 2;
      let d = dirCache.get(key);
      if (d) return d;
      const Rd = kk.dirR ?? 3, R2 = Rd * Rd;
      let sw = 0, mx = 0, my = 0, mz = 0;
      const pts = [];
      for (let gy = Math.floor(py - Rd); gy <= Math.floor(py + Rd); gy++) for (let gz = Math.floor(pz - Rd); gz <= Math.floor(pz + Rd); gz++) for (let gx = Math.floor(px - Rd); gx <= Math.floor(px + Rd); gx++) {
        const list = grid.get((gy * nz + gz) * nx + gx);
        if (!list) continue;
        for (let k = 0; k < list.length; k += 4) {
          const ex = list[k] - px, ey = list[k + 1] - py, ez = list[k + 2] - pz;
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 >= R2) continue;
          const q = 1 - d2 / R2;
          const w = q * q * list[k + 3];
          pts.push(ex, ey, ez, w);
          sw += w; mx += w * ex; my += w * ey; mz += w * ez;
        }
      }
      d = { t: [1, 0, 0], a: 0 };
      if (sw > 1e-9) {
        mx /= sw; my /= sw; mz /= sw;
        C.fill(0);
        for (let k = 0; k < pts.length; k += 4) {
          const ex = pts[k] - mx, ey = pts[k + 1] - my, ez = pts[k + 2] - mz, w = pts[k + 3];
          C[0] += w * ex * ex; C[1] += w * ex * ey; C[2] += w * ex * ez;
          C[4] += w * ey * ey; C[5] += w * ey * ez; C[8] += w * ez * ez;
        }
        C[3] = C[1]; C[6] = C[2]; C[7] = C[5];
        for (let k = 0; k < 9; k++) C[k] /= sw;
        const v = [1, 0, 0];
        const l1 = powerIt(C, v);
        const D = Float64Array.from(C);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) D[r * 3 + c] -= l1 * v[r] * v[c];
        const v2 = [0, 1, 0];
        const l2 = Math.max(0, powerIt(D, v2));
        const a = l1 > 1e-12 ? (l1 - l2) / l1 : 0;
        // n ⟂ t: second eigenvector, re-orthogonalised; b = t × n
        let nd = v2[0] * v[0] + v2[1] * v[1] + v2[2] * v[2];
        let n = [v2[0] - nd * v[0], v2[1] - nd * v[1], v2[2] - nd * v[2]];
        let nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
        if (nl < 1e-9) { n = Math.abs(v[1]) < 0.9 ? [v[2], 0, -v[0]] : [0, -v[2], v[1]]; nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]); }
        n = [n[0] / nl, n[1] / nl, n[2] / nl];
        const b = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]];
        // osculating parabola v = c0 + κ u²/2 through the elements (frame at μ)
        let kappa = 0;
        if (kk.type === 'curved') {
          let S0 = 0, S1 = 0, S2 = 0, T0 = 0, T1 = 0;
          for (let k = 0; k < pts.length; k += 4) {
            const ex = pts[k] - mx, ey = pts[k + 1] - my, ez = pts[k + 2] - mz, w = pts[k + 3];
            const u = ex * v[0] + ey * v[1] + ez * v[2], vv = ex * n[0] + ey * n[1] + ez * n[2];
            const h = (u * u) / 2;
            S0 += w; S1 += w * h; S2 += w * h * h; T0 += w * vv; T1 += w * vv * h;
          }
          const det = S0 * S2 - S1 * S1;
          if (det > 1e-9 * S0 * S2) kappa = (S0 * T1 - S1 * T0) / det;
          const km = kk.kmax ?? 0.6;
          kappa = kappa < -km ? -km : kappa > km ? km : kappa;
        }
        d = { t: v, a, n, b, mu: [mx, my, mz], kappa };
      }
      dirCache.set(key, d);
      return d;
    };
    const kpoly = (x2) => (x2 < 1 ? (1 - x2) * (1 - x2) : 0);
    const anisoScoresAt = (px, py, pz, out) => {
      out.fill(0);
      const dd = dirAt(px, py, pz);
      const { t, a } = dd;
      const curved = kk.type === 'curved' && dd.n && dd.kappa !== 0;
      const a0 = kk.a0 ?? 0, ae = a <= a0 ? 0 : (a - a0) / (1 - a0);
      const Ln = kk.ln, Lt = kk.ln + ae * ae * (kk.llong - kk.ln);
      const iLn2 = 1 / (Ln * Ln), iLt2 = 1 / (Lt * Lt);
      const Rw = Math.max(Ln, Lt);
      let tot = 0;
      const x0 = Math.ceil(px - 0.5 - Rw), x1 = Math.floor(px - 0.5 + Rw);
      const y0 = Math.ceil(py - 0.5 - Rw), y1 = Math.floor(py - 0.5 + Rw);
      const z0 = Math.ceil(pz - 0.5 - Rw), z1 = Math.floor(pz - 0.5 + Rw);
      for (let by = Math.max(0, y0); by <= Math.min(ny - 1, y1); by++) {
        for (let bz = Math.max(0, z0); bz <= Math.min(nz - 1, z1); bz++) {
          for (let bx = Math.max(0, x0); bx <= Math.min(nx - 1, x1); bx++) {
            const i = (by * nz + bz) * nx + bx;
            if (!surf[i]) continue;
            const dx = bx + 0.5 - px, dy = by + 0.5 - py, dz = bz + 0.5 - pz;
            const u = dx * t[0] + dy * t[1] + dz * t[2];
            let v2;
            if (curved) {
              // across distance measured from the parabola through p
              const n = dd.n, bb = dd.b, mu = dd.mu, kap = dd.kappa;
              const qx = dx - mu[0], qy = dy - mu[1], qz = dz - mu[2]; // block rel. μ
              const ub = qx * t[0] + qy * t[1] + qz * t[2], vb = qx * n[0] + qy * n[1] + qz * n[2], wb = qx * bb[0] + qy * bb[1] + qz * bb[2];
              const up = -(mu[0] * t[0] + mu[1] * t[1] + mu[2] * t[2]), vp = -(mu[0] * n[0] + mu[1] * n[1] + mu[2] * n[2]), wp = -(mu[0] * bb[0] + mu[1] * bb[1] + mu[2] * bb[2]);
              const dv = (vb - (kap * ub * ub) / 2) - (vp - (kap * up * up) / 2);
              const dw = wb - wp;
              v2 = dv * dv + dw * dw;
            } else v2 = dx * dx + dy * dy + dz * dz - u * u;
            const w = kpoly(u * u * iLt2) * kpoly(v2 * iLn2) * boost[i];
            if (w === 0) continue;
            out[mat[i]] += w;
            tot += w;
          }
        }
      }
      if (tot > 0) for (let k = 0; k < 8; k++) out[k] /= tot;
      return tot;
    };

    // field at a point p (region coords; each component integer or half-integer)
    const scoresAt = (px, py, pz, out, n = null) => {
      if (ANI) return anisoScoresAt(px, py, pz, out);
      out.fill(0);
      let tot = 0;
      const x0 = Math.ceil(px - 0.5 - trunc), x1 = Math.floor(px - 0.5 + trunc);
      const y0 = Math.ceil(py - 0.5 - trunc), y1 = Math.floor(py - 0.5 + trunc);
      const z0 = Math.ceil(pz - 0.5 - trunc), z1 = Math.floor(pz - 0.5 + trunc);
      for (let by = Math.max(0, y0); by <= Math.min(ny - 1, y1); by++) {
        for (let bz = Math.max(0, z0); bz <= Math.min(nz - 1, z1); bz++) {
          for (let bx = Math.max(0, x0); bx <= Math.min(nx - 1, x1); bx++) {
            const i = (by * nz + bz) * nx + bx;
            if (!surf[i]) continue;
            let w = W(bx + 0.5 - px, by + 0.5 - py, bz + 0.5 - pz) * boost[i];
            if (nw && n) {
              const fa = facing(i, n);
              w *= fa >= nwHi ? 1 : fa <= nwLo ? 0 : (fa - nwLo) / (nwHi - nwLo);
            }
            if (w === 0) continue;
            out[mat[i]] += w;
            tot += w;
          }
        }
      }
      if (tot > 0) for (let k = 0; k < 8; k++) out[k] /= tot;
      return tot;
    };

    // ---- thin-feature guard: boosts from the UNBOOSTED field ----
    const reach = o.supportReach ?? 4; // blocks around the chunk that need a boost
    const lo = Math.max(1, apron - reach);
    const hx = Math.min(nx - 1, apron + 32 + reach), hy = Math.min(ny - 1, apron + 32 + reach), hz = Math.min(nz - 1, apron + 32 + reach);
    const tauOf = (s) => {
      const { tau, tau1 = tau, sLone = 0.2, sLine = 0.45 } = o.guard;
      return s >= sLine ? tau : s <= sLone ? tau1 : tau1 + ((tau - tau1) * (s - sLone)) / (sLine - sLone);
    };
    const pending = [];
    if (o.guard.type === 'support') {
      const rs = o.guard.rs ?? 2;
      const f = new Float64Array(8);
      const nb = [0, 1, 0];
      for (let y = lo; y < hy; y++) for (let z = lo; z < hz; z++) for (let x = lo; x < hx; x++) {
        const i = (y * nz + z) * nx + x;
        if (!surf[i]) continue;
        void rs;
        scoresAt(x + 0.5, y + 0.5, z + 0.5, f, nw ? blockNormal(i, nb) : null);
        pending.push(i, f[mat[i]]);
      }
    } else if (o.guard.type === 'corner') {
      const cfield = new Map();
      const cornerField = (cx, cy, cz) => {
        const key = (cy * nz + cz) * nx + cx;
        let f = cfield.get(key);
        if (!f) { f = new Float64Array(8); if (scoresAt(cx, cy, cz, f) === 0) f[0] = -1; cfield.set(key, f); }
        return f;
      };
      for (let y = lo; y < hy; y++) for (let z = lo; z < hz; z++) for (let x = lo; x < hx; x++) {
        const i = (y * nz + z) * nx + x;
        if (!surf[i]) continue;
        let s = 0;
        for (let k = 0; k < 8; k++) {
          const cx = x + (k & 1), cy = y + ((k >> 2) & 1), cz = z + ((k >> 1) & 1);
          if (cx < 1 || cy < 1 || cz < 1 || cx >= nx || cy >= ny || cz >= nz) continue;
          let solidN = 0;
          for (let j = 0; j < 8; j++) {
            const bx = cx - 1 + (j & 1), by = cy - 1 + ((j >> 2) & 1), bz = cz - 1 + ((j >> 1) & 1);
            if (mat[(by * nz + bz) * nx + bx] !== AIR) solidN++;
          }
          if (solidN === 0 || solidN === 8) continue; // not a surface corner
          const f = cornerField(cx, cy, cz);
          if (f[0] < 0) continue;
          if (f[mat[i]] > s) s = f[mat[i]];
        }
        pending.push(i, s);
      }
    }
    for (let k = 0; k < pending.length; k += 2) {
      const i = pending[k], s = pending[k + 1];
      if (s <= 0) continue;
      if (o.guard.mode === 'const') {
        // constant boost beta below s1, ramping to 1 at s2: keeps a thin
        // feature's mass ratios (line width ∝ blocks per unit length)
        const { beta, s1, s2 } = o.guard;
        boost[i] = s <= s1 ? beta : s >= s2 ? 1 : beta + ((1 - beta) * (s - s1)) / (s2 - s1);
        continue;
      }
      const t = tauOf(s);
      if (s < t) boost[i] = Math.min(o.guard.maxBoost ?? 50, (t * (1 - s)) / ((1 - t) * s));
    }

    // ---- per-corner field (boosted), cached ----
    const cornerCache = new Map();
    const fieldOfCorner = (cx, cy, cz, n) => { // chunk-local corner, its smooth normal
      const key = ((cy + 64) * 256 + (cz + 64)) * 256 + (cx + 64);
      let f = cornerCache.get(key);
      if (!f) {
        f = new Float64Array(8);
        if (scoresAt(cx + apron, cy + apron, cz + apron, f, n) === 0) f[0] = -1; // no field
        cornerCache.set(key, f);
      }
      return f;
    };

    const R = o.R;
    const qmax = o.bits ? (1 << (o.bits - 1)) - 1 : 0;
    const enc = (r) => {
      let v = r < -R ? -R : r > R ? R : r;
      if (qmax) v = (Math.round((v / R) * qmax) / qmax) * R;
      return v;
    };
    const relInto = (f, own, out, off) => {
      // r_m = w_m − w_own (own slot 0); no field → own wins outright
      for (let k = 0; k < 8; k++) {
        if (k === own) { out[off + k] = 0; continue; }
        if (k === 0 || f[0] < 0) { out[off + k] = -R; continue; }
        out[off + k] = enc(f[k] - f[own] - (o.ownBonus ?? 0));
      }
    };

    const V = m.V;
    const dim = 8;
    let attrs = new Float64Array(V * dim);
    for (let v = 0; v < V; v++) {
      const own = m.mat[v];
      if (m.flags[v] & 1) { // sharp: own only
        for (let k = 0; k < 8; k++) attrs[v * dim + k] = k === own ? 0 : -R;
        continue;
      }
      const f = fieldOfCorner(m.corner[v * 3], m.corner[v * 3 + 1], m.corner[v * 3 + 2], [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]]);
      relInto(f, own, attrs, v * dim);
    }

    // ---- quads the boundary crosses: flip or fan ----
    const winner = (a, off, own) => { let b = own, bv = 0; for (let k = 1; k < 8; k++) if (k !== own && a[off + k] > bv) { bv = a[off + k]; b = k; } return b; };
    const cen = new Float64Array(8), rc = new Float64Array(8);
    const faceCentreRel = (q, own, ring = null) => {
      const ax = m.quadAxis[q];
      let n = null;
      if (nw && ring) {
        n = [m.nrm[ring[0] * 3] + m.nrm[ring[2] * 3], m.nrm[ring[0] * 3 + 1] + m.nrm[ring[2] * 3 + 1], m.nrm[ring[0] * 3 + 2] + m.nrm[ring[2] * 3 + 2]];
        const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
        n[0] /= l; n[1] /= l; n[2] /= l;
      }
      const L = [m.quadLower[q * 3], m.quadLower[q * 3 + 1], m.quadLower[q * 3 + 2]];
      const c = [L[0] + 0.5, L[1] + 0.5, L[2] + 0.5];
      c[ax] = L[ax] + 1;
      const tot = scoresAt(c[0] + apron, c[1] + apron, c[2] + apron, cen, n);
      if (tot === 0) return null;
      relInto(cen, own, rc, 0);
      return rc;
    };
    let flipped = 0, wanted = 0, boundaryQuads = 0, fans = 0;
    const tri = m.tri, pos = m.pos;
    const ringOf = (q) => [tri[6 * q], tri[6 * q + 1], tri[6 * q + 2], tri[6 * q + 5]];
    if (o.diag === 'flip') {
      for (let q = 0; q < m.quadCount; q++) {
        const ring = ringOf(q);
        const own = m.mat[ring[0]];
        if (m.flags[ring[0]] & 1) continue;
        const ws = ring.map((v) => winner(attrs, v * dim, own));
        if (ws[0] === ws[1] && ws[1] === ws[2] && ws[2] === ws[3]) continue;
        boundaryQuads++;
        const r = faceCentreRel(q, own, ring);
        if (!r) continue;
        let e02 = 0, e13 = 0;
        for (let k = 1; k < 8; k++) {
          if (k === own) continue;
          e02 += (0.5 * (attrs[ring[0] * dim + k] + attrs[ring[2] * dim + k]) - r[k]) ** 2;
          e13 += (0.5 * (attrs[ring[1] * dim + k] + attrs[ring[3] * dim + k]) - r[k]) ** 2;
        }
        if (e13 < e02 - 1e-12) {
          wanted++;
          let tw = 0;
          for (let a = 0; a < 3; a++) {
            const d = 0.5 * (pos[ring[0] * 3 + a] + pos[ring[2] * 3 + a]) - 0.5 * (pos[ring[1] * 3 + a] + pos[ring[3] * 3 + a]);
            tw += d * d;
          }
          if (Math.sqrt(tw) <= o.flipTwist) {
            tri[6 * q] = ring[1]; tri[6 * q + 1] = ring[2]; tri[6 * q + 2] = ring[3];
            tri[6 * q + 3] = ring[1]; tri[6 * q + 4] = ring[3]; tri[6 * q + 5] = ring[0];
            flipped++;
          }
        }
      }
    } else if (o.diag === 'fan' || o.diag === 'auto') {
      // 'fan': split every quad whose 4 corners and centre do not agree.
      // 'auto': keep the quad when its existing diagonal's midpoint already
      // shows the centre's winner; else flip when the other diagonal does
      // and the twist is ≤ flipTwist; else split into a fan.
      const split = [];
      const centreAttr = [];
      const mid = new Float64Array(8);
      const midWinner = (a, b, own) => {
        for (let k = 0; k < 8; k++) mid[k] = 0.5 * (attrs[a * dim + k] + attrs[b * dim + k]);
        return winner(mid, 0, own);
      };
      for (let q = 0; q < m.quadCount; q++) {
        const ring = ringOf(q);
        const own = m.mat[ring[0]];
        if (m.flags[ring[0]] & 1) continue;
        const ws = ring.map((v) => winner(attrs, v * dim, own));
        const allSame = ws[0] === ws[1] && ws[1] === ws[2] && ws[2] === ws[3];
        if (o.diag === 'auto' && allSame && !(o.autoCheckUniform ?? true)) continue;
        const r = faceCentreRel(q, own, ring);
        if (!r) continue;
        const wc = winner(r, 0, own);
        if (allSame && ws[0] === wc) continue;
        boundaryQuads++;
        if (o.diag === 'auto') {
          // value error of each diagonal's midpoint against the centre field
          let e02 = 0, e13 = 0;
          for (let k = 1; k < 8; k++) {
            if (k === own) continue;
            e02 += (0.5 * (attrs[ring[0] * dim + k] + attrs[ring[2] * dim + k]) - r[k]) ** 2;
            e13 += (0.5 * (attrs[ring[1] * dim + k] + attrs[ring[3] * dim + k]) - r[k]) ** 2;
          }
          let d0 = ring[0], d1 = ring[2];
          if (e13 < e02 - 1e-12) {
            wanted++;
            let tw = 0;
            for (let a = 0; a < 3; a++) {
              const d = 0.5 * (pos[ring[0] * 3 + a] + pos[ring[2] * 3 + a]) - 0.5 * (pos[ring[1] * 3 + a] + pos[ring[3] * 3 + a]);
              tw += d * d;
            }
            if (Math.sqrt(tw) <= o.flipTwist) {
              tri[6 * q] = ring[1]; tri[6 * q + 1] = ring[2]; tri[6 * q + 2] = ring[3];
              tri[6 * q + 3] = ring[1]; tri[6 * q + 4] = ring[3]; tri[6 * q + 5] = ring[0];
              flipped++;
              d0 = ring[1]; d1 = ring[3];
            }
          }
          // fan only when the kept diagonal would show the wrong winner at the centre
          if (midWinner(d0, d1, own) === wc) continue;
        }
        split.push(q);
        centreAttr.push(Float64Array.from(r));
      }
      fans = split.length;
      if (fans > 0) {
        const V2 = V + fans, T2 = m.T + 2 * fans;
        const grow = (arr, n, Ctor) => { const a = new Ctor(n); a.set(arr); return a; };
        const pos2 = grow(m.pos, V2 * 3, Float64Array), nrm2 = grow(m.nrm, V2 * 3, Float64Array);
        const mat2 = grow(m.mat, V2, Uint8Array), flags2 = grow(m.flags, V2, Uint8Array), ao2 = grow(m.ao, V2, Float64Array);
        const corner2 = new Int32Array(V2 * 3).fill(-9999); corner2.set(m.corner);
        const attrs2 = grow(attrs, V2 * dim, Float64Array);
        const tri2 = new Uint32Array(T2 * 3), triQuad2 = new Int32Array(T2);
        let t = 0, s = 0;
        for (let q = 0; q < m.quadCount; q++) {
          if (s < fans && split[s] === q) {
            const ring = ringOf(q);
            const c = V + s;
            // the midpoint of the existing diagonal, on the 1/256 grid
            for (let a = 0; a < 3; a++) {
              pos2[c * 3 + a] = Math.round(((pos2[ring[0] * 3 + a] + pos2[ring[2] * 3 + a]) / 2 + 0.5) * 256) / 256 - 0.5;
              nrm2[c * 3 + a] = m.nrm[ring[0] * 3 + a] + m.nrm[ring[2] * 3 + a];
            }
            const l = Math.hypot(nrm2[c * 3], nrm2[c * 3 + 1], nrm2[c * 3 + 2]) || 1;
            for (let a = 0; a < 3; a++) nrm2[c * 3 + a] /= l;
            mat2[c] = m.mat[ring[0]]; flags2[c] = m.flags[ring[0]]; ao2[c] = (m.ao[ring[0]] + m.ao[ring[2]]) / 2;
            attrs2.set(centreAttr[s], c * dim);
            for (let e = 0; e < 4; e++) {
              tri2[t * 3] = c; tri2[t * 3 + 1] = ring[e]; tri2[t * 3 + 2] = ring[(e + 1) % 4];
              triQuad2[t++] = q;
            }
            s++;
          } else {
            for (let e = 0; e < 6; e++) tri2[t * 3 + e] = tri[6 * q + e];
            triQuad2[t++] = q; triQuad2[t++] = q;
          }
        }
        Object.assign(m, { V: V2, pos: pos2, nrm: nrm2, mat: mat2, flags: flags2, ao: ao2, corner: corner2, T: T2, tri: tri2, triQuad: triQuad2 });
        attrs = attrs2;
      }
    }
    m.attrs = attrs;
    m.attrDim = dim;
    m.mfStats = { boundaryQuads, wanted, flipped, fans, corners: cornerCache.size };
    return m;
  }

  // ---------------------------------------------------------- fragment
  const blend = o.blend;
  function hash2(ix, iz, s) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, z, s) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  function fragment(a, info) {
    const own = info.ownMat;
    let best = own, bv = 0;
    if (blend) {
      // soft variant: each material gets a noise "height" h_m (two octaves of
      // value noise in world xz, a little y); show argmax of r_m + h_m. Only
      // materials present in the field compete, so far from a boundary the
      // own material always shows.
      const fq = blend.freq;
      const hn = (k) => blend.amp * ((vnoise(info.x * fq, info.z * fq + info.y * 0.6 * fq, k * 7) - 0.5) +
        0.5 * (vnoise(info.x * fq * 2.7, info.z * fq * 2.7 - info.y * fq, k * 7 + 3) - 0.5));
      bv = hn(own);
      for (let k = 1; k < 8; k++) {
        if (k === own || a[k] <= -o.R + 1e-9) continue;
        const s = a[k] + hn(k);
        if (s > bv) { bv = s; best = k; }
      }
      return best;
    }
    for (let k = 1; k < 8; k++) if (k !== own && a[k] > bv) { bv = a[k]; best = k; }
    return best;
  }

  return { name: o.name, describe: o.describe, apron: o.apron ?? 10, mesh, fragment, opts: o };
}
