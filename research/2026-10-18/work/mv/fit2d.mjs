// 2-D boundary recognition on a plan label map ("fit, don't filter").
//
// Pixels are unit squares [x, x+1] × [z, z+1] carrying a material id
// (−1 = unknown). Pointels are integer points. A boundary linel separates
// two pixels of different known materials. For an unordered material pair
// {A, B} (A < B) the A|B boundary is traced as an A-contour (A on the
// left), so the same linels give the same chain whichever side asks.
//
// Directions: 0 = E (+x), 1 = S (+z), 2 = W (−x), 3 = N (−z).
// left(d) = (d + 3) & 3, right(d) = (d + 1) & 3; left normal of a
// direction (tx, tz) is (tz, −tx).
//
// Every quantity that reaches a vertex is computed with + − × ÷ √ and
// comparisons only, in a fixed order, from a window of the label map that
// is fixed relative to the pointel or corner (seam-safe by construction).
import { DSS } from './dss.mjs';
import { arcLP, arcCenter } from './lp.mjs';

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];
// left / right pixel of the linel leaving pointel (X, Z) in direction d
const LPX = [0, 0, -1, -1], LPZ = [-1, 0, 0, -1];
const RPX = [0, -1, -1, 0], RPZ = [0, 0, -1, -1];

export const leftPixel = (X, Z, d) => [X + LPX[d], Z + LPZ[d]];
export const rightPixel = (X, Z, d) => [X + RPX[d], Z + RPZ[d]];

/** A window onto a label function: at(x, z) is −1 outside
 *  [x0, x1) × [z0, z1). */
export class LabelWindow {
  constructor(fn, x0, z0, x1, z1) { this.fn = fn; this.x0 = x0; this.z0 = z0; this.x1 = x1; this.z1 = z1; }
  at(x, z) {
    if (x < this.x0 || z < this.z0 || x >= this.x1 || z >= this.z1) return -1;
    return this.fn(x, z);
  }
}

/** Saddle rule at pointel (X, Z) whose 2×2 pixels are a two-material
 *  checker of u and v: does u connect diagonally? The material with fewer
 *  pixels in the 4×4 block around the pointel connects (the thin feature
 *  is the foreground); a tie goes to the lower id. */
export function saddleConnects(lw, X, Z, u, v) {
  let cu = 0, cv = 0;
  for (let z = Z - 2; z < Z + 2; z++) for (let x = X - 2; x < X + 2; x++) {
    const m = lw.at(x, z);
    if (m === u) cu++; else if (m === v) cv++;
  }
  if (cu !== cv) return cu < cv;
  return u < v;
}

function aConnects(lw, X, Z, A, o1, o2) {
  if (o1 !== o2 || o1 < 0) return true; // the other diagonal cannot join
  return saddleConnects(lw, X, Z, A, o1);
}

/** Next linel direction after arriving at pointel (x, z) with direction
 *  dir, keeping A on the left. */
function nextDir(lw, x, z, dir, A) {
  const al = lw.at(x + LPX[dir], z + LPZ[dir]);
  const ar = lw.at(x + RPX[dir], z + RPZ[dir]);
  if (al === A) return ar === A ? (dir + 1) & 3 : dir;
  if (ar === A) {
    const sx = x - DX[dir], sz = z - DZ[dir];
    const br = lw.at(sx + RPX[dir], sz + RPZ[dir]);
    return aConnects(lw, x, z, A, al, br) ? (dir + 1) & 3 : (dir + 3) & 3;
  }
  return (dir + 3) & 3;
}

/** Previous linel direction (the linel that ends at (x, z) when the
 *  current one leaves (x, z) in direction dir), keeping A on the left. */
function prevDir(lw, x, z, dir, A) {
  const rd = (dir + 2) & 3; // reverse travel, A on the right
  const al = lw.at(x + LPX[rd], z + LPZ[rd]);
  const ar = lw.at(x + RPX[rd], z + RPZ[rd]);
  let nrd;
  if (ar === A) nrd = al === A ? (rd + 3) & 3 : rd;
  else if (al === A) {
    const sx = x - DX[rd], sz = z - DZ[rd];
    const bl = lw.at(sx + LPX[rd], sz + LPZ[rd]);
    nrd = aConnects(lw, x, z, A, ar, bl) ? (rd + 3) & 3 : (rd + 1) & 3;
  } else nrd = (rd + 1) & 3;
  return (nrd + 2) & 3;
}

