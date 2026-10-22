// v-table: compare two cached physics results of the same scenes (e.g. volume
// vs no-volume, or n 12 vs n 20): on-surface vertex difference per corner in
// E and the symmetric surface distance between the two D surfaces in E.
//   node src/cmpcache.mjs <set> <regA> <nA> <regB> <nB> <out.json> [names]
import { writeFileSync, existsSync } from 'node:fs';
import { sceneSet } from './scenes.mjs';
import { loadCache } from './simcache.mjs';
import { makeField, cloudOf, indexCloud, distToCloud, topology, onSurface } from './meshlib.mjs';

const [set, rA, nA, rB, nB, out, names] = process.argv.slice(2);
const ROOT = new URL('..', import.meta.url).pathname;
let scenes = sceneSet(set);
if (names) { const w = names.split(','); scenes = scenes.filter((s) => w.includes(s.name)); }
const res = { set, A: `${rA} n${nA}`, B: `${rB} n${nB}`, scenes: {} };
let vt = 0, vn = 0, st = 0, sw = 0;
for (const sc of scenes) {
  if (!existsSync(`${ROOT}cache/${rA}-n${nA}/${sc.name}.json`) || !existsSync(`${ROOT}cache/${rB}-n${nB}/${sc.name}.json`)) continue;
  const fa = makeField(loadCache(rA, +nA, sc.name), 'D'), fb = makeField(loadCache(rB, +nB, sc.name), 'D');
  const lo = sc.evalLo, hi = sc.evalHi, lo1 = lo.map((v) => v - 1), hi1 = hi.map((v) => v + 1);
  const topo = topology(sc.get, lo, hi);
  let vd = 0, k = 0;
  for (const [, { c }] of topo.corners) { const a = onSurface(fa, c), b = onSurface(fb, c); if (!a || !b) continue; vd += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); k++; }
  const ca = cloudOf(fa, lo, hi), cb = cloudOf(fb, lo1, hi1), ib = indexCloud(cb, lo1, hi1);
  const cb2 = cloudOf(fb, lo, hi), ca2 = cloudOf(fa, lo1, hi1), ia = indexCloud(ca2, lo1, hi1);
  let s1 = 0, w1 = 0, s2 = 0, w2 = 0;
  for (let p = 0; p < ca.count; p++) { s1 += distToCloud(cb, ib, [ca.P[3 * p], ca.P[3 * p + 1], ca.P[3 * p + 2]]) * ca.W[p]; w1 += ca.W[p]; }
  for (let p = 0; p < cb2.count; p++) { s2 += distToCloud(ca2, ia, [cb2.P[3 * p], cb2.P[3 * p + 1], cb2.P[3 * p + 2]]) * cb2.W[p]; w2 += cb2.W[p]; }
  const surf = 0.5 * (s1 / w1 + s2 / w2);
  res.scenes[sc.name] = { corners: k, vtxDiff: +(vd / Math.max(1, k)).toFixed(4), surfDist: +surf.toFixed(4) };
  vt += vd; vn += k; st += surf * w1; sw += w1;
  console.log(sc.name, JSON.stringify(res.scenes[sc.name]));
}
res.mean = { corners: vn, vtxDiff: +(vt / Math.max(1, vn)).toFixed(4), surfDist: +(st / Math.max(1e-9, sw)).toFixed(4) };
console.log('MEAN', JSON.stringify(res.mean));
writeFileSync(out, JSON.stringify(res, null, 1));
