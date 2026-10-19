// Real-terrain material metrics on the 16 bench chunks (seed 1,1, no edits).
//   node work/gm/terrain-metrics.mjs a.mjs b.mjs …   ('hints' = production)
// Every approach meshes the SAME gm input (production GEN_MESH input at
// apron 10 + material planes, which non-gm approaches ignore).
//
// 1. SHORE: sand|grass boundary points in plan view (S = 16 per block)
//    against the EXACT contour H = SEA+2 of the generator's height field
//    (signed distance (2 − H)/|∇H| at the point, H evaluated in rendered
//    coordinates: the generator samples block b at its integer corner and
//    the mesher treats that sample as the block centre, so rendered point
//    p ↔ generator point p − ½). std / mean / max / high-pass std (point
//    minus the mean of its neighbours within ±1 block along the contour).
// 2. WIGGLE (rule-agnostic, every material pair): each plan boundary point's
//    residual from a least-squares line through the boundary points of the
//    same pair within radius 1.5 blocks; rms over all points. A block
//    staircase scores ≈ 0.15–0.2; a smooth curve ≈ 0.
// 3. AREA: displayed share per material over all triangles (3-D, sampled
//    on a barycentric grid), and the ratio to the block-face share.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
// boundary points between materials A and B whose two samples are on the
// same surface (top heights within 0.5): excludes occlusion edges
export function boundaryPoints(img, A, B, maxDy = 0.5) {
  const { W, H, S, x0, z0, mat, top } = img;
  const pts = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W - 1; i++) {
    const k = j * W + i, m1 = mat[k], m2 = mat[k + 1];
    if (((m1 === A && m2 === B) || (m1 === B && m2 === A)) && Math.abs(top[k] - top[k + 1]) < maxDy) pts.push([x0 + (i + 1) / S, z0 + (j + 0.5) / S]);
  }
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, m1 = mat[k], m2 = mat[k + W];
    if (((m1 === A && m2 === B) || (m1 === B && m2 === A)) && Math.abs(top[k] - top[k + W]) < maxDy) pts.push([x0 + (i + 0.5) / S, z0 + (j + 1) / S]);
  }
  return pts;
}
import { buildGenMeshInputGM } from './input.mjs';
import { heightAt } from './gen-gm.mjs';

export const BENCH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const NAMES = ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'r7'];
const S = 16;

export async function loadMods(list) {
  const out = [];
  for (const f of list) {
    if (f === 'hints') out.push({ name: 'hints', mesh: (r, s, c) => c.decodeMesh(c.meshRegion({ ...r, params: {} })) });
    else out.push(await import(pathToFileURL(resolve(f)).href));
  }
  return out;
}