const linelIs = (lw, X, Z, d, A, B) =>
  lw.at(X + LPX[d], Z + LPZ[d]) === A && lw.at(X + RPX[d], Z + RPZ[d]) === B;

/**
 * Trace the A|B piece through linel (X, Z, d) (A left, B right), at most
 * maxSteps each way. Closed loops are unrolled three times so every
 * pointel sees context on both sides.
 * Returns { px, pz, dirs, n, start, closed }: pointel i lies between step
 * i−1 and step i; `start` is the index of (X, Z).
 */
export function tracePiece(lw, X, Z, d, A, B, maxSteps) {
  const fP = [], fD = [];
  let closed = false;
  {
    let x = X, z = Z, dir = d;
    for (let s = 0; s < maxSteps; s++) {
      fD.push(dir);
      x += DX[dir]; z += DZ[dir];
      fP.push(x, z);
      const nd = nextDir(lw, x, z, dir, A);
      if (!linelIs(lw, x, z, nd, A, B)) break;
      if (x === X && z === Z && nd === d) { closed = true; break; }
      dir = nd;
    }
  }
  if (closed) {
    // unroll: loop ×3, start in the middle copy
    const L = fD.length;
    const n = 3 * L;
    const px = new Int32Array(n + 1), pz = new Int32Array(n + 1), dirs = new Uint8Array(n);
    let x = X, z = Z;
    for (let i = 0; i < n; i++) {
      px[i] = x; pz[i] = z; dirs[i] = fD[i % L];
      x += DX[dirs[i]]; z += DZ[dirs[i]];
    }
    px[n] = x; pz[n] = z;
    return { px, pz, dirs, n, start: L, closed: true, loopLen: L };
  }
  const bP = [], bD = [];
  {
    let x = X, z = Z, dir = d;
    for (let s = 0; s < maxSteps; s++) {
      const pd = prevDir(lw, x, z, dir, A);
      const sx = x - DX[pd], sz = z - DZ[pd];
      if (!linelIs(lw, sx, sz, pd, A, B)) break;
      bD.push(pd); bP.push(sx, sz);
      x = sx; z = sz; dir = pd;
    }
  }
  const nb = bD.length, n = nb + fD.length;
  const px = new Int32Array(n + 1), pz = new Int32Array(n + 1), dirs = new Uint8Array(n);
  for (let i = 0; i < nb; i++) {
    const k = nb - 1 - i;
    px[i] = bP[k * 2]; pz[i] = bP[k * 2 + 1]; dirs[i] = bD[k];
  }
  px[nb] = X; pz[nb] = Z;
  for (let i = 0; i < fD.length; i++) {
    dirs[nb + i] = fD[i];
    px[nb + 1 + i] = fP[i * 2]; pz[nb + 1 + i] = fP[i * 2 + 1];
  }
  return { px, pz, dirs, n, start: nb, closed: false, loopLen: 0 };
}

/** Maximal DSS starting at step s going forward, at most to step eMax. */
export function longestFrom(ch, s, eMax) {
  const d = new DSS(ch.px[s], ch.pz[s], ch.px[s + 1], ch.pz[s + 1]);
  let e = s;
  while (e < eMax && d.addFront(ch.px[e + 2], ch.pz[e + 2])) e++;
  return { e, d };
}

/** Maximal DSS ending at step e going backward, at least to step sMin. */
export function longestTo(ch, e, sMin) {
  const d = new DSS(ch.px[e], ch.pz[e], ch.px[e + 1], ch.pz[e + 1]);
  let s = e;
  while (s > sMin && d.addBack(ch.px[s - 1], ch.pz[s - 1])) s--;
  return { s, d };
}

/** Tangential cover of steps [lo, hi]: maximal segments { s, e, line }. */
export function tangentialCover(ch, lo, hi) {
  const segs = [];
  let prevE = lo - 1;
  for (let s = lo; s <= hi; s++) {
    const { e, d } = longestFrom(ch, s, hi);
    if (e > prevE) {
      segs.push({ s, e, line: d.centerLine() });
      prevE = e;
      if (e === hi) break;
    }
  }
  return segs;
}

const lam = (t) => { const u = t * (1 - t); return 64 * u * u * u; };

