// v-table: score surface-nets meshes with several vertex placements against
// the cached physics surface, both directions, on the scene's evaluation box.
//   node src/score.mjs <set> <regime> <n> <names|all> [--fit <fitTable.json>] [--tag x]
// Writes res/score/<set>_<regime>_n<n>[_tag].json (merged by scene name).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { buildClassTable, classOf, symPointInv } from '../../table/src/lattice.mjs';
import { sceneSet } from './scenes.mjs';
import { loadCache } from './simcache.mjs';
import { makeField, cloudOf, indexCloud, topology, positions, scoreMesh, onSurface, mesherOffsets } from './meshlib.mjs';
import { generateRegion } from './repo.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const TROOT = new URL('../../table/', import.meta.url).pathname;
export const T = buildClassTable();

export function loadTable(path) {
  const t = JSON.parse(readFileSync(path, 'utf8'));
  return t.entries;
}
/** offset of a corner from a class table (canonical-frame entries) */
export function tableOffset(entries, lab8, fallback = null) {
  const { cls, g } = classOf(T, lab8);
  let e = entries[cls];
  let v = e ? (e.v ?? (e.vseam && e.seamInCell ? e.vseam : e.vsn)) : null;
  if (!v && fallback) { e = fallback[cls]; v = e ? (e.v ?? (e.vseam && e.seamInCell ? e.vseam : e.vsn)) : null; }
  return v ? symPointInv(g, v) : [0, 0, 0];
}

