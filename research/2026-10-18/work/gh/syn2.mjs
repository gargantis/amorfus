// Round 2 contour crossings (team gh): the gh-cc8 rule plus three repairs,
// each behind a flag so they can be measured one by one.
//
// Base (gh-cc8): for a sign-changing edge s(solid)→b(air) along axis a that
// touches a shape-edited block, A = nearest air block in s's plane with
// solid behind it (c − n solid: one level lower), S = nearest solid block in
// b's plane with air in front (one level higher). t = eA/(eA+eB) with
// e = d − ½; one-sided → plateau rule over w0; none → ½.
//
// Repairs:
//  cliffY  — vertical (y) edges: a level can drop by more than one (a cliff,
//            an empty column), so A = nearest air at all in s's plane and
//            S = nearest solid at all in b's plane (A-/S-sites are special
//            cases). This is the plain height-field reading.
//  cliffH  — horizontal (x/z) edges: the same, but only along the other
//            horizontal axis in the edge's own layer (the plan outline's own
//            cliffs, e.g. the side of a tower), so wall tops and the ground
//            do not count as contours and walls stay vertical.
//  mirror  — one-sided edge: look along the mirror image of the found site's
//            direction for the missing type (solid in b's plane / air in s's
//            plane). Found at m → it is the missing contour. Repairs the toe
//            of 1:1 staircases (the first riser's missing S is the ground).
//
// Only + − × ÷ √, comparisons and Math.round on integers; fixed loop order.
const matOf = (v) => v & 0xff;
const ORIENTS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];

function masks(solid, region) {
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
  const air = new Uint8Array(total);
  for (let i = 0; i < total; i++) air[i] = solid[i] ? 0 : 1;
  return { A, S, air };
}

/** Nearest block with mask[i] === 1 in the plane ⊥ axis through (x,y,z),
 *  Chebyshev rings 1..R, Euclidean centre distance; ties: first in scan
 *  order gives the direction. Returns d (Infinity if none); out = [d, du, dv]. */
function nearest(mask, region, axis, x, y, z, R, out) {
  const { nx, ny, nz } = region;
  let best = Infinity, bu = 0, bv = 0;
  for (let r = 1; r <= R; r++) {
    for (let du = -r; du <= r; du++) {
      for (let dv = -r; dv <= r; dv++) {
        if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
        let X = x, Y = y, Z = z;
        if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        if (!mask[(Y * nz + Z) * nx + X]) continue;
        const d2 = du * du + dv * dv;
        if (d2 < best) { best = d2; bu = du; bv = dv; }
      }
    }
    if (best <= (r + 1) * (r + 1)) break;
  }
  out[0] = best === Infinity ? Infinity : Math.sqrt(best);
  out[1] = bu;
  out[2] = bv;
  return out;
}

/** Same, restricted to one in-plane axis (the other horizontal axis):
 *  plane coordinates (u, v) with u along `which` (0 → u, 1 → v). */