function unitTangent(line, ch, s, e) {
  const { A, B } = line;
  let ux = -B, uz = A;
  const cdx = ch.px[e + 1] - ch.px[s], cdz = ch.pz[e + 1] - ch.pz[s];
  if (ux * cdx + uz * cdz < 0) { ux = -ux; uz = -uz; }
  const ul = Math.sqrt(ux * ux + uz * uz);
  return [ux / ul, uz / ul];
}

function project(line, X, Z) {
  const { A, B, C } = line;
  const k = (A * X + B * Z - C) / (A * A + B * B);
  return [X - k * A, Z - k * B];
}

/** λ-MST position and tangent of pointel i from the cover `segs`. */
export function lambdaMST(ch, segs, i) {
  const X = ch.px[i], Z = ch.pz[i];
  let wsum = 0, qx = 0, qz = 0, tx = 0, tz = 0;
  let best = null, bestLen = -1;
  for (const g of segs) {
    if (g.s > i || g.e + 1 < i) continue;
    const len = g.e + 1 - g.s;
    const w = lam((i - g.s) / len);
    const [prx, prz] = project(g.line, X, Z);
    const [ux, uz] = unitTangent(g.line, ch, g.s, g.e);
    if (len > bestLen) { bestLen = len; best = [prx, prz, ux, uz]; }
    if (w > 0) { wsum += w; qx += w * prx; qz += w * prz; tx += w * ux; tz += w * uz; }
  }
  if (wsum <= 0) return best;
  const tl = Math.sqrt(tx * tx + tz * tz) || 1;
  return [qx / wsum, qz / wsum, tx / tl, tz / tl];
}

export const DEFAULT_FIT = {
  N: 8, // steps of chain each side of a pointel used for its fit
  Lc: 5, // minimum arm length (steps) of a deliberate corner
  cosCorner: 0.5, // arms must turn by ≥ 60° (cos ≤ 0.5)
  W: 10, // half-size of a pointel's label window
  arcs: 1, // fit max-margin arcs where the run is not straight
  kMax: 1, // |curvature| bound of an arc (radius ≥ 1)
  lamK: 0, // curvature penalty in the arc LP objective
  tMin: -0.05, // accept an arc whose margin is at least this
  arcAlways: 0,
  kCorner: 0, // >0: a turn explained by an arc of radius ≥ 1/kCorner is not a corner
  periods: 2, // corner arms must hold this many periods of their DSS
  center: 1, // analytic centre instead of the max-margin vertex
  tCorner: 0.0,
  arcMode: 0, // 0 = LP max-margin + analytic centre; 1 = least squares (±½ targets)
  lsRidge: 0.0, // ridge on κ for the LS arc
};

/**
 * Corner test at pointel k of chain ch: a sharp local turn between two
 * long straight arms. Returns { l1, l2 } (arm lines) or null.
 */
/** Is the arm of the chain leaving pointel k (dir +1: steps k, k+1, …;
 *  dir −1: steps k−1, k−2, …) straight and periodic: some prefix of
 *  length L ≥ Lc is a DSS holding at least `periods` periods? */
function periodicArm(ch, k, dir, opt) {
  const { Lc } = opt;
  const maxL = 3 * Lc;
  let d = null;
  for (let L = 1; L <= maxL; L++) {
    const j = dir > 0 ? k + L - 1 : k - L; // step index added
    if (j < 0 || j > ch.n - 1) return false;
    if (L === 1) { d = dir > 0 ? new DSS(ch.px[j], ch.pz[j], ch.px[j + 1], ch.pz[j + 1]) : new DSS(ch.px[j], ch.pz[j], ch.px[j + 1], ch.pz[j + 1]); }
    else if (dir > 0 ? !d.addFront(ch.px[j + 1], ch.pz[j + 1]) : !d.addBack(ch.px[j], ch.pz[j])) return false;
    if (L >= Lc && L >= opt.periods * (d.a + d.b)) return d;
  }
  return false;
}

/** End cap of a thin straight feature: the chain reverses (U-turn) through
 *  a cap of 1–2 steps between two long straight sides. True when pointel k
 *  is one of the cap's two turning pointels. */
