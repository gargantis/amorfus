// Mesh-side pipeline of the "fit" approach: production 'hints' geometry,
// plus 3 bytes per vertex describing up to two fitted boundary pieces near
// the vertex (signed distances, other materials, AND/OR), which the
// fragment stage uses to draw the material boundary along the fitted
// curve instead of along block edges.
//
// Data flow (all from `region` only):
//   region blocks → per-column surface tops → plan label map at height Y
//   → boundary chains (A|B, saddles resolved) → per-pointel canonical fit
//   (line / corner / arc / λ-MST) in a window fixed around the pointel
//   → per-corner pieces (blended signed distance per sub-piece)
//   → per-vertex slots (s1, s2 quantised to 1/64 block, o1, o2, op).
import { LabelWindow, tracePiece, fitPointel, curveSd, DEFAULT_FIT, DX, DZ } from './fit2d.mjs';

const LPX = [0, 0, -1, -1], LPZ = [-1, 0, 0, -1], RPX = [0, -1, -1, 0], RPZ = [0, 0, -1, -1];

export const DEFAULT_PIPE = {
  ...DEFAULT_FIT,
  N: 12,
  kMax: 2, // arcs down to radius 0.5 (single blocks)
  W: 10, // pointel window half-size (blocks)
  Hmax: 8, // a column's surface must be within this height of the corner
  K: 64, // trace each chain this far (the window clips it) so one trace covers it
  h: 2.0, // blend radius (blocks) of pointel fits at a corner
  near: 3, // candidate linels within this many pixels of the corner
  quant: 64, // s quantisation (steps per block); range ±127/quant
  opReach: 4.0, // the op is decided against the nearest other piece this close
  opBlock: 3, // ... over the (2·opBlock)² pixels around the corner
  tinyLoop: 6, // closed boundaries this short (single blocks, dominoes) stay blocks
  reach2: 3.5, // pieces with a fitted point this close take part
  secondNear: 1.2, // a second piece this close counts in full
  secondFar: 2.4, // ... and fades out by this distance
};

/** Surface tops of every column of the region (solid with air above). */
function columnTops(region) {
  const { nx, ny, nz, blocks } = region;
  const MAXT = 6;
  const cnt = new Uint8Array(nx * nz);
  const ty = new Int16Array(nx * nz * MAXT);
  const tm = new Uint8Array(nx * nz * MAXT);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const col = z * nx + x;
    let c = 0;
    for (let y = ny - 2; y >= 0 && c < MAXT; y--) {
      const i = (y * nz + z) * nx + x;
      const j = i + nx * nz;
      if ((blocks[i] & 0xff) !== 0 && (blocks[j] & 0xff) === 0) {
        ty[col * MAXT + c] = y; tm[col * MAXT + c] = blocks[i] & 0xff; c++;
      }
    }
    cnt[col] = c;
  }
  return { cnt, ty, tm, MAXT };
}

export function buildContext(region, opt) {
  const tops = columnTops(region);
  const { nx, nz } = region;
  const maps = new Map();
  const mapAt = (Y) => {
    let m = maps.get(Y);
    if (m) return m;
    m = new Int16Array(nx * nz).fill(-1);
    const { cnt, ty, tm, MAXT } = tops;
    for (let col = 0; col < nx * nz; col++) {
      let best = -1, bd = opt.Hmax + 1;
      for (let k = 0; k < cnt[col]; k++) {
        const d = Math.abs(ty[col * MAXT + k] + 1 - Y);
        if (d < bd) { bd = d; best = tm[col * MAXT + k]; } // tops are listed top-down: ties keep the upper
      }
      m[col] = best;
    }
    maps.set(Y, m);
    return m;
  };
  return { region, opt, mapAt, fitCache: new Map(), stats: { fits: 0, corners: 0, pieces: 0 } };
}

function labelFn(ctx, Y) {
  const m = ctx.mapAt(Y);
  const { nx, nz } = ctx.region;
  return (x, z) => (x < 0 || z < 0 || x >= nx || z >= nz ? -1 : m[z * nx + x]);
}

