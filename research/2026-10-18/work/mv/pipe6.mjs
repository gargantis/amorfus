// v2 of the mesh-side pipeline: same semantics as pipeline.mjs (v1), but
// every label map's boundary chains are extracted ONCE (global linking with
// the saddle rule on the full map) and each pointel's fit window is an index
// range on its chain, clipped by the pointel's box, instead of a fresh trace.
// Per-corner pieces come from a linel → (chain, index) table instead of
// re-tracing. Fits are computed in coordinates relative to the pointel, so
// every stored value is a function of world-anchored inputs only.
import { fitPointel, DX, DZ } from './fit2d-fast.mjs';

const LPX = [0, 0, -1, -1], LPZ = [-1, 0, 0, -1], RPX = [0, -1, -1, 0], RPZ = [0, 0, -1, -1];

/** Surface tops of every column of the region (solid with air above). */
export function columnTops(region) {
  const { nx, ny, nz, blocks } = region;
  const MAXT = 6;
  const cnt = new Uint8Array(nx * nz);
  const ty = new Int16Array(nx * nz * MAXT);
  const tm = new Uint8Array(nx * nz * MAXT);
  const S = nx * nz;
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const col = z * nx + x;
    let c = 0;
    let i = (ny - 2) * S + col;
    for (let y = ny - 2; y >= 0 && c < MAXT; y--, i -= S) {
      if ((blocks[i] & 0xff) !== 0 && (blocks[i + S] & 0xff) === 0) {
        ty[col * MAXT + c] = y; tm[col * MAXT + c] = blocks[i] & 0xff; c++;
      }
    }
    cnt[col] = c;
  }
  return { cnt, ty, tm, MAXT };
}

/** Label map at level Y: per column the material of the top nearest Y
 *  (within Hmax; ties keep the upper top), −1 otherwise. */
function buildMap(region, tops, Y, Hmax) {
  const { nx, nz } = region;
  const m = new Int8Array(nx * nz).fill(-1);
  const hh = new Int16Array(nx * nz);
  const { cnt, ty, tm, MAXT } = tops;
  for (let col = 0; col < nx * nz; col++) {
    let best = -1, bd = Hmax + 1, bh = 0;
    for (let k = 0; k < cnt[col]; k++) {
      const d = Math.abs(ty[col * MAXT + k] + 1 - Y);
      if (d < bd) { bd = d; best = tm[col * MAXT + k]; bh = ty[col * MAXT + k]; }
    }
    m[col] = best; hh[col] = bh;
  }
  return [m, hh];
}