function capAt(ch, k, opt) {
  const { Lc } = opt;
  if (k < 1 || k > ch.n - 1) return false;
  const d0 = ch.dirs[k - 1], d1 = ch.dirs[k];
  if (((d0 ^ d1) & 1) === 0) return false; // not a 90° turn
  void Lc;
  // cap starts at k: steps k .. k+c−1 run along d1, then the chain returns
  for (let c = 1; c <= 2; c++) {
    if (k + c > ch.n - 1) break;
    let same = true;
    for (let j = k; j < k + c; j++) if (ch.dirs[j] !== d1) same = false;
    if (same && ch.dirs[k + c] === ((d0 + 2) & 3) && periodicArm(ch, k, -1, opt) && periodicArm(ch, k + c, 1, opt)) return true;
  }
  // cap ends at k: steps k−c .. k−1 run along d0, preceded by the reverse of d1
  for (let c = 1; c <= 2; c++) {
    if (k - c - 1 < 0) break;
    let same = true;
    for (let j = k - c; j < k; j++) if (ch.dirs[j] !== d0) same = false;
    if (same && ch.dirs[k - c - 1] === ((d1 + 2) & 3) && periodicArm(ch, k - c, -1, opt) && periodicArm(ch, k, 1, opt)) return true;
  }
  return false;
}

export function cornerAt(ch, k, opt) {
  const { Lc, cosCorner } = opt;
  if (capAt(ch, k, opt)) return { cap: true };
  if (k - 2 < 0 || k + 1 > ch.n - 1) return null;
  // local turn: steps k−2..k+1 must not be a DSS
  {
    const d = new DSS(ch.px[k - 2], ch.pz[k - 2], ch.px[k - 1], ch.pz[k - 1]);
    let ok = true;
    for (let i = k - 1; i <= k + 1 && ok; i++) ok = d.addFront(ch.px[i + 1], ch.pz[i + 1]);
    if (ok) return null;
  }
  if (k - Lc < 0 || k + Lc - 1 > ch.n - 1) return null;
  const back = longestTo(ch, k - 1, Math.max(0, k - 2 * Lc));
  const fwd = longestFrom(ch, k, Math.min(ch.n - 1, k + 2 * Lc - 1));
  // deliberate arms: long, and at least two periods of their own pattern
  // (pure runs, clean 1:1 diagonals); a digital curve's DSS are aperiodic
  const lenB = k - back.s, lenF = fwd.e + 1 - k;
  if (lenB < Lc || lenF < Lc) return null;
  const pb = periodicArm(ch, k, -1, opt), pf = periodicArm(ch, k, 1, opt);
  if (!pb || !pf) return null;
  {
    // the turn measured on the periodic arms themselves: a digital curve
    // shows a small turn there and a large one only over longer arms
    const lb = pb.centerLine(), lf = pf.centerLine();
    const n = pb.pts.length / 2, m = pf.pts.length / 2;
    let ux = -lb.B, uz = lb.A;
    if (ux * (pb.pts[2 * n - 2] - pb.pts[0]) + uz * (pb.pts[2 * n - 1] - pb.pts[1]) < 0) { ux = -ux; uz = -uz; }
    let vx = -lf.B, vz = lf.A;
    if (vx * (pf.pts[2 * m - 2] - pf.pts[0]) + vz * (pf.pts[2 * m - 1] - pf.pts[1]) < 0) { vx = -vx; vz = -vz; }
    const cs = (ux * vx + uz * vz) / Math.sqrt((ux * ux + uz * uz) * (vx * vx + vz * vz));
    if (cs > opt.cosCorner) return null;
  }
  const l1 = back.d.centerLine(), l2 = fwd.d.centerLine();
  const t1 = unitTangent(l1, ch, back.s, k - 1), t2 = unitTangent(l2, ch, k, fwd.e);
  if (t1[0] * t2[0] + t1[1] * t2[1] > opt.cosCorner) return null;
  // a tight curve also turns abruptly at the digital level: if one arc of
  // radius ≥ 1/kCorner separates the pixels around the turn, it is a curve
  if (opt.kCorner > 0) {
    let bx = t1[0] + t2[0], bz = t1[1] + t2[1];
    const bl = Math.sqrt(bx * bx + bz * bz);
    if (bl > 1e-9) {
      bx /= bl; bz /= bl;
      const { inP, outP } = sidePixels(ch, k - Lc, k + Lc - 1);
      const r = arcLP(inP, outP, ch.px[k], ch.pz[k], -bz, bx, bx, bz, { K: opt.kCorner });
      if (r && r.t > opt.tCorner) return null;
    }
  }
  return { l1, l2, t1, t2 };
}

