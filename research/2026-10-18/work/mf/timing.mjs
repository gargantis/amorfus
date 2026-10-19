// Interleaved medians: hints mesh at apron 3/10, mf-iso (base + field) at apron 6, gen cost.
import * as core from '../../harness/core.mjs';
import { makeFast } from './fast.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const inputs = { 3: CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 3 }).input), 6: CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 6 }).input), 10: CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input) };
const T = { h3: [], h10: [], base6: [], field6: [] };
for (let rep = 0; rep < 9; rep++) {
  for (let k = 0; k < CH.length; k++) {
    let t0 = performance.now(); core.decodeMesh(core.meshRegion({ ...inputs[3][k], params: {} })); T.h3.push(performance.now() - t0);
    t0 = performance.now(); core.decodeMesh(core.meshRegion({ ...inputs[10][k], params: {} })); T.h10.push(performance.now() - t0);
    t0 = performance.now(); const b = core.decodeMesh(core.meshRegion({ ...inputs[6][k], params: {} })); const t1 = performance.now(); add(b, inputs[6][k]); const t2 = performance.now();
    T.base6.push(t1 - t0); T.field6.push(t2 - t1);
  }
}
const med = (v) => { const s = v.slice(CH.length * 2).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const mean = (v) => { const s = v.slice(CH.length * 2); return s.reduce((a, b) => a + b, 0) / s.length; };
for (const [k, v] of Object.entries(T)) console.log(`${k}: median ${med(v).toFixed(2)} ms, mean ${mean(v).toFixed(2)} ms per chunk`);
