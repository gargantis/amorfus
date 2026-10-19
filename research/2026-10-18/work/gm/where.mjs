import * as core from '../../harness/core.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { boundaryPoints } from './terrain-metrics.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { BENCH, loadMods } from './terrain-metrics.mjs';
const [A] = await loadMods([process.argv[2]]);
for (const c of BENCH) {
  const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = A.mesh(inp, null, core);
  const img = rasterTopDown(m, { x0: 0, z0: 0, w: 32, h: 32, S: 16, fragment: (a, i) => A.fragment(a, i, null) });
  const pts = boundaryPoints(img, 1, 2);
  if (pts.length) {
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    console.log(c.join(','), pts.length, 'x', Math.min(...xs).toFixed(1), Math.max(...xs).toFixed(1), 'z', Math.min(...zs).toFixed(1), Math.max(...zs).toFixed(1));
  }
}
