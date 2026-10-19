// Seam test: vertices on the face shared by chunk c and its +x / +z / +y
// neighbour must carry identical fields (same corner, same material).
import * as core from '../../harness/core.mjs';
import { makeFast } from './fast.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
const meshOf = (c) => { const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 6 }).input; return add(core.decodeMesh(core.meshRegion({ ...inp, params: {} })), inp); };
const PAIRS = [[[-1, 1, 1], 0], [[-2, 1, 1], 2], [[0, 0, -3], 0], [[-1, 0, 0], 1], [[0, 0, 0], 2], [[-3, 1, 0], 0]];
let shared = 0, diff = 0;
for (const [c, axis] of PAIRS) {
  const d = [0, 0, 0]; d[axis] = 1;
  const a = meshOf(c), b = meshOf([c[0] + d[0], c[1] + d[1], c[2] + d[2]]);
  const map = new Map();
  for (let v = 0; v < a.V; v++) if (a.corner[v * 3 + axis] === 32 && !(a.flags[v] & 1)) map.set(`${a.corner[v * 3 + (axis + 1) % 3]},${a.corner[v * 3 + (axis + 2) % 3]},${a.mat[v]}`, Array.from(a.attrs.subarray(v * 8, v * 8 + 8)).join());
  for (let v = 0; v < b.V; v++) {
    if (b.corner[v * 3 + axis] !== 0 || (b.flags[v] & 1)) continue;
    const k = `${b.corner[v * 3 + (axis + 1) % 3]},${b.corner[v * 3 + (axis + 2) % 3]},${b.mat[v]}`;
    if (!map.has(k)) continue;
    shared++;
    if (map.get(k) !== Array.from(b.attrs.subarray(v * 8, v * 8 + 8)).join()) diff++;
  }
}
console.log(`seam vertices shared by neighbouring chunks: ${shared}, fields differing: ${diff}`);
