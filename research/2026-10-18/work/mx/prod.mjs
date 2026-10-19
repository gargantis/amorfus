// mx production-path prototype: per-chunk contour codes for surface blocks.
//
// CPU (mesh worker, after the hints mesh):
//  1. prep(): material + exposure bytes over the whole region (52³ at apron 10).
//  2. For every direction d = (axis a, sign s) and every surface block P
//     (solid, not sharp, exposed toward d) that a fragment of this chunk can
//     find, the 4 in-plane neighbours are followed along the surface; P needs
//     a code iff one of them has another (known) material.
//  3. Cracks (unit edges between two surface blocks of different material)
//     are OWNED by the block on their low side (+u / +v edge). Each crack's
//     crossing τ is fitted exactly once, in a window centred on its owner
//     (canonical), and memoised: every block that uses the crack sees the
//     same τ, and so does the neighbouring chunk (same world data, same
//     arithmetic: + − × ÷ √ and comparisons only).
//  4. A coded block's boundary pieces come from the links at its 4 corners
//     (xBR saddle rule, pins, kept corners), with τ from the crack table;
//     they are clipped to the cell (edge intersections in a canonical edge
//     frame, so both cells sharing an edge quantise the same point), joined
//     into ≤ 2 passages and packed into 64 bits.
//
// GPU model (fragment): a per-chunk r32uint texel volume (32 + 2·M)³, M = 3:
//   bits 0-2 material, 3 sharp, 4-9 exposed toward d, 10-15 has-code(d),
//   16-31 code base index; codes in a storage buffer array<vec2u>.
// The fragment takes the dominant axis of its interpolated normal, finds the
// surface block of its column within ±W of its own level (1–3 texel loads),
// and, if that block has a code for d, loads it (one 8-byte load) and tests
// ≤ 2 two-segment polylines.

export const U = 15;
export const DIRS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
export const UVA = [[2, 1], [0, 2], [0, 1]];
const NONE = -100000;

// ------------------------------------------------------------ region prep
export function prep(region) {
  const n = region.nx, ap = region.apron, N3 = n * n * n;
  const { blocks } = region;
  const cm = new Uint8Array(N3); // material | sharp << 3 (0 = air)
  for (let i = 0; i < N3; i++) {
    const v = blocks[i], m = v & 0xff;
    if (m !== 0) cm[i] = (m & 7) | (v & 256 ? 8 : 0);
  }
  const SY = n * n, SZ = n;
  const expo = new Uint8Array(N3);
  for (let y = 1; y < n - 1; y++) for (let z = 1; z < n - 1; z++) {
    let i = y * SY + z * SZ + 1;
    for (let x = 1; x < n - 1; x++, i++) {
      if (cm[i] === 0) continue;
      let e = 0;
      if (cm[i + 1] === 0) e |= 1;
      if (cm[i - 1] === 0) e |= 2;
      if (cm[i + SY] === 0) e |= 4;
      if (cm[i - SY] === 0) e |= 8;
      if (cm[i + SZ] === 0) e |= 16;
      if (cm[i - SZ] === 0) e |= 32;
      expo[i] = e;
    }
  }
  const stride = [1, SY, SZ];
  const off = ap * (1 + SY + SZ);
  // valid scene-coordinate range with a 1-cell margin for exposure
  return { n, ap, cm, expo, stride, off, lo: -ap + 1, hi: n - ap - 2 };
}

/** Plane setup for direction d: strides for (u, v, L). */
function plane(P, d) {
  const [a, s] = DIRS[d];
  const [ua, va] = UVA[a];
  return { d, a, s, bit: 1 << d, SA: P.stride[a], SU: P.stride[ua], SV: P.stride[va], ua, va };
}

/** Surface block exposed toward d in column (u, v), searching from level L
 *  within [lo, hi]; returns its level or NONE. Reads outside the region → NONE. */
export const CLIP = { n: 0 };
function find(P, pl, u, v, L, lo, hi) {
  if (lo < P.lo) { lo = P.lo; CLIP.n++; }
  if (hi > P.hi) { hi = P.hi; CLIP.n++; }
  if (u < P.lo || u > P.hi || v < P.lo || v > P.hi || lo > hi) { CLIP.n++; return NONE; }
  if (L < lo) L = lo; else if (L > hi) L = hi;
  const s = pl.s, SA = pl.SA, cm = P.cm, expo = P.expo, bit = pl.bit;
  let i = P.off + u * pl.SU + v * pl.SV + L * SA;
  if (cm[i] !== 0) {
    if (expo[i] & bit) return L;
    for (let l = L + s; l >= lo && l <= hi; l += s) {
      i += s * SA;
      if (cm[i] === 0) return NONE;
      if (expo[i] & bit) return l;
    }
    return NONE;
  }
  for (let l = L - s; l >= lo && l <= hi; l -= s) {
    i -= s * SA;
    if (cm[i] !== 0) return l;
  }
  return NONE;
}
const cellAt = (P, pl, u, v, L) => P.cm[P.off + u * pl.SU + v * pl.SV + L * pl.SA];
// Memo of the UNBOUNDED search (within the region) per (u, v, start); a
// bounded search over [lo, hi] ∋ start returns the same level when it lies in
// [lo, hi] and NONE otherwise, so callers range-check the memoised level.
const MEMO = { lvl: new Int32Array(0), stamp: new Uint32Array(0), cur: 0, span: 0 };
function memoReset(P) {
  const span = P.hi - P.lo + 1;
  if (MEMO.span !== span) { MEMO.span = span; MEMO.lvl = new Int32Array(span * span * span); MEMO.stamp = new Uint32Array(span * span * span); MEMO.cur = 0; }
  MEMO.cur++;
  if (MEMO.cur > 0xfffffff0) { MEMO.stamp.fill(0); MEMO.cur = 1; }
}
function findMemo(P, pl, u, v, start, lo, hi) {
  if (u < P.lo || u > P.hi || v < P.lo || v > P.hi || start < P.lo || start > P.hi) return find(P, pl, u, v, start, lo, hi);
  const span = MEMO.span;
  const k = ((u - P.lo) * span + (v - P.lo)) * span + (start - P.lo);
  let l;
  if (MEMO.stamp[k] === MEMO.cur) l = MEMO.lvl[k];
  else { l = find(P, pl, u, v, start, P.lo, P.hi); MEMO.lvl[k] = l; MEMO.stamp[k] = MEMO.cur; }
  return l === NONE || l < lo || l > hi ? NONE : l;
}
const imgMat = (c) => (c & 8 ? U : c & 7);

// ------------------------------------------------------------ windows
/** Surface-followed (2R+1)² window around the surface block (u0, v0, L0):
 *  ring k's cells search from the level of the cell one step inward, within
 *  the axis range L0 ± Wa. */
export function makeWindow(R) {
  const S = 2 * R + 1;
  return { R, S, img: new Int8Array(S * S), lvl: new Int32Array(S * S), u0: 0, v0: 0, L0: 0,
    // topology scratch (lattice points (S+1)², crack ends 2·2·S·S)
    stamp: 1, pStamp: new Uint32Array((S + 1) * (S + 1)), link: new Int32Array(4 * S * S),
    // chain / run scratch
    cf: new Int32Array(4 * S * S + 8), cfd: new Int8Array(4 * S * S + 8), cb: new Int32Array(4 * S * S + 8), cbd: new Int8Array(4 * S * S + 8),
    cr: new Int32Array(8 * S * S + 16), cd: new Int8Array(8 * S * S + 16), dv: new Int8Array(8 * S * S + 16),
    rS: new Int32Array(8 * S * S + 16), rE: new Int32Array(8 * S * S + 16), rD: new Int8Array(8 * S * S + 16), rK: new Int8Array(8 * S * S + 16),
    rL: new Int32Array(8 * S * S + 16), cA: new Uint8Array(8 * S * S + 16), rO: new Int32Array(8 * S * S + 16), pts: new Float64Array(3 * (8 * S * S + 16)) };
}
export function fillWindow(P, pl, W, u0, v0, L0, Wa) {
  const { R, S, img, lvl } = W;
  W.u0 = u0; W.v0 = v0; W.L0 = L0;
  W.stamp++;
  if (W.stamp > 0xfffffff0) { W.pStamp.fill(0); W.stamp = 1; }
  const lo = L0 - Wa, hi = L0 + Wa;
  const k0 = R * S + R;
  const cm = P.cm, expo = P.expo, bit = pl.bit, SU = pl.SU, SV = pl.SV, SA = pl.SA;
  // fast path is safe when every window cell and level range is inside the region
  const safe = u0 - R - 1 >= P.lo && u0 + R + 1 <= P.hi && v0 - R - 1 >= P.lo && v0 + R + 1 <= P.hi && lo - 1 >= P.lo && hi + 1 <= P.hi;
  const base0 = P.off + u0 * SU + v0 * SV;
  img[k0] = imgMat(cm[base0 + L0 * SA]); lvl[k0] = L0;
  for (let ring = 1; ring <= R; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      const ady = dy < 0 ? -dy : dy;
      const step = ady === ring ? 1 : 2 * ring;
      const iy = (dy === ring ? dy - 1 : dy === -ring ? dy + 1 : dy);
      for (let dx = -ring; dx <= ring; dx += step) {
        const ix = (dx === ring ? dx - 1 : dx === -ring ? dx + 1 : dx);
        const start = lvl[(iy + R) * S + (ix + R)];
        const k = (dy + R) * S + (dx + R);
        if (safe) {
          const j = base0 + dx * SU + dy * SV + start * SA;
          const c = cm[j];
          if (c !== 0 && (expo[j] & bit)) { img[k] = c & 8 ? U : c & 7; lvl[k] = start; continue; }
        }
        const l = start >= lo && start <= hi ? findMemo(P, pl, u0 + dx, v0 + dy, start, lo, hi) : find(P, pl, u0 + dx, v0 + dy, start, lo, hi);
        if (l === NONE) { img[k] = U; lvl[k] = start; }
        else { img[k] = imgMat(cellAt(P, pl, u0 + dx, v0 + dy, l)); lvl[k] = l; }
      }
    }
  }
}

