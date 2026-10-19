import * as core from '../../harness/core.mjs';
import { makeFast } from './fast-prof.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const inputs = CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 6 }).input);
const bases = () => inputs.map((inp) => core.decodeMesh(core.meshRegion({ ...inp, params: {} })));
for (let w = 0; w < 3; w++) { const b = bases(); inputs.forEach((inp, k) => add(b[k], inp)); }
globalThis.__MF_PROF = {};
const R = 5;
for (let r = 0; r < R; r++) { const b = bases(); inputs.forEach((inp, k) => add(b[k], inp)); }
let tot = 0;
for (const [k, v] of Object.entries(globalThis.__MF_PROF)) { console.log(`${k}: ${(v / (R * CH.length)).toFixed(2)} ms/chunk`); tot += v; }
console.log(`total ${(tot / (R * CH.length)).toFixed(2)} ms/chunk`);