/** A label map with its boundary chains. */
class MapChains {
  constructor([m, hh], nx, nz, maxStep) {
    this.m = m; this.hh = hh; this.nx = nx; this.nz = nz; this.maxStep = maxStep;
    this.PX = nx + 1; // pointels per row
    this.NL = (nx + 1) * (nz + 1) * 4;
    this.lChain = null; this.lIdx = null; this.fitAt = null; this.stamp = null;
    this.chains = [];
    this.built = false;
  }
  ensure() {
    if (!this.built) {
      this.built = true;
      const NL = this.NL;
      this.lChain = new Int32Array(NL).fill(-1);
      this.lIdx = new Int32Array(NL);
      this.fitAt = new Array(NL); // fits by linel id (undefined = not computed)
      this.stamp = this.sharedStamp ?? new Int32Array(NL); // 'covered' marks, per corner call
      this.build();
    }
    return this;
  }
  /** Checker-like pointels: a two-label saddle with ≥ 3 saddles among its 8
   *  neighbours (a 2-D cluster, not the 1-D run of a diagonal line). */
  checkerMask() {
    if (this.chk) return this.chk;
    const { nx, nz } = this;
    const PX = nx + 1;
    const sad = new Uint8Array(PX * (nz + 1));
    for (let z = 1; z < nz; z++) for (let x = 1; x < nx; x++) {
      const a = this.at(x - 1, z - 1), b = this.at(x, z - 1), c = this.at(x - 1, z), d = this.at(x, z);
      if (a >= 0 && b >= 0 && a === d && b === c && a !== b) sad[z * PX + x] = 1;
    }
    const chk = new Uint8Array(PX * (nz + 1));
    for (let z = 1; z < nz; z++) for (let x = 1; x < nx; x++) {
      if (!sad[z * PX + x]) continue;
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && sad[(z + dz) * PX + x + dx]) n++;
      if (n >= 3) chk[z * PX + x] = 1;
    }
    // summed-area table for box queries
    const P = new Int32Array((PX + 1) * (nz + 2));
    for (let z = 0; z <= nz; z++) { let row = 0; for (let x = 0; x <= nx; x++) { row += chk[z * PX + x]; P[(z + 1) * (PX + 1) + x + 1] = P[z * (PX + 1) + x + 1] + row; } }
    this.chk = P;
    return P;
  }
  /** Any checker-like pointel in [x0, x1] × [z0, z1] (inclusive)? */
  hasChecker(x0, z0, x1, z1) {
    const P = this.checkerMask(), W1 = this.nx + 2;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(this.nx, x1); z1 = Math.min(this.nz, z1);
    if (x1 < x0 || z1 < z0) return false;
    return P[(z1 + 1) * W1 + x1 + 1] - P[z0 * W1 + x1 + 1] - P[(z1 + 1) * W1 + x0] + P[z0 * W1 + x0] > 0;
  }
  at(x, z) { return x < 0 || z < 0 || x >= this.nx || z >= this.nz ? -1 : this.m[z * this.nx + x]; }
  lid(x, z, d) { return ((z * this.PX) + x) * 4 + d; }
  /** Labels (left, right) of linel (x, z, d). */
  isAB(x, z, d, A, B) {
    const lx = x + LPX[d], lz = z + LPZ[d], rx = x + RPX[d], rz = z + RPZ[d];
    if (this.at(lx, lz) !== A || this.at(rx, rz) !== B) return false;
    const dh = this.hh[lz * this.nx + lx] - this.hh[rz * this.nx + rx];
    return dh <= this.maxStep && dh >= -this.maxStep;
  }
  /** Is linel (x, z, d) a material boundary (labels differ, both known, step within maxStep)? */
  isBoundary(x, z, d) {
    const lx = x + LPX[d], lz = z + LPZ[d], rx = x + RPX[d], rz = z + RPZ[d];
    const l = this.at(lx, lz), r = this.at(rx, rz);
    if (l < 0 || r < 0 || l === r) return false;
    const dh = this.hh[lz * this.nx + lx] - this.hh[rz * this.nx + rx];
    return dh <= this.maxStep && dh >= -this.maxStep;
  }
  saddleConnects(X, Z, u, v) {
    let cu = 0, cv = 0;
    for (let z = Z - 2; z < Z + 2; z++) for (let x = X - 2; x < X + 2; x++) {
      const m = this.at(x, z);
      if (m === u) cu++; else if (m === v) cv++;
    }
    if (cu !== cv) return cu < cv;
    return u < v;
  }
  aConnects(X, Z, A, o1, o2) {
    if (o1 !== o2 || o1 < 0) return true;
    return this.saddleConnects(X, Z, A, o1);
  }
  nextDir(x, z, dir, A) {
    const al = this.at(x + LPX[dir], z + LPZ[dir]);
    const ar = this.at(x + RPX[dir], z + RPZ[dir]);
    if (al === A) return ar === A ? (dir + 1) & 3 : dir;
    if (ar === A) {
      const sx = x - DX[dir], sz = z - DZ[dir];
      const br = this.at(sx + RPX[dir], sz + RPZ[dir]);
      return this.aConnects(x, z, A, al, br) ? (dir + 1) & 3 : (dir + 3) & 3;
    }
    return (dir + 3) & 3;
  }
  prevDir(x, z, dir, A) {
    const rd = (dir + 2) & 3;
    const al = this.at(x + LPX[rd], z + LPZ[rd]);
    const ar = this.at(x + RPX[rd], z + RPZ[rd]);
    let nrd;
    if (ar === A) nrd = al === A ? (rd + 3) & 3 : rd;
    else if (al === A) {
      const sx = x - DX[rd], sz = z - DZ[rd];
      const bl = this.at(sx + LPX[rd], sz + LPZ[rd]);
      nrd = this.aConnects(x, z, A, ar, bl) ? (rd + 3) & 3 : (rd + 1) & 3;
    } else nrd = (rd + 1) & 3;
    return (nrd + 2) & 3;
  }
  build() {
    const { nx, nz, m } = this;
    // every boundary linel, canonically oriented (lower id on the left)
    const starts = [];
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const w = m[z * nx + x];
      if (w < 0) continue;
      const hw = this.hh[z * nx + x], ms = this.maxStep;
      if (z > 0) {
        const u = m[(z - 1) * nx + x], dh = this.hh[(z - 1) * nx + x] - hw;
        if (u >= 0 && u !== w && dh <= ms && dh >= -ms) starts.push(u < w ? this.lid(x, z, 0) : this.lid(x + 1, z, 2));
      }
      if (x > 0) {
        const u = m[z * nx + x - 1], dh = this.hh[z * nx + x - 1] - hw; // west
        if (u >= 0 && u !== w && dh <= ms && dh >= -ms) starts.push(w < u ? this.lid(x, z, 1) : this.lid(x, z + 1, 3));
      }
    }
    const PX = this.PX;
    const dec = (id) => { const d = id & 3, p = id >> 2; return [p % PX, (p - (p % PX)) / PX, d]; };
    for (const id0 of starts) {
      if (this.lChain[id0] >= 0) continue;
      let [x, z, d] = dec(id0);
      const A = this.at(x + LPX[d], z + LPZ[d]), B = this.at(x + RPX[d], z + RPZ[d]);
      // walk back to the chain's first linel (or detect a loop)
      let sx = x, sz = z, sd = d, closed = false, guard = 0;
      for (;;) {
        const pd = this.prevDir(sx, sz, sd, A);
        const px = sx - DX[pd], pz = sz - DZ[pd];
        if (!this.isAB(px, pz, pd, A, B)) break;
        sx = px; sz = pz; sd = pd;
        if (sx === x && sz === z && sd === d) { closed = true; break; }
        if (++guard > 1e6) throw new Error('chain walk runaway');
      }
      // walk forward collecting linels
      const ps = [], ds = [];
      let cx = sx, cz = sz, cd = sd;
      for (;;) {
        ps.push(cx, cz); ds.push(cd);
        const nx2 = cx + DX[cd], nz2 = cz + DZ[cd];
        const nd = this.nextDir(nx2, nz2, cd, A);
        if (!this.isAB(nx2, nz2, nd, A, B)) { ps.push(nx2, nz2); break; }
        if (closed && nx2 === sx && nz2 === sz && nd === sd) break;
        cx = nx2; cz = nz2; cd = nd;
        if (ds.length > 1e6) throw new Error('chain walk runaway');
      }
      const ci = this.chains.length;
      const n = ds.length;
      const ch = { A, B, closed, n, px: Int32Array.from(ps.filter((_, k) => k % 2 === 0)), pz: Int32Array.from(ps.filter((_, k) => k % 2 === 1)), dirs: Uint8Array.from(ds) };
      if (closed) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (let k = 0; k < n; k++) {
          const lx = ch.px[k] + LPX[ch.dirs[k]], lz = ch.pz[k] + LPZ[ch.dirs[k]], rx = ch.px[k] + RPX[ch.dirs[k]], rz = ch.pz[k] + RPZ[ch.dirs[k]];
          x0 = Math.min(x0, lx, rx); x1 = Math.max(x1, lx, rx); z0 = Math.min(z0, lz, rz); z1 = Math.max(z1, lz, rz);
        }
        ch.bbox = [x0, z0, x1, z1];
      }
      this.chains.push(ch);
      for (let k = 0; k < n; k++) {
        const id = this.lid(ch.px[k], ch.pz[k], ch.dirs[k]);
        this.lChain[id] = ci; this.lIdx[id] = k;
      }
    }
  }
  /** Step k of chain c (modular for loops): [x, z, d] or null. */
}