const sd = (v) => { if (!v.length) return NaN; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

function shoreDist(c, p) {
  const wx = c[0] * 32 + p[0] - 0.5, wz = c[2] * 32 + p[1] - 0.5;
  const H = heightAt([1, 1], wx, wz);
  const e = 0.05;
  const gx = (heightAt([1, 1], wx + e, wz) - heightAt([1, 1], wx - e, wz)) / (2 * e);
  const gz = (heightAt([1, 1], wx, wz + e) - heightAt([1, 1], wx, wz - e)) / (2 * e);
  return (2 - H) / Math.hypot(gx, gz); // > 0 on the sand side
}

/** Residual of each point from a local least-squares PARABOLA (radius r,
 *  in the frame of the local principal direction): curvature is fitted,
 *  block-scale steps are not. Grid-hashed. */
function localLineResidual(pts, r = 1.5) {
  const cell = new Map();
  const key = (x, z) => `${Math.floor(x / r)},${Math.floor(z / r)}`;
  pts.forEach((p, i) => { const k = key(p[0], p[1]); (cell.get(k) ?? cell.set(k, []).get(k)).push(i); });
  const res = [];
  for (const p of pts) {
    const cx = Math.floor(p[0] / r), cz = Math.floor(p[1] / r);
    let n = 0, sx = 0, sz = 0;
    const nb = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const j of cell.get(`${cx + a},${cz + b}`) ?? []) {
        const q = pts[j];
        if ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 > r * r) continue;
        nb.push(q); sx += q[0]; sz += q[1]; n++;
      }
    }
    if (n < 12) continue;
    const mx = sx / n, mz = sz / n;
    let cxx = 0, czz = 0, cxz = 0;
    for (const q of nb) { cxx += (q[0] - mx) ** 2; czz += (q[1] - mz) ** 2; cxz += (q[0] - mx) * (q[1] - mz); }
    const th = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    const tx = Math.cos(th), tz = Math.sin(th), nxv = -tz, nzv = tx;
    const l1 = (cxx + czz) / 2 + Math.sqrt(((cxx - czz) / 2) ** 2 + cxz * cxz), l2 = (cxx + czz) / 2 - Math.sqrt(((cxx - czz) / 2) ** 2 + cxz * cxz);
    if (l2 > 0.25 * l1) continue; // junctions, specks: not a curve here
    // fit u = a + b t + c t² by least squares (normal equations)
    let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, U0 = 0, U1 = 0, U2 = 0;
    for (const q of nb) {
      const t = (q[0] - mx) * tx + (q[1] - mz) * tz, u = (q[0] - mx) * nxv + (q[1] - mz) * nzv;
      S0++; S1 += t; S2 += t * t; S3 += t * t * t; S4 += t * t * t * t; U0 += u; U1 += u * t; U2 += u * t * t;
    }
    const M = [[S0, S1, S2], [S1, S2, S3], [S2, S3, S4]], R = [U0, U1, U2];
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D0 = det(M);
    if (Math.abs(D0) < 1e-9) continue;
    const col = (k) => M.map((row, i) => row.map((v, j) => (j === k ? R[i] : v)));
    const a = det(col(0)) / D0, b = det(col(1)) / D0, c = det(col(2)) / D0;
    const t = (p[0] - mx) * tx + (p[1] - mz) * tz, u = (p[0] - mx) * nxv + (p[1] - mz) * nzv;
    res.push(u - (a + b * t + c * t * t));
  }
  return res;
}

export function shoreStats(mods, chunks = BENCH, apron = 10) {
  const out = mods.map(() => ({ d: [], hp: [] }));
  for (const c of chunks) {
    const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: apron }).input;
    mods.forEach((A, k) => {
      const m = A.mesh(inp, null, core);
      const img = rasterTopDown(m, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
      const pts = boundaryPoints(img, 1, 4).filter((p) => p[0] > 0.5 && p[0] < 31.5 && p[1] > 0.5 && p[1] < 31.5);
      if (!pts.length) return;
      const ds = pts.map((p) => shoreDist(c, p));
      out[k].d.push(...ds);
      // high-pass: minus mean distance of boundary points within radius 1
      for (let i = 0; i < pts.length; i++) {
        let s = 0, n = 0;
        for (let j = 0; j < pts.length; j++) {
          const dd = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
          if (dd <= 1) { s += ds[j]; n++; }
        }
        out[k].hp.push(ds[i] - s / n);
      }
    });
  }
  return out.map((o) => ({ n: o.d.length, mean: mean(o.d), std: sd(o.d), maxAbs: Math.max(...o.d.map(Math.abs)), hp: sd(o.hp) }));
}

