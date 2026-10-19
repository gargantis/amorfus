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
    const NL = (nx + 1) * (nz + 1) * 4;
    this.lChain = new Int32Array(NL).fill(-1);
    this.lIdx = new Int32Array(NL);
    this.fitAt = new Array(NL); // fits by linel id (undefined = not computed)
    this.stamp = new Int32Array(NL); // 'covered' marks, per corner call
    this.chains = [];
    this.built = false;
  }
  ensure() { if (!this.built) { this.built = true; this.build(); } return this; }
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
  const mcAt = (Y) => {
    let mc = maps.get(Y);
    if (!mc) {
      mc = new MapChains(buildMap(region, tops, Y, opt.Hmax), nx, nz, opt.maxStep);
      mc.key = Y;
      // prefix sums of the columns where M_Y differs from M*
      const P = new Int32Array((nx + 1) * (nz + 1));
      for (let z = 0; z < nz; z++) {
        let row = 0;
        for (let x = 0; x < nx; x++) {
          row += mc.m[z * nx + x] !== mStar[z * nx + x] || (mStar[z * nx + x] >= 0 && mc.hh[z * nx + x] !== hStar[z * nx + x]) ? 1 : 0;
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
  constructor(A, B) { this.A = A; this.B = B; this.n = 0; this.x = []; this.z = []; this.dx0 = []; this.dz0 = []; this.cv = []; this.tx = []; this.tz = []; this.conf = true; this.lx = []; this.lz = []; this.rx = []; this.rz = []; }
  /** Record the linel (pointel px, pz, direction d; region coords) of the last point. */
  linel(px, pz, d) { this.lx.push(px + LPX[d]); this.lz.push(pz + LPZ[d]); this.rx.push(px + RPX[d]); this.rz.push(pz + RPZ[d]); }
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
    let s = 0, sum = 0, nx = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const dx = x - X[i], dz = z - Z[i];
      const t = Math.sqrt(dx * dx + dz * dz) / h;
      if (t >= 1) continue;
      const u = 1 - t * t, w = u * u;
      sum += w;
      s += w * curveSd(this.cv[i], x - this.dx0[i], z - this.dz0[i]);
      if (wantN) { nx += w * -this.tz[i]; nz += w * this.tx[i]; }
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

/**
 * Pieces near corner (X, Y, Z) (region lattice coords) for a vertex at plan
 * offset (ox, oz) from the corner (see v1 cornerPieces for the rules).
 */
export function cornerPieces(ctx, X, Y, Z, ox, oz) {
  const opt = ctx.opt;
  CONF_T = opt.confT ?? 0;
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
      else {
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
          cur.linel(lpx, lpz, ld);
          break;
        }
        if (f.kind === 'corner') {
          if (!(closed && q === j0)) { cur.push(f, f.curve, f.t1[0], f.t1[1], X, Z); cur.linel(lpx, lpz, ld); }
          pieces.push(cur);
          cur = new Piece(A, B);
          cur.push(f, f.curve2, f.t2[0], f.t2[1], X, Z);
          cur.linel(lpx, lpz, ld);
        } else { cur.push(f, f.curve, f.tx, f.tz, X, Z); cur.linel(lpx, lpz, ld); }
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