/** Least-squares (Kåsa) circle through the linel midpoints of steps
 *  [lo, hi], in coordinates relative to (ox, oz). Returns
 *  { cx, cz, r, rms } or null. */
export function kasaCircle(ch, lo, hi, ox, oz) {
  let n = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, sxw = 0, szw = 0, sw = 0;
  for (let j = lo; j <= hi; j++) {
    const x = (ch.px[j] + ch.px[j + 1]) / 2 - ox, z = (ch.pz[j] + ch.pz[j + 1]) / 2 - oz;
    const w = x * x + z * z;
    n++; sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; sxw += x * w; szw += z * w; sw += w;
  }
  if (n < 5) return null;
  // minimise Σ (w + D x + E z + F)²: [sxx sxz sx; sxz szz sz; sx sz n] [D E F] = −[sxw szw sw]
  const m = [sxx, sxz, sx, sxz, szz, sz, sx, sz, n];
  const rhs = [-sxw, -szw, -sw];
  const det3 = (a) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const det = det3(m);
  if (Math.abs(det) < 1e-9) return null;
  const col = (k) => { const a = m.slice(); a[k] = rhs[0]; a[3 + k] = rhs[1]; a[6 + k] = rhs[2]; return det3(a) / det; };
  const D = col(0), E = col(1), F = col(2);
  const cx = -D / 2, cz = -E / 2;
  const r2 = cx * cx + cz * cz - F;
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  let e2 = 0;
  for (let j = lo; j <= hi; j++) {
    const x = (ch.px[j] + ch.px[j + 1]) / 2 - ox - cx, z = (ch.pz[j] + ch.pz[j + 1]) / 2 - oz - cz;
    const e = Math.sqrt(x * x + z * z) - r;
    e2 += e * e;
  }
  return { cx: cx + ox, cz: cz + oz, r, rms: Math.sqrt(e2 / n) };
}

/** Pixel centres on each side of steps [lo, hi]: A side (left) and B side
 *  (right), deduplicated, in chain order. */
export function sidePixels(ch, lo, hi) {
  const inP = [], outP = [];
  const seenI = new Set(), seenO = new Set();
  const LPX = [0, 0, -1, -1], LPZ = [-1, 0, 0, -1], RPX = [0, -1, -1, 0], RPZ = [0, 0, -1, -1];
  for (let j = lo; j <= hi; j++) {
    const X = ch.px[j], Z = ch.pz[j], d = ch.dirs[j];
    const lx = X + LPX[d], lz = Z + LPZ[d], rx = X + RPX[d], rz = Z + RPZ[d];
    const kl = lx * 65536 + lz, kr = rx * 65536 + rz;
    if (!seenI.has(kl)) { seenI.add(kl); inP.push(lx + 0.5, lz + 0.5); }
    if (!seenO.has(kr)) { seenO.add(kr); outP.push(rx + 0.5, rz + 0.5); }
  }
  return { inP, outP };
}

/** A fitted primitive: g(p) = κ/2·|p − o|² + w·(p − o) + c, positive on the
 *  B side (right of the chain). */
export function curveFromLine(line, tx, tz) {
  // line A x + B z = C; orient its normal to the right of (tx, tz)
  let { A, B, C } = line;
  const rx = -tz, rz = tx;
  if (A * rx + B * rz < 0) { A = -A; B = -B; C = -C; }
  const l = Math.sqrt(A * A + B * B);
  return { ox: 0, oz: 0, wx: A / l, wz: B / l, k: 0, c: -C / l };
}

export function curveSd(cv, x, z) {
  const px = x - cv.ox, pz = z - cv.oz;
  if (cv.k > -1e-6 && cv.k < 1e-6) {
    const wl = Math.sqrt(cv.wx * cv.wx + cv.wz * cv.wz);
    return (cv.k / 2 * (px * px + pz * pz) + cv.wx * px + cv.wz * pz + cv.c) / wl;
  }
  const cx = -cv.wx / cv.k, cz = -cv.wz / cv.k;
  const R2 = (cv.wx * cv.wx + cv.wz * cv.wz) / (cv.k * cv.k) - (2 * cv.c) / cv.k;
  if (!(R2 > 0)) return 0;
  const dx = px - cx, dz = pz - cz;
  const d = Math.sqrt(dx * dx + dz * dz) - Math.sqrt(R2);
  return cv.k > 0 ? d : -d;
}