// crack ids within a window: kind 0 = H(i,j): cells (i,j−1)|(i,j), lattice
// (i,j)→(i+1,j), normal (0,1); kind 1 = V(i,j): cells (i−1,j)|(i,j),
// lattice (i,j)→(i,j+1), normal (1,0). id = kind·S² + j·S + i.
function crackExists(W, kind, i, j) {
  const { S, img } = W;
  if (kind === 0) {
    if (i < 0 || i >= S || j < 1 || j >= S) return false;
    const p = img[(j - 1) * S + i], q = img[j * S + i];
    return p !== U && q !== U && p !== q;
  }
  if (i < 1 || i >= S || j < 0 || j >= S) return false;
  const p = img[j * S + i - 1], q = img[j * S + i];
  return p !== U && q !== U && p !== q;
}
const OPEN = -1, PIN = -2;
/** Resolve the links at lattice point (x, y) of the window (memoised per fill). */
function resolvePoint(W, x, y, o) {
  const { S, img, link, pStamp, stamp } = W;
  const pk = y * (S + 1) + x;
  if (pStamp[pk] === stamp) return;
  pStamp[pk] = stamp;
  const SS = S * S;
  // the 4 cells around the point (U outside the window)
  const a = x > 0 && y > 0 ? img[(y - 1) * S + x - 1] : U;
  const b = x < S && y > 0 ? img[(y - 1) * S + x] : U;
  const c = x > 0 && y < S ? img[y * S + x - 1] : U;
  const d = x < S && y < S ? img[y * S + x] : U;
  // N = V(x, y−1): a|b ; So = V(x, y): c|d ; W = H(x−1, y): a|c ; E = H(x, y): b|d
  const hasN = a !== U && b !== U && a !== b && x >= 1 && x < S && y >= 1;
  const hasS = c !== U && d !== U && c !== d && x >= 1 && x < S && y < S;
  const hasW = a !== U && c !== U && a !== c && x >= 1 && y >= 1 && y < S;
  const hasE = b !== U && d !== U && b !== d && x < S && y >= 1 && y < S;
  const cnt = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasW ? 1 : 0) + (hasE ? 1 : 0);
  if (cnt === 0) return;
  const nE = hasN ? (SS + (y - 1) * S + x) * 2 + 1 : -1;
  const sE = hasS ? (SS + y * S + x) * 2 : -1;
  const wE = hasW ? (y * S + x - 1) * 2 + 1 : -1;
  const eE = hasE ? (y * S + x) * 2 : -1;
  if (cnt === 1) { link[hasN ? nE : hasS ? sE : hasW ? wE : eE] = OPEN; return; }
  if (cnt === 2) {
    const p = hasN ? nE : hasS ? sE : wE;
    const q = hasE ? eE : hasW ? wE : sE;
    link[p] = q; link[q] = p; return;
  }
  if (cnt === 4 && a === d && b === c) {
    const at = (i, j) => (i < 0 || j < 0 || i >= S || j >= S ? U : img[j * S + i]);
    const df = (p, q) => (p === q ? 0 : 1);
    const wd1 = df(a, at(x, y - 2)) + df(a, at(x - 2, y)) + df(d, at(x - 1, y + 1)) + df(d, at(x + 1, y - 1));
    const wd2 = df(c, at(x - 2, y - 1)) + df(c, at(x, y + 1)) + df(b, at(x + 1, y)) + df(b, at(x - 1, y - 2));
    if (wd1 - wd2 >= o.saddleMargin && wd1 >= o.saddleMin) { // connect a–d
      link[nE] = eE; link[eE] = nE; link[wE] = sE; link[sE] = wE; return;
    }
    if (wd2 - wd1 >= o.saddleMargin && wd2 >= o.saddleMin) { // connect b–c
      link[nE] = wE; link[wE] = nE; link[eE] = sE; link[sE] = eE; return;
    }
    if (o.saddleWeak && wd1 !== wd2) {
      // weak evidence: follow it unless the saddle is checker-like (an
      // axis-adjacent lattice point is also a 2-material saddle)
      const sad = (px, py) => { const p = at(px - 1, py - 1), q = at(px, py - 1), r = at(px - 1, py), t = at(px, py); return p === t && q === r && p !== q && p !== U && q !== U; };
      let checker = sad(x + 1, y) || sad(x - 1, y) || sad(x, y + 1) || sad(x, y - 1);
      if (checker && o.checkerGroup > 0) {
        // only an extended checker (≥ checkerGroup connected saddle points
        // within the 7×7 lattice neighbourhood) counts as a deliberate pattern
        const seenL = new Uint8Array(49);
        const st = [24]; seenL[24] = 1;
        let cnt = 0;
        while (st.length) {
          const q = st.pop(); cnt++;
          const qx = x + (q % 7) - 3, qy = y + ((q / 7) | 0) - 3;
          for (let dir = 0; dir < 4; dir++) {
            const nx = qx + (dir === 0 ? 1 : dir === 1 ? -1 : 0), ny = qy + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
            const lx = nx - x + 3, ly = ny - y + 3;
            if (lx < 0 || ly < 0 || lx > 6 || ly > 6) continue;
            const li = ly * 7 + lx;
            if (seenL[li] || !sad(nx, ny)) continue;
            seenL[li] = 1; st.push(li);
          }
        }
        checker = cnt >= o.checkerGroup;
      }
      if (o.saddleChecker === false || !checker) {
        if (wd1 > wd2) { link[nE] = eE; link[eE] = nE; link[wE] = sE; link[sE] = wE; }
        else { link[nE] = wE; link[wE] = nE; link[eE] = sE; link[sE] = eE; }
        return;
      }
    }
  }
  if (hasN) link[nE] = PIN;
  if (hasS) link[sE] = PIN;
  if (hasW) link[wE] = PIN;
  if (hasE) link[eE] = PIN;
}
/** Lattice point at end e of crack id (window coords). */
function endPt(W, id, e) {
  const S = W.S, SS = S * S;
  const k = id >= SS ? 1 : 0, rem = id - k * SS, j = (rem / S) | 0, i = rem - j * S;
  return k === 0 ? [i + e, j] : [i, j + e];
}
function partner(W, id, e, o) {
  const S = W.S, SS = S * S;
  const k = id >= SS ? 1 : 0, rem = id - k * SS, j = (rem / S) | 0, i = rem - j * S;
  if (k === 0) resolvePoint(W, i + e, j, o); else resolvePoint(W, i, j + e, o);
  return W.link[id * 2 + e];
}
/** Chain through crack t into W.cr / W.cd (cracks in order, entering ends):
 *  returns { n, closed, k0 } (k0 = index of t). */
