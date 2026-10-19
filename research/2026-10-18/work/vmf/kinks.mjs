#!/usr/bin/env node
// vmf: exact boundary polylines of a 2-material field approach (plan view)
// and their turning angles ("kinks"). For each up-facing triangle, the
// displayed boundary between its own material and the other material is the
// zero set of the linearly interpolated r_other: one straight segment per
// triangle. Segments are chained across triangles; the turning angle at each
// joint is measured. A smooth curve of radius r sampled at segment length L
// turns ≈ L/r per joint; a straight ideal line should turn 0.
//   node work/vmf/kinks.mjs approaches/mf-iso.mjs [--scenes a,b] [--harness]
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { ADV_SCENES } from './adv-scenes.mjs';
import { loadApproach } from './lib.mjs';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const A = await loadApproach(args[0]);
const want = (opt('--scenes') ?? 'edge-1:2,edge-1:3,edge-1:5,edge-1:8,edge-1:1,disc-r2.4,disc-r4.3,disc-r7.6,line1-1:1,line1-1:2,hill-edge-1:1,hill-edge-1:2,hill-line1-1:1,hill-line1-1:2,flat-line1-1:1').split(',');
const all = [...MATERIAL_SCENES.map((s) => ({ ...s, win: s.window })), ...ADV_SCENES];
const DEG = 180 / Math.PI;
export function boundarySegments(mesh, M1, M2, win) {
  const segs = [];
  const { pos, tri, T, attrs, attrDim: D } = mesh;
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const area = (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]) - (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]);
    if (area >= -1e-12) continue; // up-facing only (plan)
    const own = mesh.mat[a];
    if (own !== M1 && own !== M2) continue;
    const other = own === M1 ? M2 : M1;
    const f = [attrs[a * D + other], attrs[b * D + other], attrs[c * D + other]];
    const vs = [a, b, c];
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const i = e, j = (e + 1) % 3;
      if ((f[i] > 0) === (f[j] > 0)) continue;
      const s = f[i] / (f[i] - f[j]);
      pts.push([pos[vs[i] * 3] + s * (pos[vs[j] * 3] - pos[vs[i] * 3]), pos[vs[i] * 3 + 2] + s * (pos[vs[j] * 3 + 2] - pos[vs[i] * 3 + 2])]);
    }
    if (pts.length !== 2) continue;
    const mx = (pts[0][0] + pts[1][0]) / 2, mz = (pts[0][1] + pts[1][1]) / 2;
    if (win && (mx < win[0] || mx > win[2] || mz < win[1] || mz > win[3])) continue;
    segs.push(pts);
  }
  return segs;
}
export function chain(segs) {
  const key = (p) => `${Math.round(p[0] * 4096)},${Math.round(p[1] * 4096)}`;
  const ends = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); (ends.get(k) ?? ends.set(k, []).get(k)).push([i, e]); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let i0 = 0; i0 < segs.length; i0++) {
    if (used[i0]) continue;
    used[i0] = 1;
    let pl = [segs[i0][0], segs[i0][1]];
    for (const dir of [1, 0]) { // extend forward from the end, then backward from the start
      for (;;) {
        const tip = dir ? pl[pl.length - 1] : pl[0];
        const cand = (ends.get(key(tip)) ?? []).filter(([j]) => !used[j]);
        if (cand.length !== 1) break;
        const [j, e] = cand[0];
        used[j] = 1;
        const nxt = segs[j][1 - e];
        if (dir) pl.push(nxt); else pl.unshift(nxt);
      }
    }
    lines.push(pl);
  }
  return lines;
}
export function turning(lines, minLen = 0.02) {
  const turns = [], lens = [];
  for (const pl0 of lines) {
    // drop near-zero segments (merge points closer than minLen)
    const pl = [pl0[0]];
    for (const p of pl0.slice(1)) if (Math.hypot(p[0] - pl[pl.length - 1][0], p[1] - pl[pl.length - 1][1]) >= minLen) pl.push(p);
    for (let k = 1; k < pl.length; k++) lens.push(Math.hypot(pl[k][0] - pl[k - 1][0], pl[k][1] - pl[k - 1][1]));
    for (let k = 1; k + 1 < pl.length; k++) {
      const u = [pl[k][0] - pl[k - 1][0], pl[k][1] - pl[k - 1][1]], v = [pl[k + 1][0] - pl[k][0], pl[k + 1][1] - pl[k][1]];
      const c = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v));
      turns.push(Math.acos(Math.max(-1, Math.min(1, c))) * DEG);
    }
  }
  return { turns, lens };
}
const pct = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
if (process.argv[1].endsWith('kinks.mjs')) {
  console.log(`${A.name}: boundary polyline turning angles (deg) per joint; segment length L (blocks)`);
  console.log('| scene | joints | median | p90 | max | joints >10° per block of boundary | mean L |');
  console.log('|---|---|---|---|---|---|---|');
  for (const n of want) {
    const sc = all.find((s) => s.name === n);
    if (!sc) { console.log(`| ${n} | missing |`); continue; }
    const region = core.buildRegion(sc.cell, A.apron ?? 10);
    const mesh = A.mesh(region, null, core);
    const win = sc.win ?? [6, 6, 26, 26];
    const inner = [win[0] + 2, win[1] + 2, win[2] - 2, win[3] - 2];
    const lines = chain(boundarySegments(mesh, core.GRASS, core.STONE, inner));
    const { turns, lens } = turning(lines);
    const total = lens.reduce((a, b) => a + b, 0);
    const big = turns.filter((x) => x > 10).length;
    console.log(`| ${n} | ${turns.length} | ${pct(turns, 0.5).toFixed(1)} | ${pct(turns, 0.9).toFixed(1)} | ${Math.max(...turns).toFixed(1)} | ${(big / total).toFixed(2)} | ${(total / lens.length).toFixed(2)} |`);
  }
}
