import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as core from '../../harness/core.mjs';
const SEED = [1, 1];
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
for (const ap of [3, 3, 5, 8, 10]) {
  let g = 0, mm = 0;
  for (const c of CHUNKS) {
    const t0 = performance.now();
    const inp = buildGenMeshInput(SEED, c[0], c[1], c[2], new Map(), { forceApron: ap }).input;
    const t1 = performance.now();
    core.meshRegion(inp);
    mm += performance.now() - t1;
    g += t1 - t0;
  }
  console.log(`apron ${ap}: region ${32 + 2 * ap}³, generate ${(g / CHUNKS.length).toFixed(1)} ms, mesh ${(mm / CHUNKS.length).toFixed(1)} ms per chunk`);
}
