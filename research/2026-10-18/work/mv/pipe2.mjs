// v2 of the mesh-side pipeline: same semantics as pipeline.mjs (v1), but
// every label map's boundary chains are extracted ONCE (global linking with
// the saddle rule on the full map) and each pointel's fit window is an index
// range on its chain, clipped by the pointel's box, instead of a fresh trace.
// Per-corner pieces come from a linel → (chain, index) table instead of
// re-tracing. Fits are computed in coordinates relative to the pointel, so
// every stored value is a function of world-anchored inputs only.
import { fitPointel, DX, DZ } from './fit2d.mjs';

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
  const { cnt, ty, tm, MAXT } = tops;
  for (let col = 0; col < nx * nz; col++) {
    let best = -1, bd = Hmax + 1;
    for (let k = 0; k < cnt[col]; k++) {
      const d = Math.abs(ty[col * MAXT + k] + 1 - Y);
      if (d < bd) { bd = d; best = tm[col * MAXT + k]; }
    }
    m[col] = best;
  }
  return m;
}

/** A label map with its boundary chains. */
class MapChains {
  constructor(m, nx, nz) {
    this.m = m; this.nx = nx; this.nz = nz;
    this.PX = nx + 1; // pointels per row
    const NL = (nx + 1) * (nz + 1) * 4;
    this.lChain = new Int32Array(NL).fill(-1);
    this.lIdx = new Int32Array(NL);
    this.chains = [];
    this.build();
  }
  at(x, z) { return x < 0 || z < 0 || x >= this.nx || z >= this.nz ? -1 : this.m[z * this.nx + x]; }
  lid(x, z, d) { return ((z * this.PX) + x) * 4 + d; }
  /** Labels (left, right) of linel (x, z, d). */
  isAB(x, z, d, A, B) { return this.at(x + LPX[d], z + LPZ[d]) === A && this.at(x + RPX[d], z + RPZ[d]) === B; }
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
      if (z > 0) {
        const u = m[(z - 1) * nx + x];
        if (u >= 0 && u !== w) starts.push(u < w ? this.lid(x, z, 0) : this.lid(x + 1, z, 2));
      }
      if (x > 0) {
        const u = m[z * nx + x - 1]; // west
        if (u >= 0 && u !== w) starts.push(w < u ? this.lid(x, z, 1) : this.lid(x, z + 1, 3));
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

export function buildContext(region, opt) {
  const tops = columnTops(region);
  const maps = new Map();
  const mcAt = (Y) => {
    let mc = maps.get(Y);
    if (!mc) { mc = new MapChains(buildMap(region, tops, Y, opt.Hmax), region.nx, region.nz); maps.set(Y, mc); }
    return mc;
  };
  return { region, opt, mcAt, fitCache: new Map(), stats: { fits: 0, corners: 0, pieces: 0 } };
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
function pointelFit(ctx, Y, mc, ci, k) {
  const ch = mc.chains[ci];
  const X = ch.px[k], Z = ch.pz[k], d = ch.dirs[k];
  const key = ((Y * 4096 + X) * 4096 + Z) * 4 + d;
  let f = ctx.fitCache.get(key);
  if (f !== undefined) return f;
  const { W, N, Lc } = ctx.opt;
  const v = windowView(ch, k, X - W, Z - W, X + W, Z + W, N + Lc + 4);
  // relative coordinates: subtract the pointel (exact integer arithmetic)
  for (let i = 0; i <= v.n; i++) { v.px[i] -= X; v.pz[i] -= Z; }
  const r = fitPointel(v, v.start, ctx.opt) ?? null;
  f = r ? relFit(r, X, Z) : null;
  ctx.fitCache.set(key, f);
  ctx.stats.fits++;
  return f;
}

/** Pointel-relative fit → { X0, Z0, rx, rz, tx, tz, kind, curve, curve2, t1, t2 }. Curves stay
 *  relative to (X0, Z0): evaluating at (x, z) uses (x − X0, z − Z0). */
function relFit(r, X0, Z0) {
  return { X0, Z0, rx: r.x, rz: r.z, tx: r.tx, tz: r.tz, kind: r.kind, curve: r.curve, curve2: r.curve2, t1: r.t1, t2: r.t2 };
}

import { curveSd } from './fit2d.mjs';
const bump = (t) => (t < 1 ? (1 - t * t) * (1 - t * t) : 0);

/**
 * Pieces near corner (X, Y, Z) (region lattice coords) for a vertex at
 * plan offset (ox, oz) from the corner. Each piece: { A, B, pts } with
 * pts relative to their pointels; evaluation in corner-relative coords.
 */
export function cornerPieces(ctx, X, Y, Z, ox, oz) {
  const opt = ctx.opt;
  const mc = ctx.mcAt(Y);
  const R = opt.near;
  let first = -2, mixed = false;
  for (let z = Z - R; z < Z + R && !mixed; z++) for (let x = X - R; x < X + R; x++) {
    const m = mc.at(x, z);
    if (m < 0) continue;
    if (first === -2) first = m; else if (m !== first) { mixed = true; break; }
  }
  if (!mixed) return [];
  const W = opt.W;
  const bx0 = X - W, bz0 = Z - W, bx1 = X + W, bz1 = Z + W;
  const covered = new Set();
  const pieces = [];
  const reach = Math.max(opt.h, opt.reach2) + 1.5;
  // pointel j relative to the vertex
  const inReachP = (px, pz) => { const ex = px - X - ox, ez = pz - Z - oz; return ex * ex + ez * ez <= reach * reach; };
  for (let z = Z - R; z <= Z + R; z++) for (let x = X - R; x <= X + R; x++) {
    for (let d = 0; d < 2; d++) {
      const l = mc.at(x + LPX[d], z + LPZ[d]), r = mc.at(x + RPX[d], z + RPZ[d]);
      if (l < 0 || r < 0 || l === r) continue;
      let sx = x, sz = z, dd = d, A = l, B = r;
      if (l > r) { sx = x + DX[d]; sz = z + DZ[d]; dd = d + 2; A = r; B = l; }
      // both pixels must lie inside the corner window, as for a trace there
      if (!inBox(sx, sz, dd, bx0, bz0, bx1, bz1)) continue;
      const id = mc.lid(sx, sz, dd);
      if (covered.has(id)) continue;
      const ci = mc.lChain[id];
      if (ci < 0) continue;
      const ch = mc.chains[ci];
      const k0 = mc.lIdx[id];
      // the piece as a trace in the corner window sees it
      const v = pieceRange(ch, k0, bx0, bz0, bx1, bz1, opt.K);
      if (v.closed && ch.n <= opt.tinyLoop) {
        for (let j = 0; j < ch.n; j++) covered.add(mc.lid(ch.px[j], ch.pz[j], ch.dirs[j]));
        continue;
      }
      let cur = [];
      const flush = () => { if (cur.length) pieces.push(makePiece(A, B, cur, opt, X, Z)); cur = []; };
      const stepAt = (j) => (ch.closed ? ((j % ch.n) + ch.n) % ch.n : j);
      let j0 = v.lo, j1 = v.hi; // steps [j0, j1)
      if (v.closed) {
        const L = ch.n;
        j0 = k0 + L; // one turn starting at the trace start (as v1: index L of the ×3 unroll)
        for (let q = k0 + L; q < k0 + 2 * L; q++) {
          const s = stepAt(q);
          if (!inReachP(ch.px[s], ch.pz[s])) continue;
          const f = pointelFit(ctx, Y, mc, ci, s);
          if (f && f.kind === 'corner') { j0 = q; break; }
        }
        j1 = j0 + L + 1;
      }
      for (let q = j0; q < j1; q++) {
        const s = stepAt(q);
        const lk = mc.lid(ch.px[s], ch.pz[s], ch.dirs[s]);
        const closing = v.closed && q === j1 - 1;
        if (covered.has(lk) && !closing) { flush(); continue; }
        covered.add(lk);
        if (!inReachP(ch.px[s], ch.pz[s])) { flush(); continue; }
        const f = pointelFit(ctx, Y, mc, ci, s);
        if (!f) continue;
        if (closing) {
          if (f.kind === 'corner') cur.push(ptOf(f, f.curve, f.t1[0], f.t1[1]));
          else cur.push(ptOf(f, f.curve, f.tx, f.tz));
          break;
        }
        if (f.kind === 'corner') {
          if (!(v.closed && q === j0)) cur.push(ptOf(f, f.curve, f.t1[0], f.t1[1]));
          flush();
          cur.push(ptOf(f, f.curve2, f.t2[0], f.t2[1]));
        } else cur.push(ptOf(f, f.curve, f.tx, f.tz));
      }
      flush();
    }
  }
  const out = [];
  const r2 = opt.reach2 * opt.reach2;
  for (const p of pieces) {
    let ok = false;
    for (const q of p.pts) { const dx = q.x - ox, dz = q.z - oz; if (dx * dx + dz * dz <= r2) { ok = true; break; } }
    if (ok) out.push(p);
  }
  ctx.stats.pieces += out.length;
  return out;
}

/** Steps of chain ch around step k that a trace inside the box (at most K
 *  steps each way) would see: { lo, hi, closed } (hi exclusive). */
function pieceRange(ch, k, bx0, bz0, bx1, bz1, K) {
  const L = ch.n;
  if (ch.closed && L <= K && ch.bbox[0] >= bx0 && ch.bbox[2] < bx1 && ch.bbox[1] >= bz0 && ch.bbox[3] < bz1) return { lo: k, hi: k + L, closed: true };
  let f = 1;
  if (ch.closed) { while (f < K) { const j = (k + f) % L; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; } }
  else { while (f < K && k + f < L) { const j = k + f; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; f++; } }
  let b = 0;
  if (ch.closed) { while (b < K) { const j = (((k - b - 1) % L) + L) % L; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; } }
  else { while (b < K && k - b - 1 >= 0) { const j = k - b - 1; if (!inBox(ch.px[j], ch.pz[j], ch.dirs[j], bx0, bz0, bx1, bz1)) break; b++; } }
  return { lo: k - b, hi: k + f, closed: false };
}

/** A fitted point, re-expressed relative to the CORNER (cx, cz): offsets
 *  (X0 − cx) are exact integers; the curve keeps its pointel origin. */
function ptOf(f, curve, tx, tz) {
  return { f, X0: f.X0, Z0: f.Z0, x: f.rx, z: f.rz, curve, tx, tz };
}

function makePiece(A, B, raw, opt, cx, cz) {
  const h = opt.h;
  // points relative to the corner
  const pts = raw.map((p) => ({ dx0: p.X0 - cx, dz0: p.Z0 - cz, x: (p.X0 - cx) + p.x, z: (p.Z0 - cz) + p.z, curve: p.curve, tx: p.tx, tz: p.tz }));
  const weights = (x, z) => {
    const ws = [];
    let sum = 0;
    for (const p of pts) {
      const dx = x - p.x, dz = z - p.z;
      const w = bump(Math.sqrt(dx * dx + dz * dz) / h);
      ws.push(w); sum += w;
    }
    return [ws, sum];
  };
  return {
    A, B, pts,
    support(x, z) {
      let best = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const ax = pts[i].x, az = pts[i].z;
        if (i + 1 < pts.length) {
          const bx = pts[i + 1].x, bz = pts[i + 1].z;
          const ux = bx - ax, uz = bz - az, uu = ux * ux + uz * uz;
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
    },
    /** (x, z) relative to the corner. */
    eval(x, z) {
      const [ws, sum] = weights(x, z);
      let s = 0, nx = 0, nz = 0;
      if (sum > 0) {
        for (let i = 0; i < pts.length; i++) {
          if (ws[i] === 0) continue;
          s += ws[i] * curveSd(pts[i].curve, x - pts[i].dx0, z - pts[i].dz0);
          nx += ws[i] * -pts[i].tz; nz += ws[i] * pts[i].tx;
        }
        s /= sum;
      } else {
        let best = Infinity, bi = 0;
        for (let i = 0; i < pts.length; i++) {
          const dx = x - pts[i].x, dz = z - pts[i].z, d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bi = i; }
        }
        s = curveSd(pts[bi].curve, x - pts[bi].dx0, z - pts[bi].dz0); nx = -pts[bi].tz; nz = pts[bi].tx;
      }
      const nl = Math.sqrt(nx * nx + nz * nz) || 1;
      return { s, nx: nx / nl, nz: nz / nl };
    },
  };
}

/** Vertex slots (as v1), all coordinates relative to the corner. */
export function vertexSlots(ctx, pieces, m, X, Y, Z, ox, oz) {
  const cand = [];
  for (const p of pieces) {
    if (p.A !== m && p.B !== m) continue;
    const e = p.eval(ox, oz);
    const sign = p.B === m ? 1 : -1;
    cand.push({ p, s: sign * e.s, sup: p.support(ox, oz), other: p.A === m ? p.B : p.A, nx: sign * e.nx, nz: sign * e.nz, sign });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.sup - b.sup);
  const c1 = cand[0];
  let c2 = null;
  for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.secondFar) { c2 = cand[i]; break; }
  let op = 1;
  {
    let cOp = null;
    for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.opReach) { cOp = cand[i]; break; }
    if (cOp) {
      const mc = ctx.mcAt(Y);
      let errAnd = 0, errOr = 0;
      const R = ctx.opt.opBlock;
      for (let z = Z - R; z < Z + R; z++) for (let x = X - R; x < X + R; x++) {
        const lab = mc.at(x, z);
        if (lab < 0) continue;
        const own = lab === m;
        const a = c1.sign * c1.p.eval(x - X + 0.5, z - Z + 0.5).s;
        const b = cOp.sign * cOp.p.eval(x - X + 0.5, z - Z + 0.5).s;
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
