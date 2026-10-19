// mx: per-fragment material from the block neighbourhood with pixel-art
// edge-directed rules (xBR family), evaluated in the plane of the surface.
//
// GPU model this file emulates (one texel fetch = one textureLoad):
//  - per chunk a 3-D texture (32 + 2·TA)³, TA = 3, of u16 texels:
//      bits 0-2 material id, bit 3 sharp,
//      bits 4-9 "exposed toward" +x −x +y −y +z −z (that neighbour is air)
//    cut from the mesher's region (GEN_MESH already holds apron 3).
//  - fragment: the dominant axis a (sign s) of the interpolated smooth
//    normal picks the plane. Lp = floor(p_a − ½s) is the cell half a block
//    into the solid. Every lookup stays inside the window Lp ± W along a and
//    ±2 in-plane around floor(p) — a function of the world position only,
//    so both chunks of a seam read the same texels and agree (apron 3).
//    The surface block under the fragment is the cell exposed toward s
//    nearest Lp; the 21-cell xBR neighbourhood is gathered the same way
//    (surface following, ring 2 chained from ring 1).
//  - the rule set decides the material from the 21 cells and the in-plane
//    fraction of p. The JS caches the decision per (block, window); fetch
//    counts are accumulated as if every fragment did the full lookup.

export const U = 15; // no surface block found ("unknown"); never shown

const DIRBIT = (a, s) => 1 << (4 + 2 * a + (s > 0 ? 0 : 1));
// in-plane axes per dominant axis: a=0 → (z, y); a=1 → (x, z); a=2 → (x, y)
export const UV = [[2, 1], [0, 2], [0, 1]];

export function buildVolume(region, ta) {
  const N = 32 + 2 * ta;
  const vol = new Uint16Array(N * N * N);
  const { nx, nz, apron, blocks } = region;
  if (apron < ta + 1) throw new Error(`region apron ${apron} < texture apron ${ta} + 1`);
  const SY = nx * nz, SZ = nx;
  const o = apron - ta; // region index of texture cell 0
  const solid = (i) => (blocks[i] & 0xff) !== 0;
  let k = 0;
  for (let Y = 0; Y < N; Y++) for (let Z = 0; Z < N; Z++) {
    let i = (Y + o) * SY + (Z + o) * SZ + o;
    for (let X = 0; X < N; X++, i++, k++) {
      const v = blocks[i];
      const m = v & 0xff;
      if (m === 0) continue;
      let t = (m & 7) | (v & 256 ? 8 : 0);
      if (!solid(i + 1)) t |= 16;
      if (!solid(i - 1)) t |= 32;
      if (!solid(i + SY)) t |= 64;
      if (!solid(i - SY)) t |= 128;
      if (!solid(i + SZ)) t |= 256;
      if (!solid(i - SZ)) t |= 512;
      vol[k] = t;
    }
  }
  return { vol, N, ta };
}

/** Lookup context: one per mesh. Counts texel fetches (GPU cost model). */
export function makeCtx(volume, opts = {}) {
  return {
    ...volume,
    W: opts.W ?? 2, // axis window half-width around Lp
    fetches: 0,
    oob: 0,
    cache: new Map(),
    stats: { frags: 0, fetchFull: 0, fetchEarly: 0, early: 0, noSurface: 0, sharp: 0 },
  };
}

function tex(ctx, x, y, z) {
  ctx.fetches++;
  const X = x + ctx.ta, Y = y + ctx.ta, Z = z + ctx.ta, N = ctx.N;
  if (X < 0 || Y < 0 || Z < 0 || X >= N || Y >= N || Z >= N) { ctx.oob++; return 0; }
  return ctx.vol[(Y * N + Z) * N + X];
}

const P = [0, 0, 0];
function texA(ctx, a, L, cu, cv) {
  const [ua, va] = UV[a];
  P[a] = L; P[ua] = cu; P[va] = cv;
  return tex(ctx, P[0], P[1], P[2]);
}

