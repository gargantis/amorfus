// Interleaved medians per chunk (16 bench chunks × 7 reps after warm-up):
// generation per apron, hints mesh per apron, mf field pass per variant.
import * as core from '../../harness/core.mjs';
import { makeFast } from './fast.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const iso = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
const lite = makeFast({ sigma: 0.9, trunc: 1.5, tau: 0.6, bits: 5, R: 0.5, flipTwist: 0.03 });
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const T = {};
const push = (k, v) => (T[k] ??= []).push(v);
for (let rep = 0; rep < 9; rep++) {
  for (const c of CH) {
    const inp = {};
    for (const a of [3, 4, 6, 10]) { const t0 = performance.now(); inp[a] = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: a }).input; if (rep >= 2) push(`gen a${a}`, performance.now() - t0); }
    const base = {};
    for (const a of [3, 4, 6, 10]) { const t0 = performance.now(); base[a] = core.decodeMesh(core.meshRegion({ ...inp[a], params: {} })); if (rep >= 2) push(`hints mesh a${a}`, performance.now() - t0); }
    let t0 = performance.now(); iso(base[6], inp[6]); if (rep >= 2) push('mf-iso field (a6)', performance.now() - t0);
    t0 = performance.now(); lite(base[4], inp[4]); if (rep >= 2) push('mf-lite field (a4)', performance.now() - t0);
  }
}
for (const [k, v] of Object.entries(T)) { const s = v.sort((a, b) => a - b); console.log(`${k}: median ${s[Math.floor(s.length / 2)].toFixed(2)} ms`); }