/** Canonical fit of the pointel at the start of linel (X, Z, d) on the A|B
 *  piece, computed in the window of half-size W around the pointel. */
function pointelFit(ctx, Y, fn, X, Z, d, A, B) {
  const key = ((((Y * 4096 + X) * 4096 + Z) * 4 + d) * 8 + A) * 8 + B;
  let f = ctx.fitCache.get(key);
  if (f !== undefined) return f;
  const { W, N, Lc } = ctx.opt;
  const lw = new LabelWindow(fn, X - W, Z - W, X + W, Z + W);
  const ch = tracePiece(lw, X, Z, d, A, B, N + Lc + 4);
  f = fitPointel(ch, ch.start, ctx.opt) ?? null;
  ctx.fitCache.set(key, f);
  ctx.stats.fits++;
  return f;
}

const bump = (t) => (t < 1 ? (1 - t * t) * (1 - t * t) : 0);

/**
 * Pieces near corner (X, Y, Z) (region lattice coords) for a vertex at plan
 * position (px, pz). Each piece: { A, B, sd(x, z), nx, nz } where sd > 0 on
 * the B side.
 */
export function cornerPieces(ctx, X, Y, Z, px, pz) {
  const opt = ctx.opt;
  const fn = labelFn(ctx, Y);
  const R = opt.near;
  // quick reject: one known label (or none) around the corner
  let first = -2, mixed = false;
  for (let z = Z - R; z < Z + R && !mixed; z++) for (let x = X - R; x < X + R; x++) {
    const m = fn(x, z);
    if (m < 0) continue;
    if (first === -2) first = m; else if (m !== first) { mixed = true; break; }
  }
  if (!mixed) return [];
  // the corner's own window: local chain structure only
  const cw = new LabelWindow(fn, X - opt.W, Z - opt.W, X + opt.W, Z + opt.W);
  const covered = new Set();
  const pieces = [];
  for (let z = Z - R; z <= Z + R; z++) for (let x = X - R; x <= X + R; x++) {
    for (let d = 0; d < 2; d++) {
      // linel from pointel (x, z) going E (d = 0) or S (d = 1)
      const l = cw.at(x + LPX[d], z + LPZ[d]), r = cw.at(x + RPX[d], z + RPZ[d]);
      if (l < 0 || r < 0 || l === r) continue;
      // orient so the lower id is on the left
      let sx = x, sz = z, dd = d, A = l, B = r;
      if (l > r) { sx = x + DX[d]; sz = z + DZ[d]; dd = d + 2; A = r; B = l; }
      const key = ((sx * 4096 + sz) * 4 + dd) * 64 + A * 8 + B;
      if (covered.has(key)) continue;
      const ch = tracePiece(cw, sx, sz, dd, A, B, opt.K);
      if (ch.closed && ch.loopLen <= opt.tinyLoop) {
        // a single block or a domino: smaller than the vertex spacing can
        // draw round, so it stays a block (no piece; quads show their own
        // material)
        for (let j = 0; j < ch.n; j++) covered.add(((ch.px[j] * 4096 + ch.pz[j]) * 4 + ch.dirs[j]) * 64 + A * 8 + B);
        continue;
      }
      // fits of the pointels within reach, one piece per contiguous pass
      // of the chain near the vertex, split at corners; every linel is
      // used once (closed loops come back unrolled ×3)
      let cur = [];
      const flush = () => { if (cur.length) pieces.push(makePiece(A, B, cur, opt)); cur = []; };
      const reach = Math.max(opt.h, opt.reach2) + 1.5;
      const inReach = (j) => { const ex = ch.px[j] - px, ez = ch.pz[j] - pz; return ex * ex + ez * ez <= reach * reach; };
      let j0 = 0, j1 = ch.n;
      if (ch.closed) {
        // walk one turn of the loop starting at a corner, if it has one,
        // so no piece is cut at the arbitrary trace start
        const L = ch.loopLen;
        j0 = L;
        for (let k = L; k < 2 * L; k++) {
          if (!inReach(k)) continue;
          const f = pointelFit(ctx, Y, fn, ch.px[k], ch.pz[k], ch.dirs[k], A, B);
          if (f && f.kind === 'corner') { j0 = k; break; }
        }
        j1 = j0 + L + 1;
      }
      for (let j = j0; j < j1; j++) {
        const lk = ((ch.px[j] * 4096 + ch.pz[j]) * 4 + ch.dirs[j]) * 64 + A * 8 + B;
        const closing = ch.closed && j === j1 - 1;
        if (covered.has(lk) && !closing) { flush(); continue; }
        covered.add(lk);
        if (!inReach(j)) { flush(); continue; }
        const f = pointelFit(ctx, Y, fn, ch.px[j], ch.pz[j], ch.dirs[j], A, B);
        if (!f) continue;
        if (closing) {
          // the loop's start pointel again: close the last piece
          if (f.kind === 'corner') cur.push({ x: f.x, z: f.z, curve: f.curve, tx: f.t1[0], tz: f.t1[1] });
          else cur.push({ x: f.x, z: f.z, curve: f.curve, tx: f.tx, tz: f.tz });
          break;
        }
        if (f.kind === 'corner') {
          // a loop walk that starts at a corner gets its incoming arm from
          // the closing pointel instead
          if (!(ch.closed && j === j0)) cur.push({ x: f.x, z: f.z, curve: f.curve, tx: f.t1[0], tz: f.t1[1] });
          flush();
          cur.push({ x: f.x, z: f.z, curve: f.curve2, tx: f.t2[0], tz: f.t2[1] });
        } else cur.push({ x: f.x, z: f.z, curve: f.curve, tx: f.tx, tz: f.tz });
      }
      flush();
    }
  }
  // keep pieces with a fitted point within reach of the vertex
  const out = [];
  const r2 = opt.reach2 * opt.reach2;
  for (const p of pieces) {
    let ok = false;
    for (const q of p.pts) { const dx = q.x - px, dz = q.z - pz; if (dx * dx + dz * dz <= r2) { ok = true; break; } }
    if (ok) out.push(p);
  }
  ctx.stats.pieces += out.length;
  return out;
}