function chainThrough(W, t, o, maxLen = 400) {
  const { cf, cfd, cb, cbd, cr, cd } = W;
  let nf = 1;
  cf[0] = t; cfd[0] = 0;
  let closed = false;
  let cur = t * 2;
  for (let guard = 0; guard < maxLen; guard++) {
    const id = cur >> 1, e = cur & 1;
    const nx = partner(W, id, 1 - e, o);
    if (nx < 0) break;
    const nid = nx >> 1;
    if (nid === t) { closed = true; break; }
    cf[nf] = nid; cfd[nf] = nx & 1; nf++;
    cur = nx;
  }
  if (closed) { for (let k = 0; k < nf; k++) { cr[k] = cf[k]; cd[k] = cfd[k]; } return { n: nf, closed: true, k0: 0 }; }
  let nb = 0;
  let p = partner(W, t, 0, o);
  for (let guard = 0; p >= 0 && guard < maxLen; guard++) {
    const id = p >> 1, f = p & 1;
    cb[nb] = id; cbd[nb] = 1 - f; nb++;
    p = partner(W, id, 1 - f, o);
  }
  let n = 0;
  for (let k = nb - 1; k >= 0; k--) { cr[n] = cb[k]; cd[n] = cbd[k]; n++; }
  const k0 = n;
  for (let k = 0; k < nf; k++) { cr[n] = cf[k]; cd[n] = cfd[k]; n++; }
  return { n, closed: false, k0 };
}

// ------------------------------------------------------------ geometry helpers
/** Unit principal direction of [[sxx, sxy], [sxy, syy]] (+ − × ÷ √ only). */
export function principalDir(sxx, syy, sxy) {
  const h = (sxx - syy) / 2;
  const l = (sxx + syy) / 2 + Math.sqrt(h * h + sxy * sxy);
  let x, y;
  if (sxx >= syy) { x = l - syy; y = sxy; } else { x = sxy; y = l - sxx; }
  const nn = Math.sqrt(x * x + y * y);
  if (nn < 1e-12) return [1, 0];
  x /= nn; y /= nn;
  if (x < 0 || (x === 0 && y < 0)) { x = -x; y = -y; }
  return [x, y];
}
function solve3(A, b) {
  const M = [[A[0], A[1], A[2], b[0]], [A[3], A[4], A[5], b[1]], [A[6], A[7], A[8], b[2]]];
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    const t = M[c]; M[c] = M[p]; M[p] = t;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

// ------------------------------------------------------------ the fit
/** τ of crack t (window id) from the chain through it in this window. */
export function fitCrack(W, t, o) {
  const S = W.S, SS = S * S;
  const ch = chainThrough(W, t, o);
  const n = ch.n;
  const { cr, cd, dv, rS, rE, rD, rK, rL, cA, rO, pts } = W;
  // traversal direction code per crack: (dx+1)*3 + (dy+1)
  for (let k = 0; k < n; k++) {
    const id = cr[k], kd = id >= SS ? 1 : 0, sg = cd[k] === 0 ? 1 : -1;
    dv[k] = kd === 0 ? (sg + 1) * 3 + 1 : 3 + (sg + 1);
  }
  if (n <= 4 && oneCellArr(W, cr, n)) return 0;
  let Rn = 0;
  for (let k = 0; k < n; k++) {
    if (Rn > 0 && rD[Rn - 1] === dv[k]) rE[Rn - 1] = k;
    else { rS[Rn] = k; rE[Rn] = k; rD[Rn] = dv[k]; rK[Rn] = cr[k] >= SS ? 1 : 0; Rn++; }
  }
  for (let i = 0; i < Rn; i++) rL[i] = rE[i] - rS[i] + 1;
  if (ch.closed && Rn > 1 && rD[0] === rD[Rn - 1]) { const L = rL[0] + rL[Rn - 1]; rL[0] = L; rL[Rn - 1] = L; }
  let anyCorner = false;
  for (let i = 0; i < Rn; i++) {
    cA[i] = 0;
    const j = i + 1 < Rn ? i + 1 : (ch.closed ? 0 : -1);
    if (j < 0 || j === i) continue;
    if (ch.closed && i === Rn - 1 && rD[0] === rD[Rn - 1]) continue;
    if (rL[i] >= o.cornerRun && rL[j] >= o.cornerRun) { cA[i] = 1; anyCorner = true; }
  }
  if (ch.closed && n <= 4) return 0; // lone block: corners kept, τ = 0
  for (let i = 0; i < Rn; i++) for (let k = rS[i]; k <= rE[i]; k++) rO[k] = i;
  const k0 = ch.k0;
  const wrap = ch.closed && !anyCorner;
  let np = 0;
  const pushMid = (id, w) => {
    const kd = id >= SS ? 1 : 0, rem = id - kd * SS, j = (rem / S) | 0, i = rem - j * S;
    pts[np * 3] = kd === 0 ? i + 0.5 : i; pts[np * 3 + 1] = kd === 0 ? j : j + 0.5; pts[np * 3 + 2] = w; np++;
  };
  let lineCnt = 0, tLine = NaN;
  if (!wrap) {
    const i0 = rO[k0];
    let lo = i0, hi = i0;
    for (let m = 1; m <= o.maxRuns; m++) {
      const a = i0 - m, b = i0 + m;
      if (a < 0 || b >= Rn || cA[a] || cA[b - 1]) break;
      if (!isDss(rD, rK, rS, rE, a, b)) break;
      lo = a; hi = b;
    }
    let cnt = 0;
    for (let i = lo; i <= hi; i++) cnt += rE[i] - rS[i] + 1;
    if (cnt >= o.minLine && (hi - lo >= 2 || (o.longRun && lo === hi))) {
      np = 0;
      for (let i = lo; i <= hi; i++) for (let mm = rS[i]; mm <= rE[i]; mm++) pushMid(cr[mm], 1);
      tLine = solveTau(W, pts, np, true, cr[k0]);
      lineCnt = lo === hi ? 1e9 : cnt; // one axis-aligned run is exactly straight: never blend
    }
  }
  const blend = o.lineBlend ?? 0;
  let wLine = 0;
  if (!Number.isNaN(tLine)) wLine = blend > 0 ? Math.min(1, (lineCnt - o.minLine + 1) / blend) : 1;
  let tPar = 0;
  if (wLine < 1) {
    np = 0;
    const hq = o.hq;
    for (let off = -hq; off <= hq; off++) {
      let m = k0 + off;
      if (wrap) { if (Math.abs(off) * 2 >= n) continue; m = ((m % n) + n) % n; }
      else {
        if (m < 0 || m >= n) continue;
        let blocked = false;
        if (off > 0) { for (let q = k0 + 1; q <= m; q++) if (rO[q] !== rO[q - 1] && cA[rO[q - 1]]) { blocked = true; break; } }
        else for (let q = m + 1; q <= k0; q++) if (rO[q] !== rO[q - 1] && cA[rO[q - 1]]) { blocked = true; break; }
        if (blocked) continue;
      }
      pushMid(cr[m], 1 - Math.abs(off) / (hq + 1));
    }
    tPar = np < 3 ? 0 : solveTau(W, pts, np, false, cr[k0]);
  }
  const tt = wLine >= 1 ? tLine : wLine > 0 ? wLine * tLine + (1 - wLine) * tPar : tPar;
  return tt > o.tauMax ? o.tauMax : tt < -o.tauMax ? -o.tauMax : tt;
}
/** τ of crack t0 from a weighted TLS line (useLine) or a weighted parabola
 *  in the TLS frame, through np points (x, y, w). */
function solveTau(W, pts, np, useLine, t0) {
  const S = W.S, SS = S * S;
  if (np < 3) return 0;
  let sw = 0, mx = 0, my = 0;
  for (let q = 0; q < np; q++) { const w = pts[q * 3 + 2]; sw += w; mx += w * pts[q * 3]; my += w * pts[q * 3 + 1]; }
  mx /= sw; my /= sw;
  let sxx = 0, syy = 0, sxy = 0;
  for (let q = 0; q < np; q++) { const w = pts[q * 3 + 2], dx = pts[q * 3] - mx, dy = pts[q * 3 + 1] - my; sxx += w * dx * dx; syy += w * dy * dy; sxy += w * dx * dy; }
  const [tx, ty] = principalDir(sxx, syy, sxy);
  const nxl = -ty, nyl = tx;
  let c0 = 0, c1 = 0, c2 = 0;
  if (!useLine && np >= 5) {
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], bv = [0, 0, 0];
    for (let q = 0; q < np; q++) {
      const x = pts[q * 3], y = pts[q * 3 + 1], w = pts[q * 3 + 2];
      const uu = (x - mx) * tx + (y - my) * ty, vv = (x - mx) * nxl + (y - my) * nyl;
      const f2 = uu * uu;
      bv[0] += w * vv; bv[1] += w * uu * vv; bv[2] += w * f2 * vv;
      A[0] += w; A[1] += w * uu; A[2] += w * f2;
      A[3] += w * uu; A[4] += w * uu * uu; A[5] += w * uu * f2;
      A[6] += w * f2; A[7] += w * f2 * uu; A[8] += w * f2 * f2;
    }
    const sol = solve3(A, bv);
    if (sol) { c0 = sol[0]; c1 = sol[1]; c2 = sol[2]; }
  }
  const kd0 = t0 >= SS ? 1 : 0, rem0 = t0 - kd0 * SS, j0 = (rem0 / S) | 0, i0c = rem0 - j0 * S;
  const mxk = kd0 === 0 ? i0c + 0.5 : i0c, myk = kd0 === 0 ? j0 : j0 + 0.5;
  const nkx = kd0 === 0 ? 0 : 1, nky = kd0 === 0 ? 1 : 0;
  let tt = 0;
  const dvdt = nkx * nxl + nky * nyl, dudt = nkx * tx + nky * ty;
  for (let it = 0; it < 6; it++) {
    const px = mxk + tt * nkx, py = myk + tt * nky;
    const uu = (px - mx) * tx + (py - my) * ty, vv = (px - mx) * nxl + (py - my) * nyl;
    const g = vv - (c0 + c1 * uu + c2 * uu * uu);
    const dg = dvdt - (c1 + 2 * c2 * uu) * dudt;
    if (Math.abs(dg) < 1e-6) break;
    tt -= g / dg;
  }
  return tt;
}
function isDss(runD, runK, runS, runE, a, b) {
  let d1 = runD[a], d2 = NONE;
  const mins = [1e9, 1e9], maxs = [-1, -1], ones = [true, true];
  for (let i = a; i <= b; i++) {
    const dd = runD[i];
    if (dd !== d1) { if (d2 === NONE) d2 = dd; else if (dd !== d2) return false; }
    if (i > a && i < b) {
      const L = runE[i] - runS[i] + 1, k = runK[i];
      if (L < mins[k]) mins[k] = L;
      if (L > maxs[k]) maxs[k] = L;
      if (L !== 1) ones[k] = false;
    }
  }
  const ok = (k) => maxs[k] < 0 || maxs[k] - mins[k] <= 1;
  return (ones[0] && ok(1)) || (ones[1] && ok(0));
}
/** All n cracks of arr are edges of one cell. */
function oneCellArr(W, arr, n) {
  const S = W.S, SS = S * S;
  let c0 = -1, c1 = -1; // candidate cells
  for (let k = 0; k < n; k++) {
    const id = arr[k], kd = id >= SS ? 1 : 0, rem = id - kd * SS, j = (rem / S) | 0, i = rem - j * S;
    const p = j * S + i, q = kd === 0 ? (j - 1) * S + i : j * S + i - 1;
    if (k === 0) { c0 = p; c1 = q; continue; }
    if (c0 !== p && c0 !== q) c0 = -1;
    if (c1 !== p && c1 !== q) c1 = -1;
    if (c0 < 0 && c1 < 0) return false;
  }
  return true;
}