/** Surface block exposed toward (a, s) in column (cu, cv), starting at
 *  level L and staying within [lo, hi]. Returns [level, texel] or null. */
export function findSurface(ctx, a, s, cu, cv, L, lo, hi) {
  const bit = DIRBIT(a, s);
  if (L < lo) L = lo; else if (L > hi) L = hi;
  let t = texA(ctx, a, L, cu, cv);
  if ((t & 7) !== 0) {
    if (t & bit) return [L, t];
    for (let l = L + s; l >= lo && l <= hi; l += s) { // outward
      t = texA(ctx, a, l, cu, cv);
      if ((t & 7) === 0) return null;
      if (t & bit) return [l, t];
    }
    return null;
  }
  for (let l = L - s; l >= lo && l <= hi; l -= s) { // inward
    t = texA(ctx, a, l, cu, cv);
    if ((t & 7) !== 0) return [l, t]; // the cell outward of it is air → exposed
  }
  return null;
}

// 5×5 minus corners, index (dy+2)*5 + (dx+2); ring 1 first so ring 2 can chain
const RING1 = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const RING2 = [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]];
export const IDX = (dx, dy) => (dy + 2) * 5 + (dx + 2);

/** Material code of a texel for the rule set: material, or U for sharp
 *  blocks (sharp blocks neither bleed into neighbours nor get cut). */
const matOf = (t, sharpU) => (sharpU && (t & 8) ? U : t & 7);

/** Gather the 21-cell surface neighbourhood of the surface block at
 *  (cu, cv, L) inside the axis window [lo, hi]. */
export function gather(ctx, a, s, cu, cv, L, tC, lo, hi, opts) {
  const sharpU = opts.sharpAsUnknown !== false;
  const nb = new Int8Array(25).fill(U);
  const lvl = new Int32Array(25);
  nb[12] = matOf(tC, sharpU);
  lvl[12] = L;
  const g0 = ctx.fetches;
  let edgeF = 0;
  for (let j = 0; j < 8; j++) {
    const [dx, dy] = RING1[j];
    const r = findSurface(ctx, a, s, cu + dx, cv + dy, L, lo, hi);
    const k = IDX(dx, dy);
    if (r) { nb[k] = matOf(r[1], sharpU); lvl[k] = r[0]; } else { nb[k] = U; lvl[k] = L; }
    if (j === 3) edgeF = ctx.fetches - g0;
  }
  for (const [dx, dy] of RING2) {
    const ix = Math.max(-1, Math.min(1, dx)), iy = Math.max(-1, Math.min(1, dy));
    const r = findSurface(ctx, a, s, cu + dx, cv + dy, lvl[IDX(ix, iy)], lo, hi);
    if (r) nb[IDX(dx, dy)] = matOf(r[1], sharpU);
  }
  return { nb, edgeF, full: ctx.fetches - g0 };
}

// ---------------------------------------------------------------- xBR
// Hyllian's xBR (noblend), categorical distance df = (p ≠ q). Frames per
// corner k = BR, TR, TL, BL (shader component order x, y, z, w); lv3 adds
// g0, d0, c1, b1 (one step further out along the shallow/steep edge).
const FR = [
  { b: [0, -1], c: [1, -1], d: [-1, 0], f: [1, 0], g: [-1, 1], h: [0, 1], i: [1, 1], i4: [2, 1], i5: [1, 2], h5: [0, 2], f4: [2, 0], g0: [-2, 1], d0: [-2, 0], c1: [1, -2], b1: [0, -2] },
  { b: [-1, 0], c: [-1, -1], d: [0, 1], f: [0, -1], g: [1, 1], h: [1, 0], i: [1, -1], i4: [1, -2], i5: [2, -1], h5: [2, 0], f4: [0, -2], g0: [1, 2], d0: [0, 2], c1: [-2, -1], b1: [-2, 0] },
  { b: [0, 1], c: [-1, 1], d: [1, 0], f: [-1, 0], g: [1, -1], h: [0, -1], i: [-1, -1], i4: [-2, -1], i5: [-1, -2], h5: [0, -2], f4: [-2, 0], g0: [2, -1], d0: [2, 0], c1: [-1, 2], b1: [0, 2] },
  { b: [1, 0], c: [1, 1], d: [0, -1], f: [0, 1], g: [-1, -1], h: [-1, 0], i: [-1, 1], i4: [-1, 2], i5: [-2, 1], h5: [-2, 0], f4: [0, 2], g0: [-1, -2], d0: [0, -2], c1: [2, 1], b1: [2, 0] },
].map((fr) => Object.fromEntries(Object.entries(fr).map(([k, [dx, dy]]) => [k, IDX(dx, dy)])));