function nearestLine(mask, region, axis, x, y, z, R, which, out) {
  const { nx, ny, nz } = region;
  for (let r = 1; r <= R; r++) {
    for (const sg of [-1, 1]) {
      const du = which === 0 ? sg * r : 0, dv = which === 1 ? sg * r : 0;
      let X = x, Y = y, Z = z;
      if (axis === 0) { Y += du; Z += dv; } else if (axis === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
      if (mask[(Y * nz + Z) * nx + X]) { out[0] = r; out[1] = du; out[2] = dv; return out; }
    }
  }
  out[0] = Infinity; out[1] = 0; out[2] = 0;
  return out;
}

/** First block with mask = 1 along the ray −(du,dv) from (x,y,z) in the
 *  plane ⊥ axis, steps k·(du,dv)/max(|du|,|dv|) rounded, up to R. */
function mirrorRay(mask, region, axis, x, y, z, du, dv, R) {
  const { nx, ny, nz } = region;
  const g = Math.max(Math.abs(du), Math.abs(dv));
  if (g === 0) return Infinity;
  for (let k = 1; k <= R; k++) {
    const pu = -Math.round((k * du) / g), pv = -Math.round((k * dv) / g);
    const d2 = pu * pu + pv * pv;
    if (d2 > R * R) break;
    let X = x, Y = y, Z = z;
    if (axis === 0) { Y += pu; Z += pv; } else if (axis === 1) { X += pu; Z += pv; } else { X += pu; Y += pv; }
    if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return Infinity;
    if (mask[(Y * nz + Z) * nx + X]) return Math.sqrt(d2);
  }
  return Infinity;
}

export function contourCross5(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let any = false;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { any = true; break; }
  if (!any) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const cliffY = cfg.cliffY ?? false;
  const cliffH = cfg.cliffH ?? false;
  const cliffAll = cfg.cliffAll ?? false;
  const mirror = cfg.mirror ?? false;
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = matOf(blocks[i]) !== 0 ? 1 : 0;
  const { A, S, air } = masks(solid, region);
  const st = [1, nx * nz, nx];
  const crossT = new Float32Array(total * 3).fill(-1);
  const ra = [0, 0, 0], rb = [0, 0, 0], tmp = [0, 0, 0];
  const stats = { edges: 0, both: 0, one: 0, none: 0, cliff: 0, mirrored: 0 };
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
      nearest(A[o], region, a, sx, sy, sz, R, ra);
      nearest(S[o], region, a, bx, by, bz, R, rb);
      let da = ra[0], db = rb[0];
      let au = ra[1], av = ra[2], bu = rb[1], bv = rb[2];
      const useCliff = cliffAll || (a === 1 ? cliffY : cliffH);
      if (useCliff) {
        // other-type blocks at all (any level drop / rise)
        if (cliffAll || a === 1) {
          nearest(air, region, a, sx, sy, sz, R, tmp);
          if (tmp[0] < da) { da = tmp[0]; au = tmp[1]; av = tmp[2]; stats.cliff++; }
          nearest(solid, region, a, bx, by, bz, R, tmp);
          if (tmp[0] < db) { db = tmp[0]; bu = tmp[1]; bv = tmp[2]; stats.cliff++; }
        } else {
          // horizontal edge: same layer only; in-plane axis along the other
          // horizontal axis: a = 0 → plane (u = y, v = z) → v; a = 2 → plane (u = x, v = y) → u
          const which = a === 0 ? 1 : 0;
          nearestLine(air, region, a, sx, sy, sz, R, which, tmp);
          if (tmp[0] < da) { da = tmp[0]; au = tmp[1]; av = tmp[2]; stats.cliff++; }
          nearestLine(solid, region, a, bx, by, bz, R, which, tmp);
          if (tmp[0] < db) { db = tmp[0]; bu = tmp[1]; bv = tmp[2]; stats.cliff++; }
        }
      }
      if (mirror) {
        if (da !== Infinity && db === Infinity) {
          const m = mirrorRay(solid, region, a, bx, by, bz, au, av, R);
          if (m !== Infinity) { db = m; stats.mirrored++; }
        } else if (db !== Infinity && da === Infinity) {
          const m = mirrorRay(air, region, a, sx, sy, sz, bu, bv, R);
          if (m !== Infinity) { da = m; stats.mirrored++; }
        }
      }
      const fa = da !== Infinity, fb = db !== Infinity;
      const ea = da - 0.5, eb = db - 0.5;
      let t;
      if (fa && fb) { t = ea / (ea + eb); stats.both++; }
      else if (fa) { t = Math.min(0.5, ea / (2 * w0)); stats.one++; }
      else if (fb) { t = Math.max(0.5, 1 - eb / (2 * w0)); stats.one++; }
      else { t = 0.5; stats.none++; }
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      stats.edges++;
    }
  }
  return { crossT, stats };
}

// ---------------------------------------------------------------------------
// contourCross6: the same output as contourCross5, production-shaped cost.
// No full-region masks: site predicates are evaluated in place. Rings 1–2
// are scanned directly; beyond that a lazily built per-plane summed-area
// table of the predicate says whether any site lies within Chebyshev radius
// r, so empty searches cost O(R) table reads and non-empty ones start at the
// first non-empty ring (scan order, hence tie-breaking, is unchanged).
const T_A = 0, T_S = 1, T_AIR = 2, T_SOLID = 3;