/** Is lattice point X (window coords) a kept corner of the chain through the
 *  link (c1 end e1) – (c2 end e2)? Runs of ≥ cornerRun on both sides, or a
 *  one-cell chain (lone block / checker rim). */
function keptCorner(W, c1, e1, c2, e2, o) {
  // direction of travel arriving at X along c1 (c1 traversed from 1−e1 to e1)
  const a1 = endPt(W, c1, 1 - e1), b1 = endPt(W, c1, e1);
  const d1 = (b1[0] - a1[0]) * 3 + (b1[1] - a1[1]);
  const a2 = endPt(W, c2, e2), b2 = endPt(W, c2, 1 - e2);
  const d2 = (b2[0] - a2[0]) * 3 + (b2[1] - a2[1]);
  // one-cell chain test (≤ 4 cracks around a single cell)
  const ch = chainThrough(W, c1, o, 6);
  if (ch.n <= 4 && oneCellArr(W, W.cr, ch.n)) return true;
  if (d1 === d2) return false;
  const need = o.cornerRun;
  // count straight run backward from X along c1, forward along c2
  let cnt = 1, cur = c1 * 2 + (1 - e1); // the far end of c1
  for (; cnt < need;) {
    const p = partner(W, cur >> 1, cur & 1, o);
    if (p < 0) break;
    const id = p >> 1, f = p & 1;
    const a = endPt(W, id, 1 - f), b = endPt(W, id, f);
    if ((b[0] - a[0]) * 3 + (b[1] - a[1]) !== d1) break;
    cnt++; cur = id * 2 + (1 - f);
  }
  if (cnt < need) return false;
  cnt = 1; cur = c2 * 2 + (1 - e2);
  for (; cnt < need;) {
    const p = partner(W, cur >> 1, cur & 1, o);
    if (p < 0) break;
    const id = p >> 1, f = p & 1;
    const a = endPt(W, id, f), b = endPt(W, id, 1 - f);
    if ((b[0] - a[0]) * 3 + (b[1] - a[1]) !== d2) break;
    cnt++; cur = id * 2 + (1 - f);
  }
  return cnt >= need;
}

// ------------------------------------------------------------ codes
// Perimeter parameter of the unit cell, p ∈ [0, 4): bottom (y=0) x 0→1,
// right (x=1) y 0→1, top (y=1) x 1→0, left (x=0) y 1→0. Quantised ×16.
const Q = 16;
export function perimPoint(p64) {
  const p = (p64 & 63) / Q;
  if (p < 1) return [p, 0];
  if (p < 2) return [1, p - 1];
  if (p < 3) return [3 - p, 1];
  return [0, 4 - p];
}

export const DEFAULTS = { R: 7, Wa: 2, hq: 6, cornerRun: 3, tauMax: 0.45, minLine: 9, maxRuns: 16, longRun: true, saddleMargin: 2, saddleMin: 3, saddleWeak: true, checkerGroup: 12, loneRound: false, lineBlend: 4, ownerSpan: 1 };

/** Compute every code a fragment of this chunk can need: blocks exposed
 *  toward d with in-plane coordinates in [inLo, inHi] and axis coordinate in
 *  [axLo, axHi] (what the fragment search can reach). Returns a flat list
 *  [x, y, z, d, w0, w1]* and stats. */
