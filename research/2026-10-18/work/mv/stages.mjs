import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const M = await import(pathToFileURL(resolve(process.argv[2])).href);
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const inputs = CH.map((c) => buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: M.apron ?? 10 }).input);
const best = CH.map(() => null);
for (let r = 0; r < 4; r++) inputs.forEach((inp, i) => {
  const m = M.mesh(inp, null, core);
  const T = m.fitStats.TT;
  if (!best[i] || T.total < best[i].total) best[i] = { ...T, fits: m.fitStats.fits };
});
const keys = Object.keys(best[0]);
console.log(keys.map((k) => `${k} ${(best.reduce((a, b) => a + b[k], 0) / best.length).toFixed(2)}`).join(', '));