/** Pointel / direction of step j of a chain (loops wrap). */
function stepOf(ch, j) {
  if (ch.closed) { const L = ch.n; j = ((j % L) + L) % L; }
  return j;
}

const STAR = 4095; // map key of the topmost map M*

export function buildContext(region, opt) {
  const tops = columnTops(region);
  const { nx, nz } = region;
  // M*: every column's topmost top (no Hmax). A box whose labels (with a
  // 2-pixel margin for saddle decisions) agree between M_Y and M* has the
  // same chains and fits in both, so those fits are shared across levels.
  const mStar = new Int8Array(nx * nz).fill(-1);
  const hStar = new Int16Array(nx * nz);
  for (let col = 0; col < nx * nz; col++) if (tops.cnt[col] > 0) { mStar[col] = tops.tm[col * tops.MAXT]; hStar[col] = tops.ty[col * tops.MAXT]; }
  const star = new MapChains([mStar, hStar], nx, nz, opt.maxStep);
  star.key = STAR;
  const maps = new Map();
  // only columns with more than one top can differ between M_Y and M*
  const multi = [];
  for (let col = 0; col < nx * nz; col++) if (tops.cnt[col] > 1) multi.push(col);
  const stamp = new Int32Array((nx + 1) * (nz + 1) * 4);
  star.sharedStamp = stamp;
  const mcAt = (Y) => {
    let mc = maps.get(Y);
    if (!mc) {
      // M_Y = M* except where a lower top is nearer to Y (Hmax is not used
      // with the step rule: maps differ only at multi-top columns)
      const { ty, tm, MAXT } = tops;
      let diffCols = null;
      for (const col of multi) {
        let best = -1, bd = opt.Hmax + 1, bh = 0;
        for (let k = 0; k < tops.cnt[col]; k++) {
          const d = Math.abs(ty[col * MAXT + k] + 1 - Y);
          if (d < bd) { bd = d; best = tm[col * MAXT + k]; bh = ty[col * MAXT + k]; }
        }
        if (best !== mStar[col] || bh !== hStar[col]) (diffCols ??= []).push(col, best, bh);
      }
      if (!diffCols && opt.Hmax >= 64) { mc = star; maps.set(Y, mc); return mc; }
      const m2 = Int8Array.from(mStar), h2 = Int16Array.from(hStar);
      if (diffCols) for (let i = 0; i < diffCols.length; i += 3) { m2[diffCols[i]] = diffCols[i + 1]; h2[diffCols[i]] = diffCols[i + 2]; }
      mc = new MapChains([m2, h2], nx, nz, opt.maxStep);
      mc.key = Y;
      mc.sharedStamp = stamp;
      const P = new Int32Array((nx + 1) * (nz + 1));
      const D = new Uint8Array(nx * nz);
      if (diffCols) for (let i = 0; i < diffCols.length; i += 3) D[diffCols[i]] = 1;
      for (let z = 0; z < nz; z++) {
        let row = 0;
        for (let x = 0; x < nx; x++) {
          row += D[z * nx + x];
          P[(z + 1) * (nx + 1) + x + 1] = P[z * (nx + 1) + x + 1] + row;
        }
      }
      mc.diff = P;
      maps.set(Y, mc);
    }
    return mc;
  };
  /** The map to use for a box [x0, x1) × [z0, z1) at level Y. */
  const mapFor = (Y, x0, z0, x1, z1) => {
    const mc = mcAt(Y);
    if (mc === star) return star;
    const cx0 = Math.max(0, x0), cz0 = Math.max(0, z0), cx1 = Math.min(nx, x1), cz1 = Math.min(nz, z1);
    if (cx1 <= cx0 || cz1 <= cz0) return star;
    const P = mc.diff, W1 = nx + 1;
    const d = P[cz1 * W1 + cx1] - P[cz0 * W1 + cx1] - P[cz1 * W1 + cx0] + P[cz0 * W1 + cx0];
    return d === 0 ? star : mc;
  };
  return { region, opt, mcAt, mapFor, star, stampN: 0, fitCache: new Map(), stats: { fits: 0, corners: 0, pieces: 0, dirtyFits: 0 } };
}

const inBox = (x, z, d, bx0, bz0, bx1, bz1) => {
  const lx = x + LPX[d], lz = z + LPZ[d], rx = x + RPX[d], rz = z + RPZ[d];
  return lx >= bx0 && lx < bx1 && lz >= bz0 && lz < bz1 && rx >= bx0 && rx < bx1 && rz >= bz0 && rz < bz1;
};

/** The chain as tracePiece would see it from step k inside the box
 *  [bx0, bx1) × [bz0, bz1), at most maxSteps each way: a view
 *  { px, pz, dirs, n, start, closed, loopLen }. */
function windowView(ch, k, bx0, bz0, bx1, bz1, maxSteps) {
  const L = ch.n;
  if (ch.closed && L <= maxSteps && ch.bbox[0] >= bx0 && ch.bbox[2] < bx1 && ch.bbox[1] >= bz0 && ch.bbox[3] < bz1) {
    // closed in the window: unroll ×3 starting at k
    const n = 3 * L;
    const px = new Int32Array(n + 1), pz = new Int32Array(n + 1), dirs = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const j = (k + i) % L; px[i] = ch.px[j]; pz[i] = ch.pz[j]; dirs[i] = ch.dirs[j]; }
    px[n] = ch.px[k]; pz[n] = ch.pz[k];
    return { px, pz, dirs, n, start: L, closed: true, loopLen: L };
  }
  // forward: steps k, k+1, … while inside (step k itself is inside by construction)
  let f = 1;
  if (ch.closed) {
    while (f < maxSteps) { const j = (k + f) % L; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; }
  } else {
    while (f < maxSteps && k + f < L) { const j = k + f; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; }
  }
  let b = 0;
  if (ch.closed) {
    while (b < maxSteps) { const j = (((k - b - 1) % L) + L) % L; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; }
  } else {
    while (b < maxSteps && k - b - 1 >= 0) { const j = k - b - 1; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; }
  }
  const n = b + f;
  const px = new Int32Array(n + 1), pz = new Int32Array(n + 1), dirs = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let j = k - b + i;
    if (ch.closed) j = ((j % L) + L) % L;
    px[i] = ch.px[j]; pz[i] = ch.pz[j]; dirs[i] = ch.dirs[j];
  }
  // end pointel
  {
    const i = n - 1;
    px[n] = px[i] + DX[dirs[i]]; pz[n] = pz[i] + DZ[dirs[i]];
  }
  return { px, pz, dirs, n, start: b, closed: false, loopLen: 0 };
}

