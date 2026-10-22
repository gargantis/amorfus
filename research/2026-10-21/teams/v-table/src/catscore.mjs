// v-table: the same mesh scoring on team fast's cached catalogue references
// (teams/fast/refcache, n 16; n 12 for ball-r2 / ball-AB), to reconcile with
// fast C11 (their metric: mesh->sim only, bilinear patch samples at 1/6,
// 1/2, 5/6, reference normal + 13 directions).
//   node src/catscore.mjs <FID-0.15|FINITE-4> <names|all>
// Writes res/score/cat_<regime>_nfast.json in the score.mjs format.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { CONFIGS, byName } from '../../../lib/configs.mjs';
import { loadRef } from '../../fast/src/refs.mjs';
import { makeField, cloudOf, indexCloud, topology, positions, scoreMesh } from './meshlib.mjs';
import { placementsFor } from './score.mjs';

const [regime, names] = process.argv.slice(2);
const pick = names === 'all' ? CONFIGS : names.split(',').map((x) => byName(x));
const ROOT = new URL('..', import.meta.url).pathname;
mkdirSync(ROOT + 'res/score', { recursive: true });
const out = `${ROOT}res/score/cat_${regime}_nfast.json`;
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { set: 'cat', regime, n: 'fast', scenes: {} };
for (const cfg of pick) {
  if (res.scenes[cfg.name]) continue;
  const t0 = performance.now();
  const { sim } = loadRef(regime, cfg);
  const map = new Map(cfg.blocks.map((b) => [`${b[0]},${b[1]},${b[2]}`, b[3]]));
  const get = (x, y, z) => map.get(`${x},${y},${z}`) ?? 0;
  const mn = [0, 1, 2].map((t) => Math.min(...cfg.blocks.map((b) => b[t]))), mx = [0, 1, 2].map((t) => Math.max(...cfg.blocks.map((b) => b[t])) + 1);
  const sc = { name: cfg.name, get, evalLo: mn.map((v) => v - 1), evalHi: mx.map((v) => v + 1) };
  const fields = { D: makeField(sim, 'D'), L: makeField(sim, 'L') };
  const lo = sc.evalLo, hi = sc.evalHi;
  const topo = topology(get, lo.map((v) => v - 2), hi.map((v) => v + 2));
  const P = placementsFor(sc, 'b', regime, fields, topo); // 'b': bevel unplaced and placed, no hints
  const row = { corners: topo.corners.size, quadsE: topo.quads.length, place: {} };
  for (const [fk, fd] of Object.entries(fields)) {
    const lo1 = lo.map((v) => v - 1), hi1 = hi.map((v) => v + 1);
    const cl = cloudOf(fd, lo1, hi1), ix = indexCloud(cl, lo1, hi1), clE = cloudOf(fd, lo.map((v) => v - 0.3), hi.map((v) => v + 0.3));
    for (const [pk, off] of Object.entries(P)) {
      const s = scoreMesh(topo, positions(topo, off), cl, ix, fd, lo, hi, { sCloud: clE });
      const ref = P[`on${fk}`];
      let ve = 0;
      for (const [k] of topo.corners) { const a = off.get(k) ?? [0, 0, 0], b = ref.get(k); ve += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
      s.vtx = +(ve / Math.max(1, topo.corners.size)).toFixed(4);
      (row.place[pk] ??= {})[fk] = s;
    }
  }
  row.ms = Math.round(performance.now() - t0);
  res.scenes[cfg.name] = row;
  writeFileSync(out, JSON.stringify(res));
  console.log(`${cfg.name} ${regime}: ${Object.entries(row.place).map(([pk, v]) => `${pk} ${v.D.sym}`).join(' | ')}`);
}