/** Per-corner decisions → Int16Array(4): bit0 edr, bit1 left (30°), bit2 up
 *  (60°), bit3 left3 (15°), bit4 up3 (75°), bits 5-8 replacement material.
 *  opts: corner 'A' | 'B' | 'C', lv3 bool. */
export function xbrDecide(nb, { corner = 'C', lv3 = false } = {}) {
  const e = nb[12];
  const code = new Int16Array(4);
  const df = (p, q) => (p === q ? 0 : 1);
  for (let k = 0; k < 4; k++) {
    const F = FR[k];
    const b = nb[F.b], c = nb[F.c], d = nb[F.d], f = nb[F.f], g = nb[F.g], h = nb[F.h], i = nb[F.i];
    const i4 = nb[F.i4], i5 = nb[F.i5], h5 = nb[F.h5], f4 = nb[F.f4];
    const r0 = e !== f && e !== h;
    if (!r0) continue;
    let r1;
    if (corner === 'A') r1 = true;
    else if (corner === 'B') r1 = (f !== b && h !== d) || (e === i && f !== i4 && h !== i5) || e === g || e === c;
    else r1 = (f !== b && f !== c) || (h !== d && h !== g) || (e === i && ((f !== f4 && f !== i4) || (h !== h5 && h !== i5))) || e === g || e === c;
    if (!r1) continue;
    const wd1 = df(e, c) + df(e, g) + df(i, h5) + df(i, f4) + 4 * df(h, f);
    const wd2 = df(h, d) + df(h, i5) + df(f, i4) + df(f, b) + 4 * df(e, i);
    if (!(wd1 < wd2)) continue;
    const edrL = 2 * df(f, g) <= df(h, c) && e !== g && d !== g;
    const edrU = df(f, g) >= 2 * df(h, c) && e !== c && b !== c;
    let L3 = false, U3 = false;
    if (lv3) {
      L3 = edrL && g === nb[F.g0] && nb[F.d0] !== nb[F.g0];
      U3 = edrU && c === nb[F.c1] && nb[F.b1] !== nb[F.c1];
    }
    let rep = df(e, f) <= df(e, h) ? f : h;
    if (rep === U) rep = rep === f ? h : f;
    if (rep === U) continue;
    code[k] = 1 | (edrL ? 2 : 0) | (edrU ? 4 : 0) | (L3 ? 8 : 0) | (U3 ? 16 : 0) | (rep << 5);
  }
  return code;
}

// noblend line tests (shader constants)
const AO = [1, -1, -1, 1], BO = [1, 1, -1, -1], CO = [1.5, 0.5, -0.5, 0.5];
const AX = [1, -1, -1, 1], BX = [0.5, 2, -0.5, -2], CX = [1, 1, -0.5, 0];
const AY = [1, -1, -1, 1], BY = [2, 0.5, -2, -0.5], CY = [2, 0, -1, 0.5];
const AZ = [6, -2, -6, 2], BZ = [2, 6, -2, -6], CZ = [5, 3, -3, -1];
const AW = [2, -6, -2, 6], BW = [6, 2, -6, -2], CW = [5, -1, -3, 3];