function makePiece(A, B, pts, opt) {
  const h = opt.h;
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
    weightAt(x, z) { return weights(x, z)[1]; },
    /** Distance to the piece's own extent (the polyline of its fitted
     *  points), used to rank pieces; the slot value itself is the
     *  extended curve's signed distance. */
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
    /** Blended signed distance (> 0 on the B side) and normal at (x, z);
     *  outside every pointel's reach, the nearest pointel's curve. */
    eval(x, z) {
      const [ws, sum] = weights(x, z);
      let s = 0, nx = 0, nz = 0;
      if (sum > 0) {
        for (let i = 0; i < pts.length; i++) {
          if (ws[i] === 0) continue;
          s += ws[i] * curveSd(pts[i].curve, x, z);
          nx += ws[i] * -pts[i].tz; nz += ws[i] * pts[i].tx;
        }
        s /= sum;
      } else {
        let best = Infinity, bi = 0;
        for (let i = 0; i < pts.length; i++) {
          const dx = x - pts[i].x, dz = z - pts[i].z, d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bi = i; }
        }
        s = curveSd(pts[bi].curve, x, z); nx = -pts[bi].tz; nz = pts[bi].tx;
      }
      const nl = Math.sqrt(nx * nx + nz * nz) || 1;
      return { s, nx: nx / nl, nz: nz / nl };
    },
  };
}

/**
 * Vertex slots for material m at a corner: up to two pieces involving m,
 * as (s, other) with s > 0 on m's side, ordered canonically, and the
 * combination op (1 = AND, 0 = OR) chosen by the label map.
 */
