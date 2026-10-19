// Min-of-N interleaved timings: repo mesher vs gn-ao (fast) vs gn-best (fast).
import { meshRegion as gn } from './mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS as BEST } from '../../approaches/gn-best.mjs';
import { PARAMS as AO } from '../../approaches/gn-ao.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
for (const ap of [3, 10]) {
  const inputs = CHUNKS.map((c) => buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: ap }).input);
  const best = { repo: inputs.map(() => Infinity), ao: inputs.map(() => Infinity), gn: inputs.map(() => Infinity) };
  for (let r = 0; r < 15; r++) {
    inputs.forEach((inp, i) => {
      let t0 = performance.now(); repo(inp); best.repo[i] = Math.min(best.repo[i], performance.now() - t0);
      t0 = performance.now(); gn({ ...inp, params: AO }); best.ao[i] = Math.min(best.ao[i], performance.now() - t0);
      t0 = performance.now(); gn({ ...inp, params: BEST }); best.gn[i] = Math.min(best.gn[i], performance.now() - t0);
    });
  }
  const sum = (a) => a.reduce((p, q) => p + q, 0) / a.length;
  console.log(`apron ${ap} (mean over 16 chunks of min-of-15): repo ${sum(best.repo).toFixed(2)} ms, gn-ao ${sum(best.ao).toFixed(2)} ms (+${(sum(best.ao) - sum(best.repo)).toFixed(2)}), gn-best ${sum(best.gn).toFixed(2)} ms (+${(sum(best.gn) - sum(best.repo)).toFixed(2)})`);
}
