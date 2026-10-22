// E6b: is lambda the only long-range carrier? A 1-thick membrane (y = 1)
// spanning a 2-wide, 3-tall frame (9x3x9 outer, 5x5 membrane). Single-block
// edits punch a hole; under volume:false, does the hole stay local or does
// the membrane unzip (a cascade that is not lambda)? Also with volume on.
//   node e6b-membrane.mjs <regime> <out.json> <imgDir>
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderView, renderSlice, savePng } from '../../../lib/render.mjs';
import { run, solidAt, cellCentre } from './physics.mjs';
import { box, distToBlocks, STONE, r4 } from './common.mjs';

const [reg, out, imgDir] = process.argv.slice(2);
mkdirSync(imgDir, { recursive: true });
const frame = box(0, 0, 0, 9, 3, 9, STONE, (x, y, z) => !(x < 2 || x > 6 || z < 2 || z > 6) && y !== 1);
const minus = (L, hs) => L.filter((b) => !hs.some((h) => h[0] === b[0] && h[1] === b[1] && h[2] === b[2]));
const scenes = [
  ['intact', []],
  ['hole1', [[4, 1, 4]]],
  ['hole2', [[4, 1, 4], [5, 1, 4]]],
  ['hole2x2', [[4, 1, 4], [5, 1, 4], [4, 1, 5], [5, 1, 5]]],
  ['hole3x3', [[3, 1, 3], [4, 1, 3], [5, 1, 3], [3, 1, 4], [4, 1, 4], [5, 1, 4], [3, 1, 5], [4, 1, 5], [5, 1, 5]]],
];
const res = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { note: 'frame 9x3x9 (2 wide), membrane y=1 over x,z in 2..6; n 12 margin 0.75', regime: reg, scenes: {}, pairs: [] };
const sims = {};
for (const [name, holes] of scenes) {
  const sim = run(minus(frame, holes), reg, 12, 0.75);
  sims[name] = sim;
  const s = solidAt(sim);
  // membrane layer fill: fraction of cells solid in y in [1,2], x,z in [2,7] (the membrane footprint)
  let tot = 0, sol = 0;
  for (let k = 0; k < sim.NZ; k++) for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) {
    const p = cellCentre(sim, i, j, k);
    if (p[1] < 1 || p[1] > 2 || p[0] < 2 || p[0] > 7 || p[2] < 2 || p[2] > 7) continue;
    tot++; sol += s(i, j, k);
  }
  const removed = holes.length;
  res.scenes[name] = { holesBlocks: removed, steps: sim.steps, converged: !!sim.converged, ms: sim.ms, membraneFill: r4(sol / tot), membraneFillOfBlocks: r4((sol / tot) * 25 / (25 - removed)) };
  console.log(reg, name, JSON.stringify(res.scenes[name]));
  savePng(join(imgDir, `membrane-${reg}-${name}-view.png`), renderView(sim, { width: 300, height: 220 }));
  savePng(join(imgDir, `membrane-${reg}-${name}-slice.png`), renderSlice(sim, { axis: 1, at: 1.5, ppb: 30 }));
  writeFileSync(out, JSON.stringify(res, null, 1));
}
for (let q = 1; q < scenes.length; q++) {
  const [na, ha] = scenes[q - 1], [nb, hb] = scenes[q];
  const changedBlocks = hb.filter((h) => !ha.some((g) => g[0] === h[0] && g[1] === h[1] && g[2] === h[2])).map((h) => [...h, STONE]);
  const a = sims[na], b = sims[nb], sa = solidAt(a), sb = solidAt(b);
  let cnt = 0, far = 0, maxD = 0;
  for (let k = 0; k < a.NZ; k++) for (let j = 0; j < a.NY; j++) for (let i = 0; i < a.NX; i++) {
    if (sa(i, j, k) === sb(i, j, k)) continue;
    cnt++;
    const d = distToBlocks(cellCentre(a, i, j, k), changedBlocks);
    maxD = Math.max(maxD, d);
    if (d > 1.0) far++;
  }
  const row = { from: na, to: nb, blocksChanged: changedBlocks.length, labelCellsChanged: cnt, cellsBeyond1Block: far, maxDist: r4(maxD) };
  res.pairs.push(row);
  console.log(reg, JSON.stringify(row));
}
writeFileSync(out, JSON.stringify(res, null, 1));