export function vertexSlots(ctx, pieces, m, X, Y, Z, px, pz) {
  const cand = [];
  for (const p of pieces) {
    if (p.A !== m && p.B !== m) continue;
    const e = p.eval(px, pz);
    const sign = p.B === m ? 1 : -1;
    cand.push({ p, s: sign * e.s, sup: p.support(px, pz), other: p.A === m ? p.B : p.A, nx: sign * e.nx, nz: sign * e.nz, sign });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.sup - b.sup);
  const c1 = cand[0];
  // a second piece only when it is genuinely close: far pieces would
  // compete for the slot and flip between neighbouring vertices
  let c2 = null;
  for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.secondFar) { c2 = cand[i]; break; }
  // AND or OR, from the labels: whichever reproduces the pixels around
  // the corner with the nearest other piece within opReach. Every vertex
  // decides against its own nearest pair, so neighbours agree on how the
  // (possibly faded) second slot combines.
  let op = 1;
  {
    let cOp = null;
    for (let i = 1; i < cand.length; i++) if (cand[i].sup < ctx.opt.opReach) { cOp = cand[i]; break; }
    if (cOp) {
      const fn = labelFn(ctx, Y);
      let errAnd = 0, errOr = 0;
      const R = ctx.opt.opBlock;
      for (let z = Z - R; z < Z + R; z++) for (let x = X - R; x < X + R; x++) {
        const lab = fn(x, z);
        if (lab < 0) continue;
        const own = lab === m;
        const a = c1.sign * c1.p.eval(x + 0.5, z + 0.5).s;
        const b = cOp.sign * cOp.p.eval(x + 0.5, z + 0.5).s;
        if ((a > 0 && b > 0) !== own) errAnd++;
        if ((a > 0 || b > 0) !== own) errOr++;
      }
      op = errOr < errAnd ? 0 : 1;
    }
  }
  if (!c2) return { s1: c1.s, s2: c1.s, o1: c1.other, o2: c1.other, op, p1: c1, p2: c1 };
  // canonical order of the two pieces
  let first = c1, second = c2;
  const cr = c1.nx * c2.nz - c1.nz * c2.nx;
  if (cr < -0.3) { first = c2; second = c1; } else if (cr <= 0.3) {
    // (anti)parallel: order along the canonical orientation of c1's normal
    let dx = c1.nx, dz = c1.nz;
    if (dx * 0.8191 + dz * 0.5736 < 0) { dx = -dx; dz = -dz; }
    if (c1.nx * dx + c1.nz * dz < c2.nx * dx + c2.nz * dz) { first = c2; second = c1; }
  }
  // fade the farther piece into the nearer one with its distance, so the
  // second slot switches on smoothly instead of at a cutoff
  const far = c1 === first ? second : first;
  const nearS = c1.s;
  const { secondNear, secondFar } = ctx.opt;
  const w = far.sup <= secondNear ? 1 : far.sup >= secondFar ? 0 : (secondFar - far.sup) / (secondFar - secondNear);
  const farS = nearS + w * (far.s - nearS);
  const s1 = first === c1 ? nearS : farS, s2 = first === c1 ? farS : nearS;
  return { s1, s2, o1: first.other, o2: second.other, op, p1: first, p2: second };
}

/** Encode slots into the 3 spare vertex bytes; decode back to what the
 *  vertex shader would hand the rasteriser. */
export function encodeSlots(sl, own, quant) {
  if (!sl) return [own | (own << 3) | (1 << 6), 127, 127];
  const q = (s) => Math.max(-127, Math.min(127, Math.round(s * quant)));
  return [sl.o1 | (sl.o2 << 3) | (sl.op << 6) | (1 << 7), q(sl.s1) & 0xff, q(sl.s2) & 0xff];
}
export function decodeSlots(b0, b1, b2, quant) {
  const s8 = (v) => (v > 127 ? v - 256 : v);
  return { o1: b0 & 7, o2: (b0 >> 3) & 7, op: (b0 >> 6) & 1, valid: b0 >> 7, s1: s8(b1) / quant, s2: s8(b2) / quant };
}