const SNAP = { img: new Int8Array(225 * 512), lvl: new Int32Array(225 * 512) };
export function computeCodes(P, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const R = o.R, S = 2 * R + 1, SS = S * S;
  const Wp = makeWindow(R), Wo = makeWindow(R);
  const inLo = o.inLo ?? -1, inHi = o.inHi ?? 32, axLo = o.axLo ?? -3, axHi = o.axHi ?? 34;
  const out = [];
  const stats = { surface: 0, coded: 0, passes: [0, 0, 0], overflow: 0, crackFits: 0, crackMiss: 0, windows: 0, ownerWindows: 0, tauFallback: 0 };
  // surface cells (solid, not sharp, exposed) in the box [−3, 34]³
  const cand = [];
  const { cm, expo, stride, off } = P;
  for (let y = axLo; y <= axHi; y++) for (let z = axLo; z <= axHi; z++) {
    let i = off + axLo * stride[0] + y * stride[1] + z * stride[2];
    for (let x = axLo; x <= axHi; x++, i++) {
      const c = cm[i];
      if (c === 0 || (c & 8) || expo[i] === 0) continue;
      cand.push(x, y, z, i);
    }
  }
  for (let d = 0; d < 6; d++) {
    const pl = plane(P, d);
    memoReset(P);
    const [a] = DIRS[d];
    const [ua, va] = UVA[a];
    const bit = pl.bit, SU = pl.SU, SV = pl.SV;
    const tau = new Map(); // crack key → τ
    const ckey = (u, v, L, kind) => (((u + 64) * 128 + (v + 64)) * 128 + (L + 64)) * 4 + kind;
    // ---- pass 1: blocks that need a code; fit their own (+u, +v) cracks in their window
    const coded = []; // [u, v, L] per window snapshot
    let snapImg = SNAP.img, snapLvl = SNAP.lvl, nSnap = 0;
    for (let q = 0; q < cand.length; q += 4) {
      const i = cand[q + 3];
      if (!(expo[i] & bit)) continue;
      const pos = [cand[q], cand[q + 1], cand[q + 2]];
      const u = pos[ua], v = pos[va], L = pos[a];
      if (u < inLo || u > inHi || v < inLo || v > inHi) continue;
      stats.surface++;
      const m0 = cm[i] & 7;
      let differs = false;
      for (let k = 0; k < 4 && !differs; k++) {
        const du = k === 0 ? 1 : k === 1 ? -1 : 0, dv = k === 2 ? 1 : k === 3 ? -1 : 0;
        const j = i + du * SU + dv * SV;
        const cj = cm[j];
        let mm;
        if (cj !== 0 && (expo[j] & bit)) mm = cj & 8 ? U : cj & 7; // same level (fast path)
        else {
          const l = findMemo(P, pl, u + du, v + dv, L, L - o.Wa, L + o.Wa);
          if (l === NONE) continue;
          mm = imgMat(cellAt(P, pl, u + du, v + dv, l));
        }
        if (mm !== U && mm !== m0) differs = true;
      }
      if (!differs) continue;
      stats.windows++;
      if (o.scanOnly) continue;
      const tf0 = o.phase ? performance.now() : 0;
      fillWindow(P, pl, Wp, u, v, L, o.Wa);
      if (o.phase) o.phase.fill += performance.now() - tf0;
      if (o.fillOnly) continue;
      const tf1 = o.phase ? performance.now() : 0;
      // own cracks: +u (kind 1, V(R+1, R)) and +v (kind 0, H(R, R+1))
      if (crackExists(Wp, 1, R + 1, R)) { tau.set(ckey(u, v, L, 1), fitCrack(Wp, SS + R * S + R + 1, o)); stats.crackFits++; }
      if (crackExists(Wp, 0, R, R + 1)) { tau.set(ckey(u, v, L, 0), fitCrack(Wp, (R + 1) * S + R, o)); stats.crackFits++; }
      coded.push(u, v, L);
      if ((nSnap + 1) * SS > snapImg.length) {
        const ni = new Int8Array(snapImg.length * 2), nl = new Int32Array(snapLvl.length * 2);
        ni.set(snapImg); nl.set(snapLvl); SNAP.img = snapImg = ni; SNAP.lvl = snapLvl = nl;
      }
      snapImg.set(Wp.img, nSnap * SS); snapLvl.set(Wp.lvl, nSnap * SS); nSnap++;
      if (o.phase) o.phase.fit1 += performance.now() - tf1;
    }
    const tp2 = o.phase ? performance.now() : 0;
    // ---- pass 2: assemble; owners outside the coded set get their own window.
    // A crack (O low, H high) is fitted in O's window if that window sees the
    // same crack, else in H's window (canonical fallback), else τ = 0.
    const fitOwned = (u, v, L, kind, mLow, mHigh, hu, hv, hL) => {
      const key = ckey(u, v, L, kind);
      let t = tau.get(key);
      if (t === undefined) {
        stats.ownerWindows++;
        fillWindow(P, pl, Wo, u, v, L, o.Wa);
        const id = kind === 1 ? SS + R * S + (R + 1) : (R + 1) * S + R;
        const lowM = Wo.img[R * S + R], highM = kind === 1 ? Wo.img[R * S + R + 1] : Wo.img[(R + 1) * S + R];
        if (lowM !== mLow || highM !== mHigh || !crackExists(Wo, kind, kind === 1 ? R + 1 : R, kind === 1 ? R : R + 1)) {
          t = NaN; stats.crackMiss++;
          if (o.missLog) o.missLog.push({ d, owner: [u, v, L], kind, want: [mLow, mHigh], got: [lowM, highM], ownerLvlNb: kind === 1 ? Wo.lvl[R * S + R + 1] : Wo.lvl[(R + 1) * S + R] });
        } else { t = fitCrack(Wo, id, o); stats.crackFits++; }
        tau.set(key, t);
      }
      if (!Number.isNaN(t)) return t;
      // canonical fallback: the high cell's window (H's −u / −v edge)
      const hkey = ckey(hu, hv, hL, kind + 2);
      let th = tau.get(hkey);
      if (th !== undefined) return th;
      stats.highWindows = (stats.highWindows ?? 0) + 1;
      fillWindow(P, pl, Wo, hu, hv, hL, o.Wa);
      const lowM = kind === 1 ? Wo.img[R * S + R - 1] : Wo.img[(R - 1) * S + R], highM = Wo.img[R * S + R];
      if (lowM === mLow && highM === mHigh && crackExists(Wo, kind, R, R)) {
        th = fitCrack(Wo, kind === 1 ? SS + R * S + R : R * S + R, o); stats.crackFits++;
      } else { th = NaN; stats.highMiss = (stats.highMiss ?? 0) + 1; }
      tau.set(hkey, th);
      return th;
    };
    for (let c = 0; c < coded.length / 3; c++) {
      const u = coded[c * 3], v = coded[c * 3 + 1], L = coded[c * 3 + 2];
      Wp.img.set(snapImg.subarray(c * SS, (c + 1) * SS)); Wp.lvl.set(snapLvl.subarray(c * SS, (c + 1) * SS));
      Wp.u0 = u; Wp.v0 = v; Wp.L0 = L;
      Wp.stamp++;
      const code = assemble(Wp, o, (ci, cj, kind) => {
        const oi = kind === 0 ? ci : ci - 1, oj = kind === 0 ? cj - 1 : cj;
        const ok = oj * S + oi;
        const hk = cj * S + ci;
        if (o.dLog) { const dl = Math.abs(Wp.lvl[ok] - L); o.dLog[Math.min(dl, 9)]++; }
        const t = fitOwned(u + oi - R, v + oj - R, Wp.lvl[ok], kind, Wp.img[ok], Wp.img[hk], u + ci - R, v + cj - R, Wp.lvl[hk]);
        if (Number.isNaN(t)) { stats.tauFallback++; return 0; }
        return t;
      }, stats);
      if (!code) continue;
      stats.coded++;
      const pos = [0, 0, 0];
      pos[a] = L; pos[ua] = u; pos[va] = v;
      out.push(pos[0], pos[1], pos[2], d, code[0], code[1]);
    }
    if (o.phase) o.phase.pass2 += performance.now() - tp2;
  }
  return { codes: out, stats };
}
export const blockKey = (d, x, y, z) => (((d * 128 + (x + 64)) * 128 + (y + 64)) * 128 + (z + 64));

/** Assemble the code of the window's centre cell. getTau(i, j, kind) → τ of
 *  that crack (window coords). Returns [w0, w1] or null (no passage). */
