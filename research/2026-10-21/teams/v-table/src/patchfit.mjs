// v-table (v): fit a per-class offset table that minimises the MESH error
// (symmetric mean distance mesh<->physics surface), not the vertex error.
//   node src/patchfit.mjs <regime> <field D|L> <trainSet> <trainNames|all> <out.json> [--init tabNV|zero] [--minutes 8] [--minN 4]
// Parametrisation: one canonical-frame offset per K8 class (team table's
// classes and symmetries), restricted to the subspace left invariant by the
// class's own stabiliser, mapped to each occurrence with symPointInv.
// Pattern search per class (steps 0.16 -> 0.01) over training scenes with
// incremental re-scoring. Resumable: state is saved after every class.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildClassTable, classOf, symPointInv, SYMS, applySym, rgKey } from '../../table/src/lattice.mjs';
import { sceneSet } from './scenes.mjs';
import { loadCache } from './simcache.mjs';
import { makeField, cloudOf, indexCloud, topology, quadTris, distToCloud, ptTri, bucketQuads, candQuads } from './meshlib.mjs';

const TROOT = new URL('../../table/', import.meta.url).pathname;
const args = process.argv.slice(2);
const [regime, fk, trainSet, trainNames, outPath] = args;
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : d; };
const init = opt('--init', 'zero'), minutes = +opt('--minutes', 8), minN = +opt('--minN', 4);
const T = buildClassTable();

// ---- invariant subspace basis per class ----
function basisOf(key) {
  const rep = key.split('').map(Number);
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let cnt = 0;
  for (let g = 0; g < 48; g++) {
    if (rgKey(applySym(g, rep)) !== key) continue;
    cnt++;
    for (let j = 0; j < 3; j++) { const e = [0, 0, 0]; e[j] = 1; const v = symPointInv(g, e); for (let i = 0; i < 3; i++) M[i][j] += v[i]; }
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] /= cnt;
  // Gram-Schmidt on the projector's columns
  const B = [];
  for (let j = 0; j < 3; j++) {
    let v = [M[0][j], M[1][j], M[2][j]];
    for (const b of B) { const d = v[0] * b[0] + v[1] * b[1] + v[2] * b[2]; v = v.map((x, i) => x - d * b[i]); }
    const l = Math.hypot(...v);
    if (l > 1e-6) B.push(v.map((x) => x / l));
  }
  return { B, P: M };
}
const projectTo = (P, v) => [0, 1, 2].map((i) => P[i][0] * v[0] + P[i][1] * v[1] + P[i][2] * v[2]);

// ---- training scenes ----
let scenes = sceneSet(trainSet);
if (trainNames !== 'all') { const want = trainNames.split(','); scenes = scenes.filter((s) => want.includes(s.name)); }
else scenes = scenes.filter((s) => !/shift/.test(s.name));
const ROOT = new URL('..', import.meta.url).pathname;
scenes = scenes.filter((s) => existsSync(`${ROOT}cache/${regime}-n12/${s.name}.json`));
const K = 4; // 16 points per triangle in the fit
const BARY = []; for (let i = 0; i < K; i++) for (let j = 0; j < K - i; j++) { BARY.push([(i + 1 / 3) / K, (j + 1 / 3) / K]); if (i + j < K - 1) BARY.push([(i + 2 / 3) / K, (j + 2 / 3) / K]); }
const triArea = (t) => { const u = [0, 1, 2].map((k) => t[1][k] - t[0][k]), v = [0, 1, 2].map((k) => t[2][k] - t[0][k]); return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]); };

