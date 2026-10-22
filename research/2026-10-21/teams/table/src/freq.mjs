// Step 2: corner-class frequencies on generated terrain (seed [1, 1]) and on
// synthetic builds.  node src/freq.mjs > logs/freq.log   (res/freq.json)
//  - bench16: the 16 chunks of research/2026-10-18 (harness/bench.mjs)
//  - wide: every chunk of an 8 x 8 grid of chunk columns (cx, cz in
//    -12..9 step 3) for cy -2..4 (the generator's band), caves included
// Each chunk counts the corners it owns (chunk-local lattice point 0..31 on
// each axis), reading blocks -1..31 from a 33^3 region, so no corner is
// counted twice.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildClassTable, rg } from './lattice.mjs';
import { generateRegion } from '../gen.mjs';
import { BUILDS } from './builds.mjs';

const SEED = [1, 1];
const T = buildClassTable();
const CL = JSON.parse(readFileSync(new URL('../res/classes.json', import.meta.url), 'utf8')).classes;
const BENCH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const WIDE = [];
for (let cx = -12; cx <= 9; cx += 3) for (let cz = -12; cz <= 9; cz += 3) for (let cy = -2; cy <= 4; cy++) WIDE.push([cx, cy, cz]);

const newHist = () => ({ corners: 0, notSame: 0, surface: 0, seam: 0, solidMixed: 0, cls: new Map(), surfCls: new Map() });
const lab = new Array(8);
function countCorner(H, get, x, y, z) {
  // b = ox | oz << 1 | oy << 2, blocks at (x - 1 + ox, ...)
  let same = true, air = false, solid = false;
  for (let b = 0; b < 8; b++) {
    const v = get(x - 1 + (b & 1), y - 1 + ((b >> 2) & 1), z - 1 + ((b >> 1) & 1));
    lab[b] = v;
    if (v !== lab[0]) same = false;
    if (v === 0) air = true; else solid = true;
  }
  H.corners++;
  if (same) return;
  H.notSame++;
  const key = rg(lab).out.join('');
  const { cls } = T.lookup.get(key);
  H.cls.set(cls, (H.cls.get(cls) ?? 0) + 1);
  if (air && solid) {
    H.surface++;
    H.surfCls.set(cls, (H.surfCls.get(cls) ?? 0) + 1);
    if (CL[cls].nMat >= 2) H.seam++;
  } else if (!air) H.solidMixed++;
}

function chunkInto(H, c) {
  const r = generateRegion(SEED, c[0] * 32 - 1, c[1] * 32 - 1, c[2] * 32 - 1, 33, 33, 33);
  const get = (x, y, z) => r.blocks[((y + 1) * 33 + (z + 1)) * 33 + (x + 1)] & 0xff;
  for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) countCorner(H, get, x, y, z);
}

function report(H, name) {
  const out = { name, corners: H.corners, notSame: H.notSame, surface: H.surface, seam: H.seam, solidMixed: H.solidMixed };
  for (const [which, map, tot] of [['notSame', H.cls, H.notSame], ['surface', H.surfCls, H.surface]]) {
    const arr = [...map.entries()].sort((a, b) => b[1] - a[1]);
    let acc = 0, k99 = null, k999 = null;
    arr.forEach(([, n], i) => { acc += n; if (k99 === null && acc >= 0.99 * tot) k99 = i + 1; if (k999 === null && acc >= 0.999 * tot) k999 = i + 1; });
    const flag = (f) => arr.reduce((s, [c, n]) => s + (f(CL[c]) ? n : 0), 0);
    out[which] = {
      total: tot, classesSeen: arr.length, classesFor99: k99, classesFor999: k999,
      nonPlateau: flag((c) => !c.plateau), xEdge: flag((c) => c.xEdges > 0), x4Distinct: flag((c) => c.x4Distinct > 0),
      over4Mat: flag((c) => c.over4Mat), over4Clu: flag((c) => c.over4Clu), ambUnion: flag((c) => c.ambUnion),
      airSplit: flag((c) => c.airSplit), multiMat: flag((c) => c.nMat >= 2),
      byMat: arr.reduce((m, [c, n]) => { m[CL[c].nMat] = (m[CL[c].nMat] ?? 0) + n; return m; }, {}),
      hist: arr.map(([c, n]) => [c, n]),
    };
  }
  const s = out.surface, a = out.notSame;
  const pct = (n, d) => (d ? (100 * n / d).toFixed(3) : '-');
  console.log(`${name}: corners ${H.corners}, not-all-same ${H.notSame}, surface ${H.surface} (seam ${H.seam}), solid-only mixed ${H.solidMixed}`);
  console.log(`  not-all-same: ${a.classesSeen} classes seen; 99% by ${a.classesFor99}, 99.9% by ${a.classesFor999}; non-Plateau ${pct(a.nonPlateau, a.total)}%, X-edge ${pct(a.xEdge, a.total)}%, 4-distinct X ${pct(a.x4Distinct, a.total)}%, >4 bubbles (mat/clu) ${pct(a.over4Mat, a.total)}/${pct(a.over4Clu, a.total)}%, ambiguous union ${pct(a.ambUnion, a.total)}%, air split ${pct(a.airSplit, a.total)}%`);
  console.log(`  surface:      ${s.classesSeen} classes seen; 99% by ${s.classesFor99}, 99.9% by ${s.classesFor999}; non-Plateau ${pct(s.nonPlateau, s.total)}%, X-edge ${pct(s.xEdge, s.total)}%, 4-distinct X ${pct(s.x4Distinct, s.total)}%, >4 bubbles (mat/clu) ${pct(s.over4Mat, s.total)}/${pct(s.over4Clu, s.total)}%, ambiguous union ${pct(s.ambUnion, s.total)}%, air split ${pct(s.airSplit, s.total)}%, multi-material ${pct(s.multiMat, s.total)}%`);
  console.log(`  surface by #materials: ${JSON.stringify(s.byMat)}`);
  console.log(`  top surface classes: ${s.hist.slice(0, 12).map(([c, n]) => `${c}:${CL[c].key}:${pct(n, s.total)}%`).join(' ')}`);
  return out;
}

const res = {};
const t0 = performance.now();
const Hb = newHist();
for (const c of BENCH) chunkInto(Hb, c);
res.bench16 = report(Hb, 'bench16 (16 chunks)');
const Hw = newHist();
let nonUniform = 0;
for (const c of WIDE) { const before = Hw.notSame; chunkInto(Hw, c); if (Hw.notSame > before) nonUniform++; }
res.wide = report(Hw, `wide (${WIDE.length} chunks, ${nonUniform} with corners that are not all the same)`);
// builds: interior corners only (lattice 1..N-1 on each axis)
const Hall = newHist();
res.builds = {};
for (const [name, mk] of Object.entries(BUILDS)) {
  const G = mk();
  const H = newHist();
  for (const HH of [H, Hall]) for (let y = 1; y < G.NY; y++) for (let z = 1; z < G.NZ; z++) for (let x = 1; x < G.NX; x++) countCorner(HH, G.at, x, y, z);
  res.builds[name] = report(H, `build ${name}`);
}
res.buildsAll = report(Hall, 'builds (all five)');
console.log(`time ${((performance.now() - t0) / 1000).toFixed(1)} s`);
res.chunks = { bench16: BENCH, wide: WIDE };
writeFileSync(new URL('../res/freq.json', import.meta.url), JSON.stringify(res));