function assemble(W, o, getTau, stats) {
  const { R, S } = W;
  const SS = S * S;
  if (o.loneRound) {
    // a lone block: its 4 edges are cracks forming a closed 4-loop
    const top = R * S + R; // H(R, R): cells (R, R−1)|(R, R)
    if (crackExists(W, 0, R, R) && crackExists(W, 0, R, R + 1) && crackExists(W, 1, R, R) && crackExists(W, 1, R + 1, R)) {
      const ch = chainThrough(W, top, o, 6);
      if (ch.closed && ch.n === 4) {
        const nb = [W.img[(R - 1) * S + R], W.img[(R + 1) * S + R], W.img[R * S + R - 1], W.img[R * S + R + 1]];
        let best = nb[0], bc = 0;
        for (const m of nb) { let c = 0; for (const q of nb) if (q === m) c++; if (c > bc || (c === bc && m < best)) { best = m; bc = c; } }
        stats.lone = (stats.lone ?? 0) + 1;
        return [(3 | (best << 2)) >>> 0, 0];
      }
    }
  }
  const pieces = []; // polylines in cell frame: {pts: [[x,y]...], L, Rm, kinds...}
  const tauCache = new Map();
  const tauOf = (id) => {
    let t = tauCache.get(id);
    if (t === undefined) {
      const k = id >= SS ? 1 : 0, rem = id - k * SS, j = (rem / S) | 0, i = rem - j * S;
      t = getTau(i, j, k);
      tauCache.set(id, t);
    }
    return t;
  };
  // crossing of crack id, as an exact (base, τ) pair relative to the cell origin (R, R)
  const crossing = (id) => {
    const k = id >= SS ? 1 : 0, rem = id - k * SS, j = (rem / S) | 0, i = rem - j * S;
    return k === 0 ? { bx: i + 0.5 - R, by: j - R, ax: 1, t: tauOf(id) } : { bx: i - R, by: j + 0.5 - R, ax: 0, t: tauOf(id) };
  };
  const matsOf = (id) => { // [low cell material, high cell material]
    const k = id >= SS ? 1 : 0, rem = id - k * SS, j = (rem / S) | 0, i = rem - j * S;
    return k === 0 ? [W.img[(j - 1) * S + i], W.img[j * S + i]] : [W.img[j * S + i - 1], W.img[j * S + i]];
  };
  // early exit: every incident crack has τ = 0 and no turn at P's corners
  // cuts P (turn inside-quadrant = P) → all boundary pieces run along cell
  // edges → no passage
  {
    let trivial = true;
    for (let c = 0; c < 4 && trivial; c++) {
      const x = c & 1 ? R + 1 : R, y = c & 2 ? R + 1 : R;
      resolvePoint(W, x, y, o);
      const N = crackExists(W, 1, x, y - 1) ? SS + (y - 1) * S + x : -1;
      const So = crackExists(W, 1, x, y) ? SS + y * S + x : -1;
      const Wc = crackExists(W, 0, x - 1, y) ? y * S + x - 1 : -1;
      const E = crackExists(W, 0, x, y) ? y * S + x : -1;
      for (const id of [N, So, Wc, E]) if (id >= 0 && tauOf(id) !== 0) { trivial = false; break; }
      if (!trivial) break;
      // the turn whose inside quadrant is P at this corner: (R,R) S–E, (R+1,R) S–W, (R,R+1) N–E, (R+1,R+1) N–W
      const v1 = c & 2 ? N : So, h1 = c & 1 ? Wc : E;
      if (v1 >= 0 && h1 >= 0) {
        const ve = c & 2 ? v1 * 2 + 1 : v1 * 2, he = c & 1 ? h1 * 2 + 1 : h1 * 2;
        if (W.link[ve] === he) trivial = false;
      }
    }
    if (trivial) { stats.trivial = (stats.trivial ?? 0) + 1; return null; }
  }
  const seen = new Set();
  for (const [x, y] of [[R, R], [R + 1, R], [R, R + 1], [R + 1, R + 1]]) {
    resolvePoint(W, x, y, o);
    const ends = [];
    const N = crackExists(W, 1, x, y - 1) ? SS + (y - 1) * S + x : -1;
    const So = crackExists(W, 1, x, y) ? SS + y * S + x : -1;
    const Wc = crackExists(W, 0, x - 1, y) ? y * S + x - 1 : -1;
    const E = crackExists(W, 0, x, y) ? y * S + x : -1;
    if (N >= 0) ends.push(N * 2 + 1);
    if (So >= 0) ends.push(So * 2);
    if (Wc >= 0) ends.push(Wc * 2 + 1);
    if (E >= 0) ends.push(E * 2);
    for (const ce of ends) {
      const pe = W.link[ce];
      const pk = pe >= 0 ? Math.min(ce, pe) * 1e6 + Math.max(ce, pe) : ce * 1e6 + 999999;
      if (seen.has(pk)) continue;
      seen.add(pk);
      const c1 = ce >> 1, e1 = ce & 1;
      // orientation: travel along c1 toward X (from end 1−e1 to e1), then on
      const pts = [crossing(c1)];
      if (pe >= 0) {
        const c2 = pe >> 1, e2 = pe & 1;
        if (keptCorner(W, c1, e1, c2, e2, o)) pts.push({ px: x - R, py: y - R });
        pts.push(crossing(c2));
      } else if (pe === PIN) pts.push({ px: x - R, py: y - R });
      else continue; // open end (window border): never at the centre cell
      // materials left/right of the direction of travel along c1 (toward X)
      const a = endPt(W, c1, 1 - e1), b = endPt(W, c1, e1);
      const tx = b[0] - a[0], ty = b[1] - a[1];
      const [mLow, mHigh] = matsOf(c1);
      // crack normal n = (0,1) for H, (1,0) for V points from low to high cell;
      // left of travel = rotate (tx,ty) by +90° = (−ty, tx)
      const nx = c1 >= SS ? 1 : 0, ny = c1 >= SS ? 0 : 1;
      const leftHigh = -ty * nx + tx * ny > 0;
      pieces.push({ pts, L: leftHigh ? mHigh : mLow, Rm: leftHigh ? mLow : mHigh });
    }
  }
  // clip each piece's segments to the cell [0,1]² and join into passages
  const segs = [];
  for (const pc of pieces) {
    for (let k = 0; k + 1 < pc.pts.length; k++) {
      const s = clipSeg(pc.pts[k], pc.pts[k + 1]);
      if (s) segs.push({ ...s, L: pc.L, Rm: pc.Rm });
    }
  }
  if (segs.length === 0) return null;
  // join segments end to end (interior endpoints match exactly); a segment
  // may be traversed reversed (its left/right materials swap)
  const flipSeg = (g) => ({ a: g.b, b: g.a, aq: g.bq, bq: g.aq, aOnB: g.bOnB, bOnB: g.aOnB, L: g.Rm, Rm: g.L });
  const sameP = (p, q) => p[0] === q[0] && p[1] === q[1];
  const used = new Uint8Array(segs.length);
  const passes = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    let g = segs[i];
    if (!g.aOnB && g.bOnB) g = flipSeg(g);
    if (!g.aOnB) continue;
    used[i] = 1;
    const ps = { pts: [g.a, g.b], aq: g.aq, bq: g.bq, L: g.L, Rm: g.Rm };
    let cur = g, guard = 0;
    while (!cur.bOnB && guard++ < 16) {
      let nseg = null;
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        if (!segs[j].aOnB && sameP(segs[j].a, cur.b)) { nseg = segs[j]; used[j] = 1; break; }
        if (!segs[j].bOnB && sameP(segs[j].b, cur.b)) { nseg = flipSeg(segs[j]); used[j] = 1; break; }
      }
      if (!nseg) break;
      cur = nseg; ps.pts.push(cur.b); ps.bq = cur.bq;
    }
    if (cur.bOnB) passes.push(ps); else stats.openPass = (stats.openPass ?? 0) + 1;
  }
  // drop passages running along the cell boundary, and degenerate ones
  const keep = [];
  for (const p of passes) {
    if (p.aq === p.bq) continue;
    if (p.L === p.Rm) continue;
    let interior = false;
    for (const q of p.pts) if (q[0] > 1e-7 && q[0] < 1 - 1e-7 && q[1] > 1e-7 && q[1] < 1 - 1e-7) interior = true;
    if (!interior) {
      // straight chord between two boundary points: keep only if it is not along one edge
      const A = perimPoint(p.aq), B = perimPoint(p.bq);
      const alongEdge = (A[0] === B[0] && (A[0] === 0 || A[0] === 1)) || (A[1] === B[1] && (A[1] === 0 || A[1] === 1));
      if (alongEdge) continue;
    }
    keep.push(p);
  }
  if (keep.length === 0) return null;
  stats.passes[Math.min(2, keep.length)]++;
  if (keep.length > 2) {
    stats.overflow++;
    // keep the two passages that cut the most area
    keep.sort((p, q) => areaCut(q) - areaCut(p));
    keep.length = 2;
  }
  return encode(keep);
}
function areaCut(p) {
  // area on the smaller side of the chord polygon (shoelace with the shorter boundary arc approximated by the chord)
  const A = perimPoint(p.aq), B = perimPoint(p.bq);
  const pts = [A, ...p.pts.slice(1, -1), B];
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - a[1] * b[0]; }
  const chord = Math.sqrt((B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1]));
  return Math.abs(s) / 2 + chord * 0.01;
}

/** Liang–Barsky clip of segment p→q (vertices in exact form: lattice point
 *  {px, py} or crossing {bx, by, ax, t}) to the unit cell. Boundary hits are
 *  computed in the edge's own frame from the exact forms, so the two cells
 *  sharing an edge compute bit-identical values and quantise the same point. */