const S = [];
const classCount = new Map();
for (const sc of scenes) {
  const c = loadCache(regime, 12, sc.name);
  const fd = makeField(c, fk);
  const lo = sc.evalLo, hi = sc.evalHi;
  const topo = topology(sc.get, lo.map((v) => v - 2), hi.map((v) => v + 2));
  const lo1 = lo.map((v) => v - 1), hi1 = hi.map((v) => v + 1);
  const clX = cloudOf(fd, lo1, hi1), ix = indexCloud(clX, lo1, hi1), cl = cloudOf(fd, lo, hi); // cl: sim points in E (s2m); clX: m2s distances
  const keys = [...topo.corners.keys()];
  const kIdx = new Map(keys.map((k, i) => [k, i]));
  const cls = new Int32Array(keys.length), gs = new Int32Array(keys.length), base = [];
  keys.forEach((k, i) => { const { cls: cc, g } = classOf(T, topo.corners.get(k).lab8); cls[i] = cc; gs[i] = g; base.push(topo.corners.get(k).c); });
  const inE = (p) => p.every((v, t) => v >= lo[t] && v <= hi[t]);
  const quads = topo.quads.map((q) => ({ ci: q.k.map((k) => kIdx.get(k)), ctr: q.ctr, inE: inE(q.ctr) }));
  for (const q of quads) if (q.inE) for (const i of q.ci) classCount.set(cls[i], (classCount.get(cls[i]) ?? 0) + 1);
  const bq = bucketQuads(topo.quads);
  const pc = [], quadPts = quads.map(() => []);
  for (let p = 0; p < cl.count; p++) {
    const cand = candQuads(bq, [cl.P[3 * p], cl.P[3 * p + 1], cl.P[3 * p + 2]]);
    pc.push(cand);
    for (const qi of cand) quadPts[qi].push(p);
  }
  const cornerQuads = keys.map(() => []);
  quads.forEach((q, qi) => q.ci.forEach((i) => cornerQuads[i].push(qi)));
  S.push({ name: sc.name, cl, clX, ix, fd, cls, gs, base, quads, pc, quadPts, cornerQuads, simArea: cl.W.reduce((a, b) => a + b, 0),
    meshArea: quads.filter((q) => q.inE).length, qm: new Float64Array(quads.length), pd: new Float64Array(cl.count), pos: base.map(() => [0, 0, 0]) });
}
console.log(`${S.length} training scenes, ${classCount.size} classes`);