export function contourCross6(region, cfg = {}) {
  const { nx, ny, nz, blocks, shapeEdited } = region;
  const total = blocks.length;
  let first = -1;
  for (let i = 0; i < total; i++) if (shapeEdited[i]) { first = i; break; }
  if (first < 0) return null;
  const R = cfg.R ?? 8;
  const w0 = cfg.w0 ?? 1;
  const tmin = cfg.tmin ?? 0.02;
  const cliffY = cfg.cliffY ?? false;
  const cliffH = cfg.cliffH ?? false;
  const mirror = cfg.mirror ?? false;
  const pair = cfg.pair ?? false;
  const pairCos = cfg.pairCos ?? -0.5;
  const coneCos2 = (cfg.cone ?? 0) * (cfg.cone ?? 0); // re-pair search cone around the opposite direction
  const transverse = cfg.transverse ?? true; // the unpaired nearer site rounds (plateau rule)
  const solid = new Uint8Array(total);
  for (let i = 0; i < total; i++) solid[i] = (blocks[i] & 0xff) !== 0 ? 1 : 0;
  const st = [1, nx * nz, nx];
  const dims = [nx, ny, nz];
  // predicate of type T for orientation o at block (X,Y,Z), index i
  const pred = (T, a, sg, X, Y, Z, i) => {
    if (T === T_AIR) return solid[i] === 0;
    if (T === T_SOLID) return solid[i] === 1;
    const c = a === 0 ? X : a === 1 ? Y : Z;
    if (T === T_A) { const b = c - sg; return solid[i] === 0 && b >= 0 && b < dims[a] && solid[i - sg * st[a]] === 1; }
    const f = c + sg; return solid[i] === 1 && f >= 0 && f < dims[a] && solid[i + sg * st[a]] === 0;
  };
  const sats = new Map();
  const satOf = (T, a, sg, c) => {
    const k = ((T * 3 + a) * 2 + (sg > 0 ? 1 : 0)) * 1024 + c;
    let P = sats.get(k);
    if (P) return P;
    const nu = a === 0 ? ny : nx, nv = a === 2 ? ny : nz;
    const W = nu + 1;
    const sat = new Int32Array(W * (nv + 1));
    const ok = setPred(T, a, sg, c);
    const su = a === 0 ? nx * nz : 1, sv = a === 2 ? nx * nz : nx;
    const base = a === 0 ? c : a === 1 ? c * nx * nz : c * nx;
    for (let v = 1; v <= nv; v++) {
      let row = 0;
      const rowBase = base + (v - 1) * sv;
      for (let u = 1; u <= nu; u++) {
        if (ok) {
          const i = rowBase + (u - 1) * su;
          if (solid[i] === wSelf && (offN === 0 || solid[i + offN] === wNb)) row++;
        }
        sat[v * W + u] = sat[(v - 1) * W + u] + row;
      }
    }
    P = { sat, W, nu, nv };
    sats.set(k, P);
    return P;
  };
  const satCount = (P, u0, v0, u1, v1) => {
    if (u0 < 0) u0 = 0; if (v0 < 0) v0 = 0;
    if (u1 > P.nu - 1) u1 = P.nu - 1; if (v1 > P.nv - 1) v1 = P.nv - 1;
    if (u1 < u0 || v1 < v0) return 0;
    const W = P.W, s = P.sat;
    return s[(v1 + 1) * W + (u1 + 1)] - s[v0 * W + (u1 + 1)] - s[(v1 + 1) * W + u0] + s[v0 * W + u0];
  };
  // ring scan from r0 with the contourCross5 termination rule; returns
  // false if r reaches rStop (2) with nothing found (hand over to the table)
  const out = [0, 0, 0];
  // specialised predicate: solid[i] === wSelf && (offN === 0 || solid[i + offN] === wNb)
  let wSelf = 0, wNb = 0, offN = 0;
  const setPred = (T, a, sg, c) => {
    if (T === T_AIR) { wSelf = 0; offN = 0; return true; }
    if (T === T_SOLID) { wSelf = 1; offN = 0; return true; }
    if (T === T_A) { const b = c - sg; if (b < 0 || b >= dims[a]) return false; wSelf = 0; wNb = 1; offN = -sg * st[a]; return true; }
    const f = c + sg; if (f < 0 || f >= dims[a]) return false; wSelf = 1; wNb = 0; offN = sg * st[a]; return true;
  };
  const scan = (T, a, sg, x, y, z, r0, rStop) => {
    const c = a === 0 ? x : a === 1 ? y : z;
    if (!setPred(T, a, sg, c)) { out[0] = Infinity; out[1] = 0; out[2] = 0; return true; }
    // in-plane coordinates (u, v) and strides
    const u0 = a === 0 ? y : x, v0 = a === 2 ? y : z;
    const nu = a === 0 ? ny : nx, nv = a === 2 ? ny : nz;
    const su = a === 0 ? nx * nz : 1, sv = a === 2 ? nx * nz : nx;
    const base = (y * nz + z) * nx + x;
    let best = Infinity, bu = 0, bv = 0;
    for (let r = r0; r <= R; r++) {
      for (let du = -r; du <= r; du++) {
        const U = u0 + du;
        if (U < 0 || U >= nu) continue;
        const edge = du === -r || du === r;
        const step = edge ? 1 : 2 * r;
        for (let dv = -r; dv <= r; dv += step) {
          const V = v0 + dv;
          if (V < 0 || V >= nv) continue;
          const i = base + du * su + dv * sv;
          if (solid[i] !== wSelf || (offN !== 0 && solid[i + offN] !== wNb)) continue;
          const d2 = du * du + dv * dv;
          if (d2 < best) { best = d2; bu = du; bv = dv; }
        }
      }
      if (best <= (r + 1) * (r + 1)) break;
      if (r === rStop && best === Infinity) return false;
    }
    out[0] = best === Infinity ? Infinity : Math.sqrt(best);
    out[1] = bu;
    out[2] = bv;
    return true;
  };
  const nearest = (T, a, sg, x, y, z, res) => {
    if (!scan(T, a, sg, x, y, z, 1, 2)) {
      const c = a === 0 ? x : a === 1 ? y : z;
      const u = a === 0 ? y : x, v = a === 2 ? y : z;
      const P = satOf(T, a, sg, c);
      if (satCount(P, u - R, v - R, u + R, v + R) === 0) { out[0] = Infinity; out[1] = 0; out[2] = 0; }
      else {
        let r0 = 3;
        while (r0 < R && satCount(P, u - r0, v - r0, u + r0, v + r0) === 0) r0++;
        scan(T, a, sg, x, y, z, r0, -1);
      }
    }
    res[0] = out[0]; res[1] = out[1]; res[2] = out[2];
    return res;
  };
  const nearestLine = (T, a, x, y, z, which, res) => {
    for (let r = 1; r <= R; r++) {
      for (const s of [-1, 1]) {
        const du = which === 0 ? s * r : 0, dv = which === 1 ? s * r : 0;
        let X = x, Y = y, Z = z;
        if (a === 0) { Y += du; Z += dv; } else if (a === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const i = (Y * nz + Z) * nx + X;
        if (T === T_AIR ? solid[i] === 0 : solid[i] === 1) { res[0] = r; res[1] = du; res[2] = dv; return res; }
      }
    }
    res[0] = Infinity; res[1] = 0; res[2] = 0;
    return res;
  };
  // nearest site of the edge's merged type (A or S, plus cliffs as
  // configured) in the half-plane offset·(hu,hv) < 0; plain ring scan
  const half = [0, 0, 0];
  const nearestHalf = (isA, a, sg, x, y, z, hu, hv, res) => {
    const T = isA ? T_A : T_S;
    const cliffAll2 = a === 1 ? cliffY : false;
    const cliffLine = a !== 1 && cliffH;
    const which = a === 0 ? 1 : 0;
    let best = Infinity, bu2 = 0, bv2 = 0;
    for (let r = 1; r <= R; r++) {
      for (let du = -r; du <= r; du++) {
        for (let dv = -r; dv <= r; dv++) {
          if (du !== -r && du !== r && dv !== -r && dv !== r) continue;
          const dt = du * hu + dv * hv;
          if (dt >= 0 || dt * dt < coneCos2 * (du * du + dv * dv) * (hu * hu + hv * hv)) continue;
          let X = x, Y = y, Z = z;
          if (a === 0) { Y += du; Z += dv; } else if (a === 1) { X += du; Z += dv; } else { X += du; Y += dv; }
          if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
          const i = (Y * nz + Z) * nx + X;
          let hit = pred(T, a, sg, X, Y, Z, i);
          if (!hit && cliffAll2) hit = isA ? solid[i] === 0 : solid[i] === 1;
          if (!hit && cliffLine && (which === 0 ? dv === 0 : du === 0)) hit = isA ? solid[i] === 0 : solid[i] === 1;
          if (!hit) continue;
          const d2 = du * du + dv * dv;
          if (d2 < best) { best = d2; bu2 = du; bv2 = dv; }
        }
      }
      if (best <= (r + 1) * (r + 1)) break;
    }
    res[0] = best === Infinity ? Infinity : Math.sqrt(best);
    res[1] = bu2; res[2] = bv2;
    return res;
  };
  const mirrorRay = (wantSolid, a, x, y, z, du, dv) => {
    const g = Math.max(Math.abs(du), Math.abs(dv));
    if (g === 0) return Infinity;
    for (let k = 1; k <= R; k++) {
      const pu = -Math.round((k * du) / g), pv = -Math.round((k * dv) / g);
      const d2 = pu * pu + pv * pv;
      if (d2 > R * R) break;
      let X = x, Y = y, Z = z;
      if (a === 0) { Y += pu; Z += pv; } else if (a === 1) { X += pu; Z += pv; } else { X += pu; Y += pv; }
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) return Infinity;
      if (solid[(Y * nz + Z) * nx + X] === wantSolid) return Math.sqrt(d2);
    }
    return Infinity;
  };
  const crossT = new Float32Array(total * 3).fill(-1);
  const ra = [0, 0, 0], rb = [0, 0, 0], tmp = [0, 0, 0];
  let edges = 0;
  // visit only blocks within 1 of an edited block (edges touching one):
  // y-range from the first/last edited index
  let bx0 = nx, by0 = ny, bz0 = nz, bx1 = -1, by1 = -1, bz1 = -1;
  for (let y = 0, i = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++, i++) {
    if (shapeEdited[i] !== 1) continue;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (y < by0) by0 = y; if (y > by1) by1 = y;
    if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  const X0 = Math.max(0, bx0 - 1), X1 = Math.min(nx - 1, bx1 + 1);
  const Y0 = Math.max(0, by0 - 1), Y1 = Math.min(ny - 1, by1 + 1);
  const Z0 = Math.max(0, bz0 - 1), Z1 = Math.min(nz - 1, bz1 + 1);
  for (let y = Y0; y <= Y1; y++) for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    const p = (y * nz + z) * nx + x;
    for (let a = 0; a < 3; a++) {
      const c = a === 0 ? x : a === 1 ? y : z;
      if (c + 1 >= dims[a]) continue;
      const q = p + st[a];
      if (solid[p] === solid[q]) continue;
      if (!shapeEdited[p] && !shapeEdited[q]) continue;
      const sIsP = solid[p] === 1;
      const sg = sIsP ? 1 : -1; // n = b − s along +a when s = p
      const sx = sIsP ? x : x + (a === 0), sy = sIsP ? y : y + (a === 1), sz = sIsP ? z : z + (a === 2);
      const bx = sIsP ? x + (a === 0) : x, by = sIsP ? y + (a === 1) : y, bz = sIsP ? z + (a === 2) : z;
      nearest(T_A, a, sg, sx, sy, sz, ra);
      nearest(T_S, a, sg, bx, by, bz, rb);
      let da = ra[0], db = rb[0];
      let au = ra[1], av = ra[2], bu = rb[1], bv = rb[2];
      if (a === 1 ? cliffY : cliffH) {
        if (a === 1) {
          nearest(T_AIR, a, 1, sx, sy, sz, tmp);
          if (tmp[0] < da) { da = tmp[0]; au = tmp[1]; av = tmp[2]; }
          nearest(T_SOLID, a, 1, bx, by, bz, tmp);
          if (tmp[0] < db) { db = tmp[0]; bu = tmp[1]; bv = tmp[2]; }
        } else {
          const which = a === 0 ? 1 : 0;
          nearestLine(T_AIR, a, sx, sy, sz, which, tmp);
          if (tmp[0] < da) { da = tmp[0]; au = tmp[1]; av = tmp[2]; }
          nearestLine(T_SOLID, a, bx, by, bz, which, tmp);
          if (tmp[0] < db) { db = tmp[0]; bu = tmp[1]; bv = tmp[2]; }
        }
      }
      let trA = Infinity, trS = Infinity;
      if (pair && da !== Infinity && db !== Infinity) {
        const dot0 = (au * bu + av * bv) / Math.sqrt((au * au + av * av) * (bu * bu + bv * bv));
        if (dot0 > pairCos) {
          // A and S are not on opposite sides: re-pair each with the nearest
          // site of the other type on its far side, keep the most opposite
          // acceptable pair; the unpaired nearer site only rounds (plateau rule)
          const s1 = nearestHalf(false, a, sg, bx, by, bz, au, av, [0, 0, 0]);
          const a1 = nearestHalf(true, a, sg, sx, sy, sz, bu, bv, [0, 0, 0]);
          const dot1 = s1[0] !== Infinity ? (au * s1[1] + av * s1[2]) / Math.sqrt((au * au + av * av) * (s1[1] * s1[1] + s1[2] * s1[2])) : 2;
          const dot2 = a1[0] !== Infinity ? (a1[1] * bu + a1[2] * bv) / Math.sqrt((a1[1] * a1[1] + a1[2] * a1[2]) * (bu * bu + bv * bv)) : 2;
          const ok1 = dot1 <= pairCos, ok2 = dot2 <= pairCos;
          if (ok2 && (!ok1 || dot2 < dot1 || (dot2 === dot1 && a1[0] + db <= da + s1[0]))) {
            if (da < a1[0]) trA = da;
            da = a1[0]; au = a1[1]; av = a1[2];
          } else if (ok1) {
            if (db < s1[0]) trS = db;
            db = s1[0]; bu = s1[1]; bv = s1[2];
          }
        }
      }
      if (mirror) {
        if (da !== Infinity && db === Infinity) {
          const m = mirrorRay(1, a, bx, by, bz, au, av);
          if (m !== Infinity) db = m;
        } else if (db !== Infinity && da === Infinity) {
          const m = mirrorRay(0, a, sx, sy, sz, bu, bv);
          if (m !== Infinity) da = m;
        }
      }
      const fa = da !== Infinity, fb = db !== Infinity;
      const ea = da - 0.5, eb = db - 0.5;
      let t;
      if (fa && fb) t = ea / (ea + eb);
      else if (fa) t = Math.min(0.5, ea / (2 * w0));
      else if (fb) t = Math.max(0.5, 1 - eb / (2 * w0));
      else t = 0.5;
      if (transverse && trA !== Infinity) { const tp = (trA - 0.5) / (2 * w0); if (tp < t) t = tp; }
      if (transverse && trS !== Infinity) { const tp = 1 - (trS - 0.5) / (2 * w0); if (tp > t) t = tp; }
      if (t < tmin) t = tmin; else if (t > 1 - tmin) t = 1 - tmin;
      crossT[p * 3 + a] = sIsP ? t : 1 - t;
      edges++;
    }
  }
  return { crossT, stats: { edges, sats: sats.size } };
}