function vtx(p) { return p.px !== undefined ? [p.px, p.py] : (p.ax === 1 ? [p.bx, p.by + p.t] : [p.bx + p.t, p.by]); }
// coordinate c (0 = x, 1 = y) of vertex p in a frame whose origin is shifted by o
function coordIn(p, c, o) {
  if (p.px !== undefined) return (c === 0 ? p.px : p.py) - o;
  const base = (c === 0 ? p.bx : p.by) - o; // exact (half-integers)
  return (c === 0 ? p.ax === 0 : p.ax === 1) ? base + p.t : base;
}
function clipSeg(p, q) {
  const P0 = vtx(p), P1 = vtx(q);
  const dx = P1[0] - P0[0], dy = P1[1] - P0[1];
  let t0 = 0, t1 = 1, e0 = -1, e1 = -1;
  const PP = [-dx, dx, -dy, dy];
  const QQ = [P0[0], 1 - P0[0], P0[1], 1 - P0[1]];
  for (let i = 0; i < 4; i++) {
    if (PP[i] === 0) { if (QQ[i] < 0) return null; continue; }
    const t = QQ[i] / PP[i];
    if (PP[i] < 0) { if (t > t1) return null; if (t > t0) { t0 = t; e0 = i; } }
    else { if (t < t0) return null; if (t < t1) { t1 = t; e1 = i; } }
  }
  if (t1 - t0 < 1e-12) return null;
  const inside = (P) => P[0] > 0 && P[0] < 1 && P[1] > 0 && P[1] < 1;
  let a, b, aq = -1, bq = -1;
  if (e0 < 0) { if (inside(P0)) a = P0; else { aq = perimQ(P0); a = perimPoint(aq); } }
  else { aq = edgeHit(p, q, e0); a = perimPoint(aq); }
  if (e1 < 0) { if (inside(P1)) b = P1; else { bq = perimQ(P1); b = perimPoint(bq); } }
  else { bq = edgeHit(p, q, e1); b = perimPoint(bq); }
  return { a, b, aq, bq, aOnB: aq >= 0, bOnB: bq >= 0 };
}
// Hit of segment p→q with cell edge i (0: x=0, 1: x=1, 2: y=0, 3: y=1) in the
// edge frame, quantised to the perimeter code (×16).
function edgeHit(p, q, i) {
  const nc = i < 2 ? 0 : 1, ac = 1 - nc; // normal / along coordinate
  const o = i === 1 || i === 3 ? 1 : 0;
  const n0 = coordIn(p, nc, o), n1 = coordIn(q, nc, o);
  const a0 = coordIn(p, ac, 0), a1 = coordIn(q, ac, 0);
  const t = n0 / (n0 - n1);
  const along = a0 + t * (a1 - a0);
  const qq = Math.round((along < 0 ? 0 : along > 1 ? 1 : along) * Q);
  if (i === 0) return (48 + 16 - qq) % 64;
  if (i === 1) return 16 + qq;
  if (i === 2) return qq;
  return 32 + 16 - qq;
}
function perimQ(P) {
  const e = 1e-9;
  const x = Math.min(1, Math.max(0, P[0])), y = Math.min(1, Math.max(0, P[1]));
  if (y <= e) return Math.round(x * Q) % 64;
  if (x >= 1 - e) return 16 + Math.round(y * Q);
  if (y >= 1 - e) return (32 + Math.round((1 - x) * Q)) % 64;
  return (48 + Math.round((1 - y) * Q)) % 64;
}