/** Material at in-pixel position (fx, fy) ∈ [0,1)² for a decision code. */
export function xbrEval(code, e, fx, fy) {
  for (let k = 0; k < 4; k++) {
    const ck = code[k];
    if (!(ck & 1)) continue;
    if (AO[k] * fy + BO[k] * fx > CO[k] ||
        ((ck & 2) && AX[k] * fy + BX[k] * fx > CX[k]) ||
        ((ck & 4) && AY[k] * fy + BY[k] * fx > CY[k]) ||
        ((ck & 8) && AZ[k] * fy + BZ[k] * fx > CZ[k]) ||
        ((ck & 16) && AW[k] * fy + BW[k] * fx > CW[k])) return ck >> 5;
  }
  return e;
}

// ---------------------------------------------------------------- fragment
/** Dominant axis/sign of a vector (ties prefer y, then x). */
export function dominant(n0, n1, n2) {
  const ax = Math.abs(n0), ay = Math.abs(n1), az = Math.abs(n2);
  if (ay >= ax && ay >= az) return [1, n1 >= 0 ? 1 : -1];
  if (ax >= az) return [0, n0 >= 0 ? 1 : -1];
  return [2, n2 >= 0 ? 1 : -1];
}

const pp = [0, 0, 0];
/** Per-fragment evaluation. decide(nb) → code; evalc(code, e, fx, fy, ent). */
export function shade(ctx, attrs, info, opts, decide, evalc) {
  const st = ctx.stats;
  st.frags++;
  if (opts.flags && (opts.flags[info.a] & 1)) { st.sharp++; return info.ownMat; }
  const [a, s] = dominant(attrs[0], attrs[1], attrs[2]);
  pp[0] = info.x; pp[1] = info.y; pp[2] = info.z;
  const [ua, va] = UV[a];
  const cu = Math.floor(pp[ua]), cv = Math.floor(pp[va]);
  const Lp = Math.floor(pp[a] - 0.5 * s);
  const lo = Lp - ctx.W, hi = Lp + ctx.W;
  const f0 = ctx.fetches;
  const r = findSurface(ctx, a, s, cu, cv, Lp, lo, hi);
  const locF = ctx.fetches - f0;
  ctx.fetches = f0;
  if (!r) { st.noSurface++; st.fetchFull += locF; st.fetchEarly += locF; return info.ownMat; }
  const [L, t] = r;
  if (opts.sharpAsUnknown !== false && (t & 8)) { st.sharp++; st.fetchFull += locF; st.fetchEarly += locF; return info.ownMat; }
  const key = (((((a * 2 + (s > 0 ? 0 : 1)) * 128 + (cu + 32)) * 128 + (cv + 32)) * 128 + (L + 32)) * 128 + (Lp + 32));
  let ent = ctx.cache.get(key);
  if (!ent) {
    const g0 = ctx.fetches;
    const { nb, edgeF, full } = gather(ctx, a, s, cu, cv, L, t, lo, hi, opts);
    ctx.fetches = g0;
    // early-out: the 4 edge neighbours equal the centre → no corner fires
    const early = nb[IDX(0, -1)] === nb[12] && nb[IDX(-1, 0)] === nb[12] && nb[IDX(1, 0)] === nb[12] && nb[IDX(0, 1)] === nb[12];
    ent = { code: early ? null : decide(nb, { a, s, cu, cv, L }, ctx), e: nb[12], full, edgeF, early, nb };
    ctx.cache.set(key, ent);
  }
  st.fetchFull += locF + ent.full;
  st.fetchEarly += locF + (ent.early ? ent.edgeF : ent.full);
  if (ent.early) st.early++;
  const m = ent.early ? ent.e : evalc(ent.code, ent.e, pp[ua] - cu, pp[va] - cv, ent);
  return m === U ? info.ownMat : m;
}