/** Canonical fit of the pointel at the start of linel (X, Z, d), in the box
 *  of half-size W around the pointel, relative to the pointel. */
function pointelFit(ctx, Y, mc0, ci0, k0) {
  const ch0 = mc0.chains[ci0];
  const X = ch0.px[k0], Z = ch0.pz[k0], d = ch0.dirs[k0];
  const { W, N, Lc } = ctx.opt;
  const mc = ctx.mapFor(Y, X - W - 2, Z - W - 2, X + W + 2, Z + W + 2).ensure();
  const lid = mc.lid(X, Z, d);
  let f = mc.fitAt[lid];
  if (f !== undefined) return f;
  const ci = mc.lChain[lid], k = mc.lIdx[lid];
  if (mc !== ctx.star) ctx.stats.dirtyFits++;
  if (ctx.log) ctx.log.push([mc, ci, k]);
  const ch = mc.chains[ci];
  const v = windowView(ch, k, X - W, Z - W, X + W, Z + W, N + Lc + 4);
  // relative coordinates: subtract the pointel (exact integer arithmetic)
  for (let i = 0; i <= v.n; i++) { v.px[i] -= X; v.pz[i] -= Z; }
  const r = fitPointel(v, v.start, ctx.opt) ?? null;
  f = r ? relFit(r, X, Z) : null;
  mc.fitAt[lid] = f;
  ctx.stats.fits++;
  return f;
}

/** Pointel-relative fit → { X0, Z0, rx, rz, tx, tz, kind, curve, curve2, t1, t2 }. Curves stay
 *  relative to (X0, Z0): evaluating at (x, z) uses (x − X0, z − Z0). */
function relFit(r, X0, Z0) {
  return { X0, Z0, rx: r.x, rz: r.z, tx: r.tx, tz: r.tz, kind: r.kind, curve: r.curve, curve2: r.curve2, t1: r.t1, t2: r.t2, t: r.t ?? 0 };
}

import { curveSd } from './fit2d-fast.mjs';

/** A piece: chain points (fitted) of one A|B pass near a corner; all
 *  coordinates relative to the corner. Flat arrays, no closures. */