export function wiggleAndArea(mods, chunks = BENCH, apron = 10) {
  const out = mods.map(() => ({ res: {}, area: new Float64Array(8), face: new Float64Array(8), plan: new Float64Array(8) }));
  const fn = [0, 0, 0, 0];
  const G = 6;
  for (const c of chunks) {
    const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: apron }).input;
    mods.forEach((A, k) => {
      const m = A.mesh(inp, null, core);
      const frag = A.fragment ? (a, i) => A.fragment(a, i, null) : null;
      const img = rasterTopDown(m, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: frag });
      for (let q = 0; q < img.mat.length; q++) if (img.top[q] > -Infinity) out[k].plan[img.mat[q]] += 1;
      for (const [a, b] of [[1, 2], [1, 4], [2, 3], [1, 3], [2, 4]]) {
        const pts = boundaryPoints(img, a, b).filter((p) => p[0] > 1 && p[0] < 31 && p[1] > 1 && p[1] < 31);
        const r = localLineResidual(pts);
        const key = `${NAMES[a]}|${NAMES[b]}`;
        (out[k].res[key] ??= []).push(...r);
      }
      // 3-D area
      const dim = m.attrDim ?? 0, tmp = new Float64Array(Math.max(1, dim));
      const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
      for (let t = 0; t < m.T; t++) {
        core.faceNormal(m, t, fn);
        const ar = fn[3];
        if (ar <= 0) continue;
        const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
        out[k].face[m.mat[a]] += ar;
        if (!frag) { out[k].area[m.mat[a]] += ar; continue; }
        let n = 0;
        const local = new Float64Array(8);
        for (let i = 0; i < G; i++) for (let j = 0; j < G - i; j++) {
          const w1 = (i + 1 / 3) / G, w2 = (j + 1 / 3) / G, w0 = 1 - w1 - w2;
          for (let d = 0; d < dim; d++) tmp[d] = w0 * m.attrs[a * dim + d] + w1 * m.attrs[b * dim + d] + w2 * m.attrs[cc * dim + d];
          info.t = t; info.a = a; info.b = b; info.c = cc; info.ownMat = m.mat[a]; info.quad = m.triQuad[t];
          info.x = w0 * m.pos[a * 3] + w1 * m.pos[b * 3] + w2 * m.pos[cc * 3];
          info.y = w0 * m.pos[a * 3 + 1] + w1 * m.pos[b * 3 + 1] + w2 * m.pos[cc * 3 + 1];
          info.z = w0 * m.pos[a * 3 + 2] + w1 * m.pos[b * 3 + 2] + w2 * m.pos[cc * 3 + 2];
          local[frag(tmp, info)] += 1; n++;
        }
        for (let q = 0; q < 8; q++) out[k].area[q] += (ar * local[q]) / n;
      }
    });
  }
  return out.map((o) => {
    const rms = {};
    let all = [];
    for (const [k, v] of Object.entries(o.res)) { if (v.length > 30) rms[k] = { n: v.length, rms: Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length) }; all = all.concat(v); }
    const tot = o.area.reduce((a, b) => a + b, 0), ftot = o.face.reduce((a, b) => a + b, 0), ptot = o.plan.reduce((a, b) => a + b, 0);
    const share = {};
    for (let q = 1; q < 8; q++) if (o.face[q] > 0 || o.area[q] > 0) share[NAMES[q]] = { pct: (100 * o.area[q]) / tot, vsFaces: o.face[q] > 0 ? o.area[q] / o.face[q] : NaN, facePct: (100 * o.face[q]) / ftot, planPct: (100 * o.plan[q]) / ptot };
    return { wiggle: rms, wiggleAll: all.length ? Math.sqrt(all.reduce((a, b) => a + b * b, 0) / all.length) : NaN, nAll: all.length, share };
  });
}

if (process.argv[1]?.endsWith('terrain-metrics.mjs')) {
  const mods = await loadMods(process.argv.slice(2));
  const sh = shoreStats(mods);
  const wa = wiggleAndArea(mods);
  const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  console.log(`| metric (16 bench chunks) | ${mods.map((m) => m.name).join(' | ')} |`);
  console.log(`|---|${mods.map(() => '---').join('|')}|`);
  console.log(`| shore vs exact H=2: std / max / mean (n) | ${sh.map((s) => `${f(s.std)} / ${f(s.maxAbs)} / ${f(s.mean)} (${s.n})`).join(' | ')} |`);
  console.log(`| shore high-pass std | ${sh.map((s) => f(s.hp)).join(' | ')} |`);
  const pairs = [...new Set(wa.flatMap((w) => Object.keys(w.wiggle)))];
  for (const p of pairs) console.log(`| wiggle ${p} rms (n) | ${wa.map((w) => (w.wiggle[p] ? `${f(w.wiggle[p].rms)} (${w.wiggle[p].n})` : '—')).join(' | ')} |`);
  console.log(`| wiggle all pairs rms | ${wa.map((w) => f(w.wiggleAll)).join(' | ')} |`);
  const mats = [...new Set(wa.flatMap((w) => Object.keys(w.share)))];
  for (const q of mats) console.log(`| 3-D area ${q} % (×block faces) | ${wa.map((w) => (w.share[q] ? `${f(w.share[q].pct, 2)} (×${f(w.share[q].vsFaces, 2)})` : '—')).join(' | ')} |`);
  for (const q of mats) console.log(`| plan (top surface) ${q} % | ${wa.map((w) => (w.share[q] ? f(w.share[q].planPct, 2) : '—')).join(' | ')} |`);
}
