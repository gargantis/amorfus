// Task 3b: cost of the bubble vertex rule on generated terrain, next to the
// repo mesher on the same 38^3 inputs (generator + mesher bundled from the
// repo at HEAD into repo-bundle.mjs with esbuild). Min of N runs, Node.
//   node t3time.mjs <out.json> [N]
import { writeFileSync, readFileSync } from 'node:fs';
import { buildGenMeshInput, meshRegion } from './repo-bundle.mjs';
import { makeRule, bubbleVertices } from './vrule.mjs';

const [out, NArg] = process.argv.slice(2);
const N = Number(NArg ?? 9);
const SEED = [1, 1];
const L20 = JSON.parse(readFileSync(new URL('../res/fitlam-g20.json', import.meta.url), 'utf8')).best;
const rules = {
  'bub-b1-local': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 } }),
  'bub-b1-const': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { const: 0.08 } }),
  'bub-b1-local-2it': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, iters: 2 }),
  'bub-b1-line': makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, solver: 'line' }),
  'bub-b3-local': makeRule({ kernel: 'b3', sigma: 0.2, lambda: { local: L20 } }),
};
// lower bound: single-material corners from a 256-entry table (constant lambda),
// mixed-material corners through the b1 solver
function makeTable(rule) {
  const T = new Float64Array(256 * 3);
  const reg = new Uint16Array(4 * 4 * 4);
  for (let mask = 1; mask < 255; mask++) {
    reg.fill(0);
    for (let j = 0; j < 8; j++) if ((mask >> j) & 1) reg[(1 + ((j >> 2) & 1)) * 16 + (1 + ((j >> 1) & 1)) * 4 + (1 + (j & 1))] = 6;
    const r = bubbleVertices(reg, 4, 4, 4, 2, rule, 0);
    T[mask * 3] = r.off[0]; T[mask * 3 + 1] = r.off[1]; T[mask * 3 + 2] = r.off[2];
  }
  return T;
}
const TABLE = makeTable(rules['bub-b1-const']);
function tableVertices(region, nx, ny, nz, apron) {
  const SZ = nx, SY = nx * nz;
  let count = 0, mixedMat = 0;
  const off = new Float64Array(33 * 33 * 33 * 3);
  for (let y = apron; y <= apron + 32; y++) for (let z = apron; z <= apron + 32; z++) {
    let i000 = (y - 1) * SY + (z - 1) * SZ + (apron - 1);
    for (let x = apron; x <= apron + 32; x++, i000++) {
      let mask = 0, m0 = 0, multi = false;
      for (let j = 0; j < 8; j++) {
        const m = region[i000 + (j & 1) + ((j >> 1) & 1) * SZ + ((j >> 2) & 1) * SY] & 0xff;
        if (m) { mask |= 1 << j; if (m0 && m !== m0) multi = true; m0 = m; }
      }
      if (mask === 0 || mask === 255) continue;
      if (multi) mixedMat++;
      off[count * 3] = TABLE[mask * 3]; off[count * 3 + 1] = TABLE[mask * 3 + 1]; off[count * 3 + 2] = TABLE[mask * 3 + 2];
      count++;
    }
  }
  return { count, mixedMat };
}

const minTime = (fn) => { for (let i = 0; i < 2; i++) fn(); let best = Infinity, r; for (let i = 0; i < N; i++) { const t = performance.now(); r = fn(); best = Math.min(best, performance.now() - t); } return { ms: +best.toFixed(3), r }; };

const res = { N, seed: SEED, region: '38^3 (apron 3), GEN_MESH input from buildGenMeshInput, no edits', node: process.version, chunks: {} };
for (const [cx, cy, cz, label] of [[0, 0, 0, 'surface'], [1, 0, 0, 'surface'], [0, 0, 1, 'surface'], [-2, 1, 1, 'surface-mixed'], [-2, -1, 1, 'cave'], [-2, -1, 0, 'cave'], [-2, 0, 1, 'cave'], [0, -1, 0, 'solid']]) {
  const { input, apron } = buildGenMeshInput(SEED, cx, cy, cz, new Map());
  const row = { apron, nx: input.nx };
  const mh = minTime(() => meshRegion(input));
  row.mesher_hints_ms = mh.ms; row.quads = mh.r.quadCount; row.vertices = mh.r.vertexCount;
  row.mesher_bevel_ms = minTime(() => meshRegion({ ...input, params: { rule: 'bevel' } })).ms;
  // pass-level profile of the default mesher (its own instrumentation)
  const prof = {};
  globalThis.__MESH_PROF = prof;
  for (let i = 0; i < 5; i++) meshRegion(input);
  delete globalThis.__MESH_PROF;
  row.mesher_hints_pass_ms = Object.fromEntries(Object.entries(prof).map(([k, v]) => [k, +(v / 5).toFixed(3)]));
  for (const [id, rule] of Object.entries(rules)) {
    const t = minTime(() => bubbleVertices(input.blocks, input.nx, input.ny, input.nz, input.apron, rule));
    row[`${id}_ms`] = t.ms; row.mixedCorners = t.r.count;
  }
  const tt = minTime(() => tableVertices(input.blocks, input.nx, input.ny, input.nz, input.apron));
  row.table_ms = tt.ms; row.multiMaterialCorners = tt.r.mixedMat;
  res.chunks[`${label} (${cx},${cy},${cz})`] = row;
  console.log(label, JSON.stringify(row));
}
writeFileSync(out, JSON.stringify(res, null, 1));