export function hintGetterSeed(seed, lo, hi) {
  const R = generateRegion(seed, lo[0], lo[1], lo[2], hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return (x, y, z) => {
    const i = x - lo[0], j = y - lo[1], k = z - lo[2];
    if (i < 0 || j < 0 || k < 0 || i >= R.nx || j >= R.ny || k >= R.nz) return -127;
    return R.hints[(j * R.nz + k) * R.nx + i];
  };
}

export function placementsFor(sc, set, regime, fields, topo, extra = {}) {
  const lo = sc.evalLo.map((v) => v - 2), hi = sc.evalHi.map((v) => v + 2);
  const P = {};
  const keys = [...topo.corners.keys()];
  P.cube = new Map(keys.map((k) => [k, [0, 0, 0]]));
  P.bevel = mesherOffsets(sc.get, null, lo.map((v) => v - 1), hi.map((v) => v + 1), 'bevel', 0);
  if (set === 'b') P['bevel-placed'] = mesherOffsets(sc.get, null, lo.map((v) => v - 1), hi.map((v) => v + 1), 'bevel', 1);
  if (set === 't1' || set === 't7' || set === 't8' || set === 'n1' || set === 'n7') {
    const seed = set === 't1' || set === 'n1' ? [1, 1] : [7, 13];
    const hint = sc.hint ?? hintGetterSeed(seed, lo.map((v) => v - 6), hi.map((v) => v + 6));
    P.hints = mesherOffsets(sc.get, hint, lo.map((v) => v - 1), hi.map((v) => v + 1), 'hints', 0);
  }
  const tabs = {
    tabNV: loadTable(`${TROOT}res/table/${regime}_E2c_n12_clu-novol.json`),
    // the same table using its surface-nets vertex (vsn) also at seam classes, instead of the seam point
    tabNVsn: Object.fromEntries(Object.entries(loadTable(`${TROOT}res/table/${regime}_E2c_n12_clu-novol.json`)).map(([k, e]) => [k, { v: e.vsn }])),
    tabV: loadTable(`${TROOT}res/table/${regime}_E2c_n12_clu.json`),
    tabK8: loadTable(`${TROOT}res/table-K8-terrain-${regime}.json`),
    ...extra.tables,
  };
  for (const [name, ent] of Object.entries(tabs)) {
    const fb = name === 'tabNV' || name.startsWith('fit') ? null : tabs.tabNV; // fitted tables: unfitted classes stay at 0 (as in the fit)
    P[name] = new Map([...topo.corners].map(([k, { lab8 }]) => [k, tableOffset(ent, lab8, fb)]));
  }
  for (const [fk, fd] of Object.entries(fields)) {
    const m = new Map(), h = new Map();
    for (const [k, { c }] of topo.corners) { const v = onSurface(fd, c) ?? [0, 0, 0]; m.set(k, v); h.set(k, v.map((x) => 0.5 * x)); }
    P[`on${fk}`] = m; P[`on${fk}x0.5`] = h;
  }
  return P;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [set, regime, nS, names] = process.argv.slice(2);
  const n = +nS;
  const ti = process.argv.indexOf('--tag');
  const tag = ti > 0 ? '_' + process.argv[ti + 1] : '';
  const fi = process.argv.indexOf('--fit');
  const extra = { tables: {} };
  if (fi > 0) for (const it of process.argv[fi + 1].split(',')) { const [nm, f] = it.includes('=') ? it.split('=') : [null, it]; const j = JSON.parse(readFileSync(f, 'utf8')); extra.tables[nm ?? j.name] = j.entries; }
  let scenes = sceneSet(set);
  if (names !== 'all') { const want = names.split(','); scenes = scenes.filter((s) => want.includes(s.name)); }
  mkdirSync(ROOT + 'res/score', { recursive: true });
  const out = `${ROOT}res/score/${set}_${regime}_n${n}${tag}.json`;
  const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { set, regime, n, scenes: {} };
  for (const sc of scenes) {
    if (!existsSync(`${ROOT}cache/${regime}-n${n}/${sc.name}.json`)) { console.log(`${sc.name}: no cache`); continue; }
    const t0 = performance.now();
    const c = loadCache(regime, n, sc.name);
    const fields = { D: makeField(c, 'D'), L: makeField(c, 'L') };
    const lo = sc.evalLo, hi = sc.evalHi;
    const topo = topology(sc.get, lo.map((v) => v - 2), hi.map((v) => v + 2));
    const P = placementsFor(sc, set, regime, fields, topo, extra);
    const row = { meta: { steps: c.meta.steps, converged: c.meta.converged, lambda: c.meta.lambda }, corners: 0, quadsE: 0, place: {} };
    const inE = (cc) => cc.every((v, t) => v >= lo[t] && v <= hi[t]);
    const eKeys = [...topo.corners].filter(([, { c: cc }]) => inE(cc)).map(([k]) => k);
    row.corners = eKeys.length;
    row.quadsE = topo.quads.filter((q) => inE(q.ctr)).length;
    for (const [fk, fd] of Object.entries(fields)) {
      const lo1 = lo.map((v) => v - 1), hi1 = hi.map((v) => v + 1);
      // sim points: E grown by 0.3 block, so a flat face lying exactly on E's boundary (builds) is not lost
      const cl = cloudOf(fd, lo1, hi1), ix = indexCloud(cl, lo1, hi1), clE = cloudOf(fd, lo.map((v) => v - 0.3), hi.map((v) => v + 0.3));
      for (const [pk, off] of Object.entries(P)) {
        const pos = positions(topo, off);
        const s = scoreMesh(topo, pos, cl, ix, fd, lo, hi, { sCloud: clE });
        // vertex error against the on-surface vertex of the same field
        const ref = P[`on${fk}`];
        let ve = 0;
        for (const k of eKeys) { const a = off.get(k) ?? [0, 0, 0], b = ref.get(k); ve += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
        s.vtx = +(ve / Math.max(1, eKeys.length)).toFixed(4);
        (row.place[pk] ??= {})[fk] = s;
      }
    }
    // per-corner vertex records in E: class, symmetry, onD offset, and the distance of each table/rule vertex to onD
    row.cornerRecs = eKeys.map((k) => {
      const { lab8 } = topo.corners.get(k);
      const { cls, g } = classOf(T, lab8);
      const r = P.onD.get(k);
      const e = {};
      for (const pk of Object.keys(P)) { if (pk.startsWith('on')) continue; const a = P[pk].get(k) ?? [0, 0, 0]; e[pk] = +Math.hypot(a[0] - r[0], a[1] - r[1], a[2] - r[2]).toFixed(4); }
      const cc = topo.corners.get(k).c;
      let lab64 = '';
      for (let wy = -2; wy < 2; wy++) for (let wz = -2; wz < 2; wz++) for (let wx = -2; wx < 2; wx++) lab64 += sc.get(cc[0] + wx, cc[1] + wy, cc[2] + wz);
      return { k, cls, g, lab: lab8.join(''), lab64, onD: r.map((x) => +x.toFixed(4)), onL: P.onL.get(k).map((x) => +x.toFixed(4)), e };
    });
    row.ms = Math.round(performance.now() - t0);
    res.scenes[sc.name] = row;
    writeFileSync(out, JSON.stringify(res));
    const pr = (fk) => Object.entries(row.place).map(([pk, v]) => `${pk} ${v[fk].sym}/${v[fk].vtx}`).join(' | ');
    console.log(`${sc.name} ${regime} corners ${row.corners} ${row.ms} ms\n  D sym/vtx: ${pr('D')}\n  L sym/vtx: ${pr('L')}`);
  }
}