// ---------------------------------------------------------------- packing
// passage: aq (6) | bq (6) | hasM (1) | mx (5) | my (5) | L (3) | R (3) = 29 bits
// word layout: w0 = count (2) | p0 bits 0..28 at bit 2 ; p1 split across w0 bit 31 and w1
function packPassage(p) {
  let M = null;
  const A = perimPoint(p.aq), B = perimPoint(p.bq);
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const dl = Math.sqrt(dx * dx + dy * dy);
  let best = 0.02;
  for (let k = 1; k + 1 < p.pts.length; k++) {
    const q = p.pts[k];
    const dd = Math.abs(dx * (q[1] - A[1]) - dy * (q[0] - A[0])) / (dl || 1);
    if (dd > best) { best = dd; M = q; }
  }
  let mx = 0, my = 0, has = 0;
  if (M) {
    has = 1;
    mx = Math.max(1, Math.min(31, Math.round(M[0] * 32)));
    my = Math.max(1, Math.min(31, Math.round(M[1] * 32)));
  }
  return (p.aq & 63) | ((p.bq & 63) << 6) | (has << 12) | (mx << 13) | (my << 18) | ((p.L & 7) << 23) | ((p.Rm & 7) << 26);
}
function encode(passes) {
  // orientation for 2 passages: passage 0 has passage 1 on its right; passage 1 has passage 0 on its left
  let ps = passes.map((p) => ({ ...p }));
  if (ps.length === 2) {
    const side = (p, q) => { // is q's chord midpoint left of p's polyline?
      const A = perimPoint(q.aq), B = perimPoint(q.bq);
      const mp = q.pts.length > 2 ? q.pts[1] : [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      return leftOfPoly(p, mp);
    };
    const flip = (p) => ({ ...p, aq: p.bq, bq: p.aq, pts: p.pts.slice().reverse(), L: p.Rm, Rm: p.L });
    if (side(ps[0], ps[1])) ps[0] = flip(ps[0]);
    if (!side(ps[1], ps[0])) ps[1] = flip(ps[1]);
  }
  const b0 = packPassage(ps[0]);
  const b1 = ps.length > 1 ? packPassage(ps[1]) : 0;
  // w0: count(2) | b0(29) | b1 bit 0 ; w1: b1 >> 1
  const w0 = (ps.length & 3) | (b0 << 2) | ((b1 & 1) << 31);
  const w1 = b1 >>> 1;
  return [w0 >>> 0, w1 >>> 0];
}
function leftOfPoly(p, pt) {
  const A = perimPoint(p.aq), B = perimPoint(p.bq);
  const verts = [A, ...p.pts.slice(1, -1), B];
  // crossing-number style: left side of an open polyline across the cell = region containing
  // the boundary arc from B back to A counterclockwise; use the GPU rule on a 2-segment approximation
  return polySide(verts, pt);
}
function polySide(verts, pt) {
  // left iff the point is left of the polyline (simple polyline crossing a convex cell)
  // implemented by winding of the closed loop polyline + ccw boundary arc B→A
  const loop = verts.slice();
  const A = verts[0], B = verts[verts.length - 1];
  const pa = perimParam(A), pb = perimParam(B);
  // walk the boundary counterclockwise (increasing p) from B to A, adding cell corners
  let p = pb;
  const target = pa <= pb ? pa + 4 : pa;
  for (let c = Math.floor(p) + 1; c < target; c++) loop.push(perimAt(c % 4));
  // point in polygon (even-odd)
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i][0], yi = loop[i][1], xj = loop[j][0], yj = loop[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function perimParam([x, y]) {
  const e = 1e-9;
  if (y <= e) return x;
  if (x >= 1 - e) return 1 + y;
  if (y >= 1 - e) return 2 + (1 - x);
  return 3 + (1 - y);
}
const perimAt = (c) => [[0, 0], [1, 0], [1, 1], [0, 1]][c];

// ---------------------------------------------------------------- decode / eval (GPU side)
export function decode(w0, w1) {
  const n = w0 & 3;
  if (n === 3) return [{ lone: true, other: (w0 >>> 2) & 7 }];
  const b0 = (w0 >>> 2) & 0x1fffffff;
  const b1 = ((w0 >>> 31) & 1) | ((w1 << 1) & 0x1ffffffe);
  const un = (b) => ({ aq: b & 63, bq: (b >>> 6) & 63, has: (b >>> 12) & 1, mx: (b >>> 13) & 31, my: (b >>> 18) & 31, L: (b >>> 23) & 7, R: (b >>> 26) & 7 });
  return n === 0 ? [] : n === 1 ? [un(b0)] : [un(b0), un(b1)];
}
/** GPU evaluation: material at (fx, fy) ∈ [0,1)² of a coded cell. Each
 *  passage is A–M–B (or A–B); left-of-polyline by two cross products (left
 *  turn at M: both; right turn: either). Two passages: left of P0 → L0,
 *  right of P1 → R1, else R0. */
export function evalCode(ps, fx, fy) {
  const left = (p) => {
    const A = perimPoint(p.aq), B = perimPoint(p.bq);
    if (!p.has) return (B[0] - A[0]) * (fy - A[1]) - (B[1] - A[1]) * (fx - A[0]) > 0;
    const M = [p.mx / 32, p.my / 32];
    const s1 = (M[0] - A[0]) * (fy - A[1]) - (M[1] - A[1]) * (fx - A[0]);
    const s2 = (B[0] - M[0]) * (fy - M[1]) - (B[1] - M[1]) * (fx - M[0]);
    const turn = (M[0] - A[0]) * (B[1] - M[1]) - (M[1] - A[1]) * (B[0] - M[0]);
    return turn > 0 ? s1 > 0 && s2 > 0 : s1 > 0 || s2 > 0;
  };
  if (ps.length === 1 && ps[0].lone) { const dx = fx - 0.5, dy = fy - 0.5; return dx * dx + dy * dy < 0.25 ? -2 : ps[0].other; }
  if (ps.length === 1) return left(ps[0]) ? ps[0].L : ps[0].R;
  if (left(ps[0])) return ps[0].L;
  if (!left(ps[1])) return ps[1].R;
  return ps[0].R;
}

// ---------------------------------------------------------------- GPU texel volume
/** Texel volume over [−M, 32+M)³ (r32uint): material | sharp | exposure |
 *  hasCode mask | code base; codes ordered by texel index, then direction. */
export function buildTexels(P, codes, M = 3) {
  const N = 32 + 2 * M;
  const tex = new Uint32Array(N * N * N);
  const { cm, expo, stride, off } = P;
  for (let y = -M; y < 32 + M; y++) for (let z = -M; z < 32 + M; z++) {
    let i = off + -M * stride[0] + y * stride[1] + z * stride[2];
    let k = ((y + M) * N + (z + M)) * N;
    for (let x = -M; x < 32 + M; x++, i++, k++) {
      const c = cm[i];
      if (c !== 0) tex[k] = c | (expo[i] << 4);
    }
  }
  const nC = codes.length / 6;
  const order = new Int32Array(nC);
  const tix = new Int32Array(nC);
  for (let c = 0; c < nC; c++) {
    order[c] = c;
    const x = codes[c * 6], y = codes[c * 6 + 1], z = codes[c * 6 + 2];
    tix[c] = (((y + M) * N + (z + M)) * N + (x + M)) * 8 + codes[c * 6 + 3];
  }
  order.sort((p, q) => tix[p] - tix[q]);
  const words = new Uint32Array(nC * 2);
  for (let r = 0; r < nC; r++) {
    const c = order[r];
    const k = tix[c] >> 3, d = tix[c] & 7;
    if (((tex[k] >>> 10) & 63) === 0) {
      if (r > 0xffff) throw new Error('code base overflow');
      tex[k] = (tex[k] | (r << 16)) >>> 0;
    }
    tex[k] = (tex[k] | (1 << (10 + d))) >>> 0;
    words[r * 2] = codes[c * 6 + 4]; words[r * 2 + 1] = codes[c * 6 + 5];
  }
  return { tex, N, M, codeWords: words };
}

const popc = (v) => { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
/** Fragment emulation over the texel volume + code buffer only. Returns the
 *  material, or −1 to keep the quad's own material (sharp / no surface). */
export function fragmentGpu(G, nrm, px, py, pz, W = 2, st = null, yBias = 1) {
  const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
  let a, s;
  if (ay >= yBias * (ax > az ? ax : az)) { a = 1; s = nrm[1] >= 0 ? 1 : -1; }
  else if (ax >= az) { a = 0; s = nrm[0] >= 0 ? 1 : -1; }
  else { a = 2; s = nrm[2] >= 0 ? 1 : -1; }
  const d = a * 2 + (s > 0 ? 0 : 1);
  const p = [px, py, pz];
  const [ua, va] = UVA[a];
  const cu = Math.floor(p[ua]), cv = Math.floor(p[va]);
  const Lp = Math.floor(p[a] - 0.5 * s);
  const { tex, N, M } = G;
  const at = (L) => {
    const q = [0, 0, 0]; q[a] = L; q[ua] = cu; q[va] = cv;
    const X = q[0] + M, Y = q[1] + M, Z = q[2] + M;
    if (st) st.fetch++;
    if (X < 0 || Y < 0 || Z < 0 || X >= N || Y >= N || Z >= N) { if (st) st.oob++; return 0; }
    return tex[(Y * N + Z) * N + X];
  };
  const bit = 1 << (4 + d);
  let L = Lp, t = at(L), found = false;
  if ((t & 7) !== 0) {
    if (t & bit) found = true;
    else for (let l = L + s; l >= Lp - W && l <= Lp + W; l += s) { t = at(l); if ((t & 7) === 0) break; if (t & bit) { found = true; break; } }
  } else {
    for (let l = L - s; l >= Lp - W && l <= Lp + W; l -= s) { t = at(l); if ((t & 7) !== 0) { found = true; break; } }
  }
  if (!found) { if (st) st.noSurface++; return -1; }
  if (t & 8) { if (st) st.sharp++; return -1; }
  const mask = (t >>> 10) & 63;
  if (!(mask & (1 << d))) return t & 7;
  const idx = (t >>> 16) + popc(mask & ((1 << d) - 1));
  if (st) { st.code++; st.fetch++; }
  const ps = decode(G.codeWords[idx * 2], G.codeWords[idx * 2 + 1]);
  const m = evalCode(ps, p[ua] - cu, p[va] - cv);
  return m === -2 ? t & 7 : m;
}

// ---------------------------------------------------------------- per-vertex skip bit
/** Projection axis/sign of a normal under the y-bias rule, as d (0..5). */
export function axisOf(nx, ny, nz, yBias = 0.5) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= yBias * (ax > az ? ax : az)) return ny >= 0 ? 2 : 3;
  if (ax >= az) return nx >= 0 ? 0 : 1;
  return nz >= 0 ? 4 : 5;
}
/** Per-vertex "no lookup needed" bit (flags bit 2 in production): a triangle
 *  is safe when (1) all three vertex normals select the same projection
 *  (the selection regions are convex cones, so every interpolated normal
 *  selects it too) and (2) for every column its projected bounding box covers
 *  and every level its search can start from, the search ends without a code
 *  and shows the triangle's own material (or finds nothing / a sharp block,
 *  which also keep the own material). A vertex is safe when all its triangles
 *  are; a fragment skips the lookup when the interpolated bit is 1. */
export function skipBits(G, m, yBias = 0.5, W = 2) {
  const bits = new Uint8Array(m.V).fill(1);
  const st = { fetch: 0, code: 0, noSurface: 0, sharp: 0, oob: 0 };
  let safeTris = 0;
  const p = [0, 0, 0];
  // memo of the search outcome per (d, column, start level) over the texel box:
  // −1 own material (no surface / sharp), −2 coded, else the block's material
  const NB = G.N, memo = new Int8Array(6 * NB * NB * NB).fill(-3);
  const outcome = (d, cu, cv, L, a, s, ua, va) => {
    const X = cu + G.M, Y = cv + G.M, Z = L + G.M;
    const inBox = X >= 0 && Y >= 0 && Z >= 0 && X < NB && Y < NB && Z < NB;
    const k = inBox ? ((d * NB + X) * NB + Y) * NB + Z : -1;
    if (k >= 0 && memo[k] !== -3) return memo[k];
    p[ua] = cu + 0.5; p[va] = cv + 0.5; p[a] = L + 0.5 + 0.5 * s;
    const nrm = [0, 0, 0]; nrm[a] = s;
    const c0 = st.code;
    const r = fragmentGpu(G, nrm, p[0], p[1], p[2], W, st, yBias);
    const out = st.code !== c0 ? -2 : r < 0 ? -1 : r;
    if (k >= 0) memo[k] = out;
    return out;
  };
  for (let t = 0; t < m.T; t++) {
    const vs = [m.tri[t * 3], m.tri[t * 3 + 1], m.tri[t * 3 + 2]];
    const own = m.mat[vs[0]];
    let safe = true;
    if (!(m.flags[vs[0]] & 1)) {
      const d = axisOf(m.nrm[vs[0] * 3], m.nrm[vs[0] * 3 + 1], m.nrm[vs[0] * 3 + 2], yBias);
      for (let k = 1; k < 3 && safe; k++) if (axisOf(m.nrm[vs[k] * 3], m.nrm[vs[k] * 3 + 1], m.nrm[vs[k] * 3 + 2], yBias) !== d) safe = false;
      if (safe) {
        const a = d >> 1, s = d & 1 ? -1 : 1, [ua, va] = UVA[a];
        let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, l0 = Infinity, l1 = -Infinity;
        for (const v of vs) {
          const pu = m.pos[v * 3 + ua], pv = m.pos[v * 3 + va], pa = m.pos[v * 3 + a];
          if (pu < u0) u0 = pu; if (pu > u1) u1 = pu; if (pv < v0) v0 = pv; if (pv > v1) v1 = pv;
          if (pa < l0) l0 = pa; if (pa > l1) l1 = pa;
        }
        // any normal selecting d gives the same search; one point per (column, start level)
        for (let cu = Math.floor(u0); cu <= Math.floor(u1) && safe; cu++) for (let cv = Math.floor(v0); cv <= Math.floor(v1) && safe; cv++) {
          for (let L = Math.floor(l0 - 0.5 * s); L <= Math.floor(l1 - 0.5 * s) && safe; L++) {
            const r = outcome(d, cu, cv, L, a, s, ua, va);
            if (r === -2 || (r >= 0 && r !== own)) safe = false;
          }
        }
      }
    }
    if (safe) safeTris++;
    else for (const v of vs) bits[v] = 0;
  }
  return { bits, safeTris };
}
