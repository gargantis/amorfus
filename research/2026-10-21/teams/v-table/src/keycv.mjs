// v-table (T7/T8): cross-validated per-key mean vertex tables from my own
// per-corner records (res/score/*.json cornerRecs; reference = onD, the
// on-surface vertex of the render field), independent of team table's data.
//   node src/keycv.mjs <regime> <t1 score json> [<t7 score json>]
// Keys: K8 (material classes), K8bin (solid/air class), K32 (K8 + the 24
// face neighbours), K64 (4x4x4); canonicalised over the K8 stabiliser.
// Fallback chain: key -> K8 -> team table's no-volume E2c entry.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildClassTable, classOf, symPoint, symPointInv, applySym, rgKey } from '../../table/src/lattice.mjs';

const [regime, f1, f7] = process.argv.slice(2);
const T = buildClassTable();
const TR = new URL('../../table/', import.meta.url).pathname;
const NV = JSON.parse(readFileSync(`${TR}res/table/${regime}_E2c_n12_clu-novol.json`, 'utf8')).entries;
const nvOf = (cls) => { const e = NV[cls]; return e ? (e.vseam && e.seamInCell ? e.vseam : e.vsn) : [0, 0, 0]; };
// window index ((wy*4 + wz)*4 + wx), w = -2..1; block centre offset w + 0.5
const W64 = [];
for (let wy = -2; wy < 2; wy++) for (let wz = -2; wz < 2; wz++) for (let wx = -2; wx < 2; wx++) W64.push([wx + 0.5, wy + 0.5, wz + 0.5]);
const widx = (c) => ((Math.round(c[1] - 0.5) + 2) * 4 + (Math.round(c[2] - 0.5) + 2)) * 4 + (Math.round(c[0] - 0.5) + 2);
const inner = (c) => c.every((v) => Math.abs(v) === 0.5);
const face = (c) => { const out = c.filter((v) => Math.abs(v) === 1.5).length; return out === 1; };
function keysOf(r) {
  const lab8 = r.lab.split('').map(Number);
  const { cls } = classOf(T, lab8);
  const k8 = T.classes[cls].key;
  const lab64 = r.lab64.split('').map(Number);
  let best32 = null, best64 = null, h32 = 0, h64 = 0;
  for (let h = 0; h < 48; h++) {
    if (rgKey(applySym(h, lab8)) !== k8) continue;
    const can = new Array(64);
    W64.forEach((c, i) => { can[widx(symPoint(h, c))] = lab64[i]; });
    // RG over inner first (so it matches the K8 naming), then the rest
    const order = [...W64.keys()].sort((a, b) => (inner(W64[b]) - inner(W64[a])) || a - b);
    const mp = new Map(); let s32 = '', s64 = '';
    for (const i of order) { const v = can[i]; let t = 0; if (v) { if (!mp.has(v)) mp.set(v, mp.size + 1); t = mp.get(v); } s64 += t; if (inner(W64[i]) || face(W64[i])) s32 += t; }
    if (best32 === null || s32 < best32) { best32 = s32; h32 = h; }
    if (best64 === null || s64 < best64) { best64 = s64; h64 = h; }
  }
  const { cls: cb, g: gb } = classOf(T, lab8.map((v) => (v ? 1 : 0)));
  const { g } = classOf(T, lab8);
  return {
    K8: { key: 'c' + cls, h: g }, K8bin: { key: 'b' + cb, h: gb }, K32: { key: 'c' + cls + ':' + best32, h: h32 }, K64: { key: 'c' + cls + ':' + best64, h: h64 }, cls,
  };
}
function load(f, pick) {
  const R = JSON.parse(readFileSync(f, 'utf8'));
  const out = [];
  for (const [name, row] of Object.entries(R.scenes)) {
    if (!pick(name) || !row.cornerRecs) continue;
    for (const r of row.cornerRecs) out.push({ ...r, scene: name, keys: keysOf(r) });
  }
  return out;
}
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function train(recs, K) {
  const m = new Map();
  for (const r of recs) { const k = r.keys[K]; const v = symPoint(k.h, r.onD); const e = m.get(k.key) ?? { s: [0, 0, 0], n: 0 }; e.s = e.s.map((x, i) => x + v[i]); e.n++; m.set(k.key, e); }
  for (const e of m.values()) e.v = e.s.map((x) => x / e.n);
  return m;
}
function evalKey(trainR, testR, K) {
  const mK = train(trainR, K), m8 = train(trainR, 'K8');
  let err = 0, cov = 0, errCov = 0;
  for (const r of testR) {
    const k = r.keys[K];
    let pred;
    if (mK.has(k.key)) { pred = symPointInv(k.h, mK.get(k.key).v); cov++; }
    else if (m8.has(r.keys.K8.key)) pred = symPointInv(r.keys.K8.h, m8.get(r.keys.K8.key).v);
    else pred = symPointInv(r.keys.K8.h, nvOf(r.keys.cls));
    const e = d3(pred, r.onD);
    err += e; if (mK.has(k.key)) errCov += e;
  }
  return { n: testR.length, coverage: +(cov / testR.length).toFixed(3), meanWithFallback: +(err / testR.length).toFixed(4), meanCovered: cov ? +(errCov / cov).toFixed(4) : null, keysInTrain: mK.size };
}
const chunkOf = (name) => +/^[a-z](\d+)/.exec(name)[1];
const recs1 = load(f1, (nm) => !/shift/.test(nm));
const out = { regime, folds: {}, t7: {} };
const nvErr = (R) => +(R.reduce((a, r) => a + d3(symPointInv(r.keys.K8.h, nvOf(r.keys.cls)), r.onD), 0) / R.length).toFixed(4);
for (const fold of [0, 1]) {
  const tr = recs1.filter((r) => chunkOf(r.scene) % 2 !== fold), te = recs1.filter((r) => chunkOf(r.scene) % 2 === fold);
  out.folds[fold] = { train: tr.length, test: te.length, tabNV: nvErr(te) };
  for (const K of ['K8', 'K8bin', 'K32', 'K64']) out.folds[fold][K] = evalKey(tr, te, K);
}
if (f7) {
  const recs7 = load(f7, () => true);
  out.t7 = { train: recs1.length, test: recs7.length, tabNV: nvErr(recs7) };
  for (const K of ['K8', 'K8bin', 'K32', 'K64']) out.t7[K] = evalKey(recs1, recs7, K);
}
writeFileSync(new URL(`../res/keycv-${regime}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