class Piece {
  constructor(A, B) { this.A = A; this.B = B; this.n = 0; this.x = []; this.z = []; this.dx0 = []; this.dz0 = []; this.cv = []; this.tx = []; this.tz = []; this.conf = true; this.lx = []; this.lz = []; this.rx = []; this.rz = []; this.dh = []; }
  /** Record the linel (pointel px, pz, direction d; region coords) of the last point. */
  linel(px, pz, d, mc) {
    const lx = px + LPX[d], lz = pz + LPZ[d], rx = px + RPX[d], rz = pz + RPZ[d];
    this.lx.push(lx); this.lz.push(lz); this.rx.push(rx); this.rz.push(rz);
    // step across the linel: > 0 when the A (left) column is higher
    this.dh.push(mc ? mc.hh[lz * mc.nx + lx] - mc.hh[rz * mc.nx + rx] : 0);
  }
  push(f, curve, tx, tz, cx, cz) {
    const dx0 = f.X0 - cx, dz0 = f.Z0 - cz;
    // a deliberate shape: a straight run, a corner or cap, or a consistent arc
    if (!(f.kind === 'line' || f.kind === 'corner' || (f.kind === 'arc' && f.t >= CONF_T))) this.conf = false;
    this.x.push(dx0 + f.rx); this.z.push(dz0 + f.rz); this.dx0.push(dx0); this.dz0.push(dz0); this.cv.push(curve); this.tx.push(tx); this.tz.push(tz);
    this.n++;
  }
  support(x, z) {
    let best = Infinity;
    const X = this.x, Z = this.z, n = this.n;
    for (let i = 0; i < n; i++) {
      const ax = X[i], az = Z[i];
      if (i + 1 < n) {
        const ux = X[i + 1] - ax, uz = Z[i + 1] - az, uu = ux * ux + uz * uz;
        let t = uu > 0 ? ((x - ax) * ux + (z - az) * uz) / uu : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - ax - t * ux, dz = z - az - t * uz, d = dx * dx + dz * dz;
        if (d < best) best = d;
      } else {
        const dx = x - ax, dz = z - az, d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
    }
    return Math.sqrt(best);
  }
  /** Blended signed distance at (x, z) (> 0 on the B side); the blended
   *  normal goes to EV_N. */
  evalS(x, z, h, wantN, farS = null, w0 = 0) {
    const X = this.x, Z = this.z, n = this.n;
    let s = 0, sum = 0, nx = 0, nz = 0, sdh = 0;
    const h2 = h * h;
    for (let i = 0; i < n; i++) {
      const dx = x - X[i], dz = z - Z[i];
      const d2 = dx * dx + dz * dz;
      if (d2 >= h2) continue;
      // bump (1 − t²)² with t² = d²/h²: no square root needed
      const u = 1 - d2 / h2, w = u * u;
      sum += w;
      s += w * curveSd(this.cv[i], x - this.dx0[i], z - this.dz0[i]);
      sdh += w * (this.dh[i] ?? 0);
      if (wantN) { nx += w * -this.tz[i]; nz += w * this.tx[i]; }
    }
    if (STEP_SHIFT !== 0 && sum > 0) {
      // riser faces belong to the upper block: where the boundary runs along
      // a step (mean step ≈ ±1) it moves to the step's foot; where it
      // crosses steps (mean ≈ 0) it stays put
      const mdh = sdh / sum;
      s -= STEP_SHIFT * mdh * (mdh < 0 ? -mdh : mdh) * sum;
    }
    if (farS !== null) {
      // far from every fitted point the piece says nothing: blend toward
      // the caller's default (its own side, far) instead of extrapolating
      // the nearest point's curve beyond the piece's end
      s = (s + w0 * farS) / (sum + w0);
      if (sum > 0) { if (wantN) { const nl = Math.sqrt(nx * nx + nz * nz) || 1; EV_N[0] = nx / nl; EV_N[1] = nz / nl; } return s; }
      let best = Infinity, bi = 0;
      for (let i = 0; i < n; i++) { const dx = x - X[i], dz = z - Z[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
      if (wantN) { EV_N[0] = -this.tz[bi]; EV_N[1] = this.tx[bi]; }
      return s;
    }
    if (sum > 0) s /= sum;
    else {
      let best = Infinity, bi = 0;
      for (let i = 0; i < n; i++) { const dx = x - X[i], dz = z - Z[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
      s = curveSd(this.cv[bi], x - this.dx0[bi], z - this.dz0[bi]);
      if (wantN) { nx = -this.tz[bi]; nz = this.tx[bi]; }
    }
    if (wantN) { const nl = Math.sqrt(nx * nx + nz * nz) || 1; EV_N[0] = nx / nl; EV_N[1] = nz / nl; }
    return s;
  }
}
const EV_N = [0, 0];
let CONF_T = 0;
let STEP_SHIFT = 0;

/**
 * Pieces near corner (X, Y, Z) (region lattice coords) for a vertex at plan
 * offset (ox, oz) from the corner (see v1 cornerPieces for the rules).
 */
export function cornerPieces(ctx, X, Y, Z, ox, oz) {
  const opt = ctx.opt;
  CONF_T = opt.confT ?? 0;
  STEP_SHIFT = opt.stepShift ?? 0;
  const W0 = opt.W + 2;
  const mc = ctx.mapFor(Y, X - W0, Z - W0, X + W0, Z + W0);
  const R = opt.near;
  let first = -2, mixed = false;
  for (let z = Z - R; z < Z + R && !mixed; z++) for (let x = X - R; x < X + R; x++) {
    const m = mc.at(x, z);
    if (m < 0) continue;
    if (first === -2) first = m; else if (m !== first) { mixed = true; break; }
  }
  if (!mixed) return NONE;
  // deliberate pixel patterns (checkerboards) keep their blocks
  if (opt.checker && mc.hasChecker(X - opt.checker, Z - opt.checker, X + opt.checker, Z + opt.checker)) return NONE;
  mc.ensure();
  const W = opt.W;
  const bx0 = X - W, bz0 = Z - W, bx1 = X + W, bz1 = Z + W;
  const stampV = ++ctx.stampN;
  const st = mc.stamp;
  const pieces = [];
  const reach = opt.walk ?? Math.max(opt.h, opt.reach2) + 1.5;
  const reach2q = reach * reach;
  const K = opt.K;
  for (let z = Z - R; z <= Z + R; z++) for (let x = X - R; x <= X + R; x++) {
    for (let d = 0; d < 2; d++) {
      if (!mc.isBoundary(x, z, d)) continue;
      const l = mc.at(x + LPX[d], z + LPZ[d]), r = mc.at(x + RPX[d], z + RPZ[d]);
      let sx = x, sz = z, dd = d, A = l, B = r;
      if (l > r) { sx = x + DX[d]; sz = z + DZ[d]; dd = d + 2; A = r; B = l; }
      if (!inBox(sx, sz, dd, bx0, bz0, bx1, bz1)) continue;
      const id = mc.lid(sx, sz, dd);
      if (st[id] === stampV) continue;
      const ci = mc.lChain[id];
      if (ci < 0) continue;
      const ch = mc.chains[ci];
      const L = ch.n;
      const k0 = mc.lIdx[id];
      // the piece as a trace in the corner window sees it
      let lo, hi, closed = false;
      if (ch.closed && L <= K && ch.bbox[0] >= bx0 && ch.bbox[2] < bx1 && ch.bbox[1] >= bz0 && ch.bbox[3] < bz1) closed = true;
      else if (opt.fastWalk) {
        // only the in-reach run through k0 (in reach ⟹ in the box)
        const inR = (j) => { const ex = ch.px[j] - X - ox, ez = ch.pz[j] - Z - oz; return ex * ex + ez * ez <= reach2q; };
        if (!inR(k0)) continue;
        let f = 1, b = 0;
        if (ch.closed) {
          while (f < K && f < L) { const j = (k0 + f) % L; if (!inR(j) || !inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; }
          while (b < K && b + f < L) { const j = (((k0 - b - 1) % L) + L) % L; if (!inR(j) || !inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; }
        } else {
          while (f < K && k0 + f < L) { const j = k0 + f; if (!inR(j) || !inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; }
          while (b < K && k0 - b - 1 >= 0) { const j = k0 - b - 1; if (!inR(j) || !inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; }
        }
        lo = k0 - b; hi = k0 + f;
      } else {
        let f = 1, b = 0;
        if (ch.closed) {
          while (f < K) { const j = (k0 + f) % L; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; }
          while (b < K) { const j = (((k0 - b - 1) % L) + L) % L; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; }
        } else {
          while (f < K && k0 + f < L) { const j = k0 + f; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; }
          while (b < K && k0 - b - 1 >= 0) { const j = k0 - b - 1; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; }
        }
        lo = k0 - b; hi = k0 + f;
      }
      if (closed && L <= opt.tinyLoop) {
        for (let j = 0; j < L; j++) st[mc.lid(ch.px[j], ch.pz[j], ch.dirs[j])] = stampV;
        continue;
      }
      let cur = null;
      let j0 = lo, j1 = hi;
      if (closed) {
        j0 = -1;
        let firstOut = -1;
        for (let q = k0 + L; q < k0 + 2 * L; q++) {
          const s = q % L;
          const ex = ch.px[s] - X - ox, ez = ch.pz[s] - Z - oz;
          if (ex * ex + ez * ez > reach2q) { if (firstOut < 0) firstOut = q; continue; }
          const f = pointelFit(ctx, Y, mc, ci, s);
          if (f && f.kind === 'corner') { j0 = q; break; }
        }
        // no corner in reach: start the turn outside reach, so the pass
        // through reach is one piece (v1 started at the arbitrary trace start)
        if (j0 < 0) j0 = opt.loopFix && firstOut >= 0 ? firstOut : k0 + L;
        j1 = j0 + L + 1;
      }
      for (let q = j0; q < j1; q++) {
        const s = ch.closed ? ((q % L) + L) % L : q;
        const lk = mc.lid(ch.px[s], ch.pz[s], ch.dirs[s]);
        const closing = closed && q === j1 - 1;
        if (st[lk] === stampV && !closing) { if (cur) { pieces.push(cur); cur = null; } continue; }
        st[lk] = stampV;
        const ex = ch.px[s] - X - ox, ez = ch.pz[s] - Z - oz;
        if (ex * ex + ez * ez > reach2q) { if (cur) { pieces.push(cur); cur = null; } continue; }
        const f = pointelFit(ctx, Y, mc, ci, s);
        if (!f) continue;
        if (!cur) cur = new Piece(A, B);
        const lpx = ch.px[s], lpz = ch.pz[s], ld = ch.dirs[s];
        if (closing) {
          if (f.kind === 'corner') cur.push(f, f.curve, f.t1[0], f.t1[1], X, Z);
          else cur.push(f, f.curve, f.tx, f.tz, X, Z);
          cur.linel(lpx, lpz, ld, mc);
          break;
        }
        if (f.kind === 'corner') {
          if (!(closed && q === j0)) { cur.push(f, f.curve, f.t1[0], f.t1[1], X, Z); cur.linel(lpx, lpz, ld, mc); }
          pieces.push(cur);
          cur = new Piece(A, B);
          cur.push(f, f.curve2, f.t2[0], f.t2[1], X, Z);
          cur.linel(lpx, lpz, ld, mc);
        } else { cur.push(f, f.curve, f.tx, f.tz, X, Z); cur.linel(lpx, lpz, ld, mc); }
      }
      if (cur && cur.n) pieces.push(cur);
    }
  }
  const out = [];
  const r2 = opt.reach2 * opt.reach2;
  for (const p of pieces) {
    if (!p.n) continue;
    let ok = false;
    for (let i = 0; i < p.n; i++) { const dx = p.x[i] - ox, dz = p.z[i] - oz; if (dx * dx + dz * dz <= r2) { ok = true; break; } }
    if (ok) out.push(p);
  }
  ctx.stats.pieces += out.length;
  return out;
}
const NONE = [];

/** Vertex slots (as v1), all coordinates relative to the corner. */
const MASK = new Uint8Array(64);
export function vertexSlots(ctx, pieces, m, X, Y, Z, ox, oz) {
  const h = ctx.opt.h;
  const cand = [];
  let useMask = false;
  const AR = ctx.opt.adj | 0; // half-size of the own-region window (0 = off)
  if (AR) {
    // the own material's pixels around the corner, 8-connected to the
    // corner's own pixels: the region whose boundary this vertex draws
    const W0 = ctx.opt.W + 2;
    const mc = ctx.mapFor(Y, X - W0, Z - W0, X + W0, Z + W0);
    const S = 2 * AR;
    MASK.fill(0, 0, S * S);
    const stack = [];
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      if (mc.at(X + dx, Z + dz) === m) { const k = (dz + AR) * S + dx + AR; if (!MASK[k]) { MASK[k] = 1; stack.push(k); } }
    }
    while (stack.length) {
      const k = stack.pop();
      const i = k % S, j = (k - i) / S;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
        const nk = nj * S + ni;
        if (MASK[nk]) continue;
        if (mc.at(X - AR + ni, Z - AR + nj) === m) { MASK[nk] = 1; stack.push(nk); }
      }
    }
    useMask = true;
  }
  const inMask = (x, z) => { const i = x - X + AR, j = z - Z + AR; return i >= 0 && j >= 0 && i < 2 * AR && j < 2 * AR && MASK[j * 2 * AR + i] === 1; };
  for (const p of pieces) {
    if (p.A !== m && p.B !== m) continue;
    if (useMask) {
      let adj = false;
      for (let i = 0; i < p.lx.length && !adj; i++) if (inMask(p.lx[i], p.lz[i]) || inMask(p.rx[i], p.rz[i])) adj = true;
      if (!adj) continue;
    }
    const sign = p.B === m ? 1 : -1;
    const far = ctx.opt.farFix ? sign * ctx.opt.farS : null;
    const s = p.evalS(ox, oz, h, true, far, ctx.opt.farW);
    cand.push({ p, s: sign * s, sup: p.support(ox, oz), other: p.A === m ? p.B : p.A, nx: sign * EV_N[0], nz: sign * EV_N[1], sign });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.sup - b.sup);
  const c1 = cand[0];
  if (ctx.opt.oneChannel) return { s1: c1.s, s2: c1.s, o1: c1.other, o2: c1.other, op: 1, p1: c1, p2: c1 };
  let c2 = null;
  for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.secondFar) { c2 = cand[i]; break; }
  // two channels only between deliberate shapes (opt.conf): elsewhere one
  if (c2 && ctx.opt.conf && !(c1.p.conf && c2.p.conf)) c2 = null;
  let op = 1;
  {
    let cOp = null;
    for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.opReach) { cOp = cand[i]; break; }
    if (cOp) {
      const W0 = ctx.opt.W + 2;
      const mc = ctx.mapFor(Y, X - W0, Z - W0, X + W0, Z + W0);
      let errAnd = 0, errOr = 0;
      const R = ctx.opt.opBlock;
      for (let z = Z - R; z < Z + R; z++) for (let x = X - R; x < X + R; x++) {
        const lab = mc.at(x, z);
        if (lab < 0) continue;
        const own = lab === m;
        const fa = ctx.opt.farFix && ctx.opt.farOp ? c1.sign * ctx.opt.farS : null, fb = ctx.opt.farFix && ctx.opt.farOp ? cOp.sign * ctx.opt.farS : null;
        const a = c1.sign * c1.p.evalS(x - X + 0.5, z - Z + 0.5, h, false, fa, ctx.opt.farW);
        const b = cOp.sign * cOp.p.evalS(x - X + 0.5, z - Z + 0.5, h, false, fb, ctx.opt.farW);
        if ((a > 0 && b > 0) !== own) errAnd++;
        if ((a > 0 || b > 0) !== own) errOr++;
      }
      op = errOr < errAnd ? 0 : 1;
    }
  }
  if (!c2) return { s1: c1.s, s2: c1.s, o1: c1.other, o2: c1.other, op, p1: c1, p2: c1 };
  let first = c1, second = c2;
  const cr = c1.nx * c2.nz - c1.nz * c2.nx;
  if (cr < -0.3) { first = c2; second = c1; } else if (cr <= 0.3) {
    let dx = c1.nx, dz = c1.nz;
    if (dx * 0.8191 + dz * 0.5736 < 0) { dx = -dx; dz = -dz; }
    if (c1.nx * dx + c1.nz * dz < c2.nx * dx + c2.nz * dz) { first = c2; second = c1; }
  }
  const far = c1 === first ? second : first;
  const nearS = c1.s;
  const { secondNear, secondFar } = ctx.opt;
  const w = far.sup <= secondNear ? 1 : far.sup >= secondFar ? 0 : (secondFar - far.sup) / (secondFar - secondNear);
  const farS = nearS + w * (far.s - nearS);
  const s1 = first === c1 ? nearS : farS, s2 = first === c1 ? farS : nearS;
  return { s1, s2, o1: first.other, o2: second.other, op, p1: first, p2: second };
}

/** Uncached fit of chain step k of map mc (for benchmarks). */
export function fitRaw(ctx, mc, ci, k) {
  const ch = mc.chains[ci];
  const X = ch.px[k], Z = ch.pz[k];
  const { W, N, Lc } = ctx.opt;
  const v = windowView(ch, k, X - W, Z - W, X + W, Z + W, N + Lc + 4);
  for (let i = 0; i <= v.n; i++) { v.px[i] -= X; v.pz[i] -= Z; }
  return fitPointel(v, v.start, ctx.opt);
}

/**
 * Per-quad slot choice: the two pieces (and op) are chosen once for the
 * whole quad at its plan centre (cx, cz relative to corner X, Z), so all
 * four vertices of the quad interpolate the same two functions. Returns
 * null (no boundary near the quad) or { c1, c2, w, first, op } where
 * values at a vertex come from slotValues().
 */
export function quadChoice(ctx, pieces, m, X, Y, Z, cx, cz) {
  const h = ctx.opt.h;
  const cand = [];
  for (const p of pieces) {
    if (p.A !== m && p.B !== m) continue;
    const sign = p.B === m ? 1 : -1;
    const far = ctx.opt.farFix ? sign * ctx.opt.farS : null;
    const s = p.evalS(cx, cz, h, true, far, ctx.opt.farW);
    cand.push({ p, s: sign * s, sup: p.support(cx, cz), other: p.A === m ? p.B : p.A, nx: sign * EV_N[0], nz: sign * EV_N[1], sign });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.sup - b.sup);
  const c1 = cand[0];
  let c2 = null;
  for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.secondFar) { c2 = cand[i]; break; }
  if (c2 && ctx.opt.conf && !(c1.p.conf && c2.p.conf)) c2 = null;
  if (ctx.opt.oneChannel) c2 = null;
  let op = 1;
  {
    let cOp = null;
    for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.opReach) { cOp = cand[i]; break; }
    if (cOp) {
      const W0 = ctx.opt.W + 2;
      const mc = ctx.mapFor(Y, X - W0, Z - W0, X + W0, Z + W0);
      let errAnd = 0, errOr = 0;
      const R = ctx.opt.opBlock;
      // pixels around the quad centre (opCross: the cell and its 4 edge
      // neighbours only)
      const qx = X + Math.floor(cx), qz = Z + Math.floor(cz);
      for (let z = qz - R + 1; z < qz + R; z++) for (let x = qx - R + 1; x < qx + R; x++) {
        if (ctx.opt.opCross && x !== qx && z !== qz) continue;
        const lab = mc.at(x, z);
        if (lab < 0) continue;
        const own = lab === m;
        const a = c1.sign * c1.p.evalS(x - X + 0.5, z - Z + 0.5, h, false);
        const b = cOp.sign * cOp.p.evalS(x - X + 0.5, z - Z + 0.5, h, false);
        if ((a > 0 && b > 0) !== own) errAnd++;
        if ((a > 0 || b > 0) !== own) errOr++;
      }
      op = errOr < errAnd ? 0 : 1;
    }
  }
  if (!c2) return { c1, c2: null, w: 0, first: c1, op, o1: c1.other, o2: c1.other };
  let first = c1, second = c2;
  const cr = c1.nx * c2.nz - c1.nz * c2.nx;
  if (cr < -0.3) { first = c2; second = c1; } else if (cr <= 0.3) {
    let dx = c1.nx, dz = c1.nz;
    if (dx * 0.8191 + dz * 0.5736 < 0) { dx = -dx; dz = -dz; }
    if (c1.nx * dx + c1.nz * dz < c2.nx * dx + c2.nz * dz) { first = c2; second = c1; }
  }
  const far = c1 === first ? second : first;
  const { secondNear, secondFar } = ctx.opt;
  // per-quad mode: the fade weight would differ between neighbouring quads
  // (it is measured at each quad's centre) and step the boundary at their
  // shared edge, so it can be switched off (noFade)
  const w = ctx.opt.noFade ? 1 : far.sup <= secondNear ? 1 : far.sup >= secondFar ? 0 : (secondFar - far.sup) / (secondFar - secondNear);
  return { c1, c2, w, first, op, o1: first.other, o2: second.other };
}

/** Slot values of a quad's choice at a vertex offset (ox, oz) from corner. */
export function slotValues(ctx, q, ox, oz) {
  const h = ctx.opt.h;
  const ev = (c) => c.sign * c.p.evalS(ox, oz, h, false, ctx.opt.farFix ? c.sign * ctx.opt.farS : null, ctx.opt.farW);
  const nearS = ev(q.c1);
  if (!q.c2) return { s1: nearS, s2: nearS, o1: q.o1, o2: q.o2, op: q.op };
  const farS0 = ev(q.c1 === q.first ? q.c2 : q.first);
  const farS = nearS + q.w * (farS0 - nearS);
  return q.c1 === q.first ? { s1: nearS, s2: farS, o1: q.o1, o2: q.o2, op: q.op } : { s1: farS, s2: nearS, o1: q.o1, o2: q.o2, op: q.op };
}

// ---------------------------------------------------------------- 3 slots
// ops: 0 AND3, 1 OR3, 2 (a∧b)∨c, 3 (a∨b)∧c with (a, b, c) = slots rotated
// by `rot` (c = slot rot). Encoded as op (2 bits) + rot (2 bits)… we store
// form = op * 3 + rot (0..11; AND3/OR3 use rot 0) in 4 bits.
export const evalForm = (form, s1, s2, s3) => {
  const op = (form / 3) | 0, rot = form % 3;
  if (op === 0) return s1 > 0 && s2 > 0 && s3 > 0;
  if (op === 1) return s1 > 0 || s2 > 0 || s3 > 0;
  const c = rot === 0 ? s1 : rot === 1 ? s2 : s3;
  const a = rot === 0 ? s2 : s1, b = rot === 2 ? s2 : s3;
  return op === 2 ? (a > 0 && b > 0) || c > 0 : (a > 0 || b > 0) && c > 0;
};
const FORMS = [0, 3, 6, 7, 8, 9, 10, 11];

export function quadChoice3(ctx, pieces, m, X, Y, Z, cx, cz) {
  const h = ctx.opt.h;
  const cand = [];
  for (const p of pieces) {
    if (p.A !== m && p.B !== m) continue;
    const sign = p.B === m ? 1 : -1;
    const far = ctx.opt.farFix ? sign * ctx.opt.farS : null;
    const s = p.evalS(cx, cz, h, true, far, ctx.opt.farW);
    cand.push({ p, s: sign * s, sup: p.support(cx, cz), other: p.A === m ? p.B : p.A, nx: sign * EV_N[0], nz: sign * EV_N[1], sign });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.sup - b.sup);
  const chosen = [cand[0]];
  for (let i = 1; i < cand.length && chosen.length < 3; i++) if (cand[i].sup < ctx.opt.secondFar) chosen.push(cand[i]);
  if (ctx.opt.conf && chosen.length > 1 && !chosen.every((c) => c.p.conf)) chosen.length = 1;
  const near = chosen[0];
  // fade weights of the extra slots toward the nearest piece
  const { secondNear, secondFar } = ctx.opt;
  for (const c of chosen) c.w = c === near ? 1 : c.sup <= secondNear ? 1 : c.sup >= secondFar ? 0 : (secondFar - c.sup) / (secondFar - secondNear);
  // canonical slot order: by normal angle (atan2-free: half-plane then cross)
  const key = (c) => { const up = c.nz > 0 || (c.nz === 0 && c.nx > 0); return up; };
  const order = chosen.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka !== kb) return ka ? -1 : 1;
    const cr = a.nx * b.nz - a.nz * b.nx;
    return cr > 0 ? -1 : cr < 0 ? 1 : a.sup - b.sup;
  });
  while (order.length < 3) order.push(order[0]);
  // the combining form, from the labels around the quad
  let form = 0;
  if (chosen.length > 1) {
    const W0 = ctx.opt.W + 2;
    const mc = ctx.mapFor(Y, X - W0, Z - W0, X + W0, Z + W0);
    const R = ctx.opt.opBlock;
    const qx = X + Math.floor(cx), qz = Z + Math.floor(cz);
    const err = new Int32Array(12);
    for (let z = qz - R + 1; z < qz + R; z++) for (let x = qx - R + 1; x < qx + R; x++) {
      const lab = mc.at(x, z);
      if (lab < 0) continue;
      const own = lab === m;
      const v = order.map((c) => c.sign * c.p.evalS(x - X + 0.5, z - Z + 0.5, h, false));
      for (const f of FORMS) if (evalForm(f, v[0], v[1], v[2]) !== own) err[f]++;
    }
    let best = Infinity;
    for (const f of FORMS) if (err[f] < best) { best = err[f]; form = f; }
  }
  return { near, order, form, others: order.map((c) => c.other) };
}

export function slotValues3(ctx, q, ox, oz) {
  const h = ctx.opt.h;
  const ev = (c) => c.sign * c.p.evalS(ox, oz, h, false, ctx.opt.farFix ? c.sign * ctx.opt.farS : null, ctx.opt.farW);
  const nearS = ev(q.near);
  const s = q.order.map((c) => (c === q.near ? nearS : nearS + c.w * (ev(c) - nearS)));
  return { s, others: q.others, form: q.form };
}