// ---- table state ----
const state = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
const entries = state ? state.entries : {};
const initTab = init === 'tabNV' ? JSON.parse(readFileSync(`${TROOT}res/table/${regime}_E2c_n12_clu-novol.json`, 'utf8')).entries : null;
const order = [...classCount.entries()].filter(([, n]) => n >= minN).sort((a, b) => b[1] - a[1]).map(([c]) => c);
const info = new Map();
for (const c of order) {
  const key = T.classes[c].key;
  const bs = basisOf(key);
  info.set(c, bs);
  if (!entries[c]) {
    let v = [0, 0, 0];
    if (initTab && initTab[c]) { const e = initTab[c]; v = projectTo(bs.P, e.vseam && e.seamInCell ? e.vseam : e.vsn); }
    entries[c] = { key, v, n: classCount.get(c), dim: bs.B.length, done: false };
  }
}
const offOf = (c) => (entries[c] ? entries[c].v : [0, 0, 0]);
const q256 = (x) => Math.round(x * 256) / 256;
function setPos(s, i) { const v = symPointInv(s.gs[i], offOf(s.cls[i])); s.pos[i] = [s.base[i][0] + q256(v[0]), s.base[i][1] + q256(v[1]), s.base[i][2] + q256(v[2])]; }
function quadM(s, qi) {
  const q = s.quads[qi];
  const tq = { k: [0, 1, 2, 3] }, P = new Map(q.ci.map((ci, j) => [j, s.pos[ci]]));
  let sd = 0;
  for (const t of quadTris(tq, P)) { const A = triArea(t) / BARY.length; for (const [u, v] of BARY) { const x = [0, 1, 2].map((k) => t[0][k] + u * (t[1][k] - t[0][k]) + v * (t[2][k] - t[0][k])); sd += distToCloud(s.clX, s.ix, x) * A; } }
  return sd;
}
function trisOf(s, qi) { const q = s.quads[qi]; return quadTris({ k: [0, 1, 2, 3] }, new Map(q.ci.map((ci, j) => [j, s.pos[ci]]))); }
function ptD(s, p) {
  const x = [s.cl.P[3 * p], s.cl.P[3 * p + 1], s.cl.P[3 * p + 2]];
  let best = 1;
  for (const qi of s.pc[p]) for (const t of trisOf(s, qi)) { const d = ptTri(x, t[0], t[1], t[2]); if (d < best) best = d; }
  return best;
}
function sceneJ(s) {
  let m = 0, p = 0;
  s.quads.forEach((q, qi) => { if (q.inE) m += s.qm[qi]; });
  for (let i = 0; i < s.cl.count; i++) p += s.pd[i] * s.cl.W[i];
  return 0.5 * (m / s.meshArea + p / s.simArea);
}
// full init
for (const s of S) {
  for (let i = 0; i < s.base.length; i++) setPos(s, i);
  s.quads.forEach((q, qi) => { s.qm[qi] = q.inE ? quadM(s, qi) : 0; });
  for (let p = 0; p < s.cl.count; p++) s.pd[p] = ptD(s, p);
}
const J = () => S.reduce((a, s) => a + sceneJ(s), 0) / S.length;
// affected sets per class
const aff = new Map();
for (const c of order) {
  aff.set(c, S.map((s) => {
    const cs = []; for (let i = 0; i < s.base.length; i++) if (s.cls[i] === c) cs.push(i);
    const qs = new Set(); for (const i of cs) for (const qi of s.cornerQuads[i]) qs.add(qi);
    const ps = new Set(); for (const qi of qs) for (const p of s.quadPts[qi]) ps.add(p);
    return { cs, qs: [...qs], ps: [...ps] };
  }));
}
/** objective change if class c takes offset v (applied, measured, reverted unless keep) */
function tryOffset(c, v, keep) {
  const old = entries[c].v;
  entries[c].v = v;
  let delta = 0;
  const saved = [];
  S.forEach((s, si) => {
    const A = aff.get(c)[si];
    if (!A.cs.length) return;
    for (const i of A.cs) setPos(s, i);
    let dm = 0, dp = 0;
    const nq = A.qs.map((qi) => { const val = s.quads[qi].inE ? quadM(s, qi) : 0; dm += val - s.qm[qi]; return val; });
    const np = A.ps.map((p) => { const val = ptD(s, p); dp += (val - s.pd[p]) * s.cl.W[p]; return val; });
    delta += 0.5 * (dm / s.meshArea + dp / s.simArea) / S.length;
    saved.push([s, A, nq, np]);
  });
  if (keep) {
    for (const [s, A, nq, np] of saved) { A.qs.forEach((qi, j) => { s.qm[qi] = nq[j]; }); A.ps.forEach((p, j) => { s.pd[p] = np[j]; }); }
  } else {
    entries[c].v = old;
    for (const [s, A] of saved) for (const i of A.cs) setPos(s, i);
  }
  return delta;
}
const t0 = performance.now();
const J0 = J();
console.log(`start J ${J0.toFixed(5)} (init ${init})`);
const save = () => writeFileSync(outPath, JSON.stringify({ name: opt('--name', `fit-${fk}`), regime, field: fk, trainSet, scenes: S.map((s) => s.name), init, J: +J().toFixed(5), entries }, null, 0));
for (const c of order) {
  const e = entries[c];
  if (e.done || !e.dim) { e.done = true; continue; }
  if ((performance.now() - t0) / 60000 > minutes) { console.log('time budget reached; resume later'); break; }
  const B = info.get(c).B;
  let improved = 0;
  for (const step of [0.16, 0.08, 0.04, 0.02, 0.01]) {
    let again = true;
    while (again) {
      again = false;
      for (const b of B) for (const sg of [1, -1]) {
        const v = e.v.map((x, i) => x + sg * step * b[i]);
        if (v.some((x) => Math.abs(x) > 0.5)) continue;
        const d = tryOffset(c, v, false);
        if (d < -1e-7) { tryOffset(c, v, true); improved += d; again = true; }
      }
    }
  }
  e.done = true; e.gain = +improved.toFixed(6);
  console.log(`class ${c} ${e.key} n ${e.n} dim ${e.dim}: v ${e.v.map((x) => x.toFixed(3))} gain ${improved.toFixed(5)} (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  save();
}
save();
console.log(`end J ${J().toFixed(5)} from ${J0.toFixed(5)}; ${order.filter((c) => entries[c].done).length}/${order.length} classes done`);