// ---------------------------------------------------------------- module glue
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const WORK = dirname(fileURLToPath(import.meta.url));

/** Build an approach: hints geometry underneath, a volume with apron `ta`,
 *  normals as the interpolated attribute, and a fragment using decide/eval. */
export function makeApproach({ name, ta = 3, W = 2, cpuTa = 0, decide, evalc, opts = {}, params = {}, prepare = null }) {
  let CUR = null;
  const log = [];
  const flush = () => {
    if (CUR && CUR.ctx.stats.frags > 0) {
      const s = CUR.ctx.stats;
      log.push({ label: CUR.label, frags: s.frags, fetchFull: +(s.fetchFull / s.frags).toFixed(2), fetchEarly: +(s.fetchEarly / s.frags).toFixed(2), earlyFrac: +(s.early / s.frags).toFixed(3), noSurface: +(s.noSurface / s.frags).toFixed(4), sharp: s.sharp, oob: CUR.ctx.oob, cacheEntries: CUR.ctx.cache.size, prepMs: CUR.prepMs });
    }
  };
  // Opt-in (MX_STATS=1) since recording, as in approaches/mx-codes.mjs.
  if (process.env.MX_STATS) process.on('exit', () => {
    flush();
    try {
      mkdirSync(join(WORK, 'stats'), { recursive: true });
      const tool = process.argv[1].split('/').pop().replace('.mjs', '');
      writeFileSync(join(WORK, 'stats', `${name}-${tool}.json`), JSON.stringify(log, null, 1));
    } catch { /* ignore */ }
  });
  let n = 0;
  return {
    mesh(region, scene, core) {
      flush();
      const m = core.decodeMesh(core.meshRegion({ ...region, params }));
      const t0 = performance.now();
      const vol = buildVolume(region, ta);
      const ctx = makeCtx(vol, { W });
      if (cpuTa > 0) ctx.cpu = makeCtx(buildVolume(region, cpuTa), { W });
      const extra = prepare ? prepare(ctx, region, m) : null;
      const prepMs = performance.now() - t0;
      m.attrs = Float64Array.from(m.nrm);
      m.attrDim = 3;
      CUR = { ctx, extra, flags: m.flags, label: scene?.name ?? `bench-${n}`, prepMs };
      n++;
      m.mx = { textureBytes: vol.N ** 3 * 2, N: vol.N };
      return m;
    },
    fragment(attrs, info) {
      return shade(CUR.ctx, attrs, info, { ...opts, flags: CUR.flags, extra: CUR.extra }, decide, evalc);
    },
  };
}

/** CPU side: a (2R+1)² surface-followed window around the surface block
 *  (cu, cv, L), chained ring by ring from the centre, axis range [lo, hi]. */
export function gatherWindow(cctx, a, s, cu, cv, L, R, lo, hi, sharpAsUnknown = true) {
  const S = 2 * R + 1;
  const img = new Int8Array(S * S).fill(U);
  const lvl = new Int32Array(S * S);
  const found = new Uint8Array(S * S);
  const c0 = findSurface(cctx, a, s, cu, cv, L, lo, hi);
  const k0 = R * S + R;
  if (!c0) return img;
  img[k0] = matOf(c0[1], sharpAsUnknown); lvl[k0] = c0[0]; found[k0] = 1;
  for (let ring = 1; ring <= R; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const ix = Math.abs(dx) === ring ? dx - Math.sign(dx) : dx;
      const iy = Math.abs(dy) === ring ? dy - Math.sign(dy) : dy;
      const kin = (iy + R) * S + (ix + R);
      const start = found[kin] ? lvl[kin] : L;
      const r = findSurface(cctx, a, s, cu + dx, cv + dy, start, lo, hi);
      const k = (dy + R) * S + (dx + R);
      if (r) { img[k] = matOf(r[1], sharpAsUnknown); lvl[k] = r[0]; found[k] = 1; } else lvl[k] = start;
    }
  }
  return img;
}