/** Closest point and unit tangent (oriented with the chain, B on the right)
 *  of the curve to (x, z). */
export function curveFoot(cv, x, z) {
  const px = x - cv.ox, pz = z - cv.oz;
  // gradient of g at p
  let gx = cv.k * px + cv.wx, gz = cv.k * pz + cv.wz;
  if (cv.k > -1e-6 && cv.k < 1e-6) {
    const sd = curveSd(cv, x, z);
    const wl = Math.sqrt(cv.wx * cv.wx + cv.wz * cv.wz);
    const nx = cv.wx / wl, nz = cv.wz / wl;
    return { x: x - sd * nx, z: z - sd * nz, tx: nz, tz: -nx };
  }
  const cx = -cv.wx / cv.k, cz = -cv.wz / cv.k;
  const R = Math.sqrt((cv.wx * cv.wx + cv.wz * cv.wz) / (cv.k * cv.k) - (2 * cv.c) / cv.k);
  const dx = px - cx, dz = pz - cz;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const fx = cx + (dx * R) / d, fz = cz + (dz * R) / d;
  gx = cv.k * fx + cv.wx; gz = cv.k * fz + cv.wz;
  const gl = Math.sqrt(gx * gx + gz * gz) || 1;
  // normal (gx, gz)/gl points to B; tangent = left-rotation of the normal
  return { x: fx + cv.ox, z: fz + cv.oz, tx: gz / gl, tz: -gx / gl };
}

/** Least-squares arc: g(p) = κ/2|p|² + (n0 + u t0)·p + c fitted to −½ on the
 *  A-side pixel centres and +½ on the B-side ones (frame (ox, oz, t0)); the
 *  margin t = min_i s_i g(p_i) is reported like the LP's. */
export function fitArcLS(inP, outP, ox, oz, tx, tz, opt) {
  const n0x = -tz, n0z = tx;
  let shh = 0, sht = 0, sh = 0, stt = 0, st = 0, n = 0, rh = 0, rt = 0, r1 = 0;
  for (let pass = 0; pass < 2; pass++) {
    const P = pass === 0 ? inP : outP, y = pass === 0 ? -0.5 : 0.5;
    for (let i = 0; i < P.length; i += 2) {
      const x = P[i] - ox, z = P[i + 1] - oz;
      const h = (x * x + z * z) / 2, tp = tx * x + tz * z, np = n0x * x + n0z * z;
      const r = y - np;
      shh += h * h; sht += h * tp; sh += h; stt += tp * tp; st += tp; n++;
      rh += h * r; rt += tp * r; r1 += r;
    }
  }
  shh += opt.lsRidge ?? 0;
  // solve [shh sht sh; sht stt st; sh st n] [k u c] = [rh rt r1]
  const a = shh, b = sht, c0 = sh, d = stt, e = st, f = n;
  const det = a * (d * f - e * e) - b * (b * f - e * c0) + c0 * (b * e - d * c0);
  if (!(det > 1e-12 || det < -1e-12)) return null;
  const k = (rh * (d * f - e * e) - b * (rt * f - e * r1) + c0 * (rt * e - d * r1)) / det;
  const u = (a * (rt * f - e * r1) - rh * (b * f - e * c0) + c0 * (b * r1 - rt * c0)) / det;
  const c = (a * (d * r1 - e * rt) - b * (b * r1 - e * rh) + rh * (b * e - d * c0)) / det;
  let K = opt.kMax;
  const kk = k > K ? K : k < -K ? -K : k;
  let t = Infinity;
  for (let pass = 0; pass < 2; pass++) {
    const P = pass === 0 ? inP : outP, sg = pass === 0 ? -1 : 1;
    for (let i = 0; i < P.length; i += 2) {
      const x = P[i] - ox, z = P[i + 1] - oz;
      const g = kk * (x * x + z * z) / 2 + (n0x + u * tx) * x + (n0z + u * tz) * z + c;
      const m = sg * g;
      if (m < t) t = m;
    }
  }
  return { ox, oz, wx: n0x + u * tx, wz: n0z + u * tz, k: kk, c, t };
}

/** Max-margin arc over steps [lo, hi] in the frame of (ox, oz, t0). */
export function fitArc(ch, lo, hi, ox, oz, tx, tz, opt) {
  const { inP, outP } = sidePixels(ch, lo, hi);
  if (opt.arcMode === 1) return fitArcLS(inP, outP, ox, oz, tx, tz, opt);
  const r = arcLP(inP, outP, ox, oz, -tz, tx, tx, tz, { K: opt.kMax, lamK: opt.lamK });
  if (!r) return null;
  let k = r.kappa, u = r.u, c = r.c;
  if (opt.center) {
    // analytic centre of the consistent arcs (or of the least-violating
    // relaxation when none is consistent)
    const m0 = r.t > 0 ? 0 : r.t - 0.05;
    [k, u, c] = arcCenter(inP, outP, ox, oz, -tz, tx, tx, tz, [k, u, c], m0, opt.kMax * 0.999);
  }
  // w = n0 + u·t0 with n0 = (−tz, tx)
  return { ox, oz, wx: -tz + u * tx, wz: tx + u * tz, k, c, t: r.t };
}

/**
 * Canonical fit of pointel i of a chain traced in the pointel's own
 * window. Returns { x, z, tx, tz, kind, curve, curve2 }: the fitted
 * boundary point nearest the pointel, the tangent there, and the fitted
 * primitive(s) (two arm lines for a corner).
 */
export function fitPointel(ch, i, opt) {
  const { N, Lc } = opt;
  const isC = new Uint8Array(ch.n + 1);
  for (let k = Math.max(1, i - N); k <= Math.min(ch.n - 1, i + N); k++) if (cornerAt(ch, k, opt)) isC[k] = 1;
  let prev = -1, next = -1;
  for (let k = i - 1; k >= Math.max(0, i - N); k--) if (isC[k]) { prev = k; break; }
  for (let k = i + 1; k <= Math.min(ch.n, i + N); k++) if (isC[k]) { next = k; break; }
  if (isC[i]) {
    const s1 = prev >= 0 ? prev : Math.max(0, i - 2 * Lc);
    const e2 = next >= 0 ? next - 1 : Math.min(ch.n - 1, i + 2 * Lc - 1);
    const b = longestTo(ch, i - 1, s1), f = longestFrom(ch, i, e2);
    const l1 = b.d.centerLine(), l2 = f.d.centerLine();
    const det = l1.A * l2.B - l1.B * l2.A;
    if (det !== 0) {
      const x = (l1.C * l2.B - l1.B * l2.C) / det;
      const z = (l1.A * l2.C - l1.C * l2.A) / det;
      const t1 = unitTangent(l1, ch, b.s, i - 1), t2 = unitTangent(l2, ch, i, f.e);
      const tx = t1[0] + t2[0], tz = t1[1] + t2[1];
      const tl = Math.sqrt(tx * tx + tz * tz) || 1;
      return { x, z, tx: tx / tl, tz: tz / tl, kind: 'corner', curve: curveFromLine(l1, t1[0], t1[1]), curve2: curveFromLine(l2, t2[0], t2[1]), t1, t2 };
    }
  }
  const lo = prev >= 0 ? prev : Math.max(0, i - N);
  const hi = next >= 0 ? next - 1 : Math.min(ch.n - 1, i + N - 1);
  if (lo > hi) return null;
  const whole = longestFrom(ch, lo, hi);
  if (whole.e === hi) {
    const line = whole.d.centerLine();
    const [tx, tz] = unitTangent(line, ch, lo, hi);
    const curve = curveFromLine(line, tx, tz);
    const f = curveFoot(curve, ch.px[i], ch.pz[i]);
    return { ...f, kind: 'line', curve };
  }
  const segs = tangentialCover(ch, lo, hi);
  const r = lambdaMST(ch, segs, i);
  if (!r) return null;
  if (opt.arcs) {
    const cv = fitArc(ch, lo, hi, ch.px[i], ch.pz[i], r[2], r[3], opt);
    if (cv && (cv.t > opt.tMin || opt.arcAlways)) {
      const f = curveFoot(cv, ch.px[i], ch.pz[i]);
      return { ...f, kind: 'arc', curve: cv };
    }
  }
  // λ-MST tangent line through the λ-MST point
  const curve = { ox: r[0], oz: r[1], wx: -r[3], wz: r[2], k: 0, c: 0 };
  return { x: r[0], z: r[1], tx: r[2], tz: r[3], kind: 'mst', curve };
}
