import * as core from '../../../harness/core.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
const region = buildGenMeshInput([1, 1], -1, 1, 1, new Map(), { forceApron: 10 }).input;
const m = core.decodeMesh(core.meshRegion(region));
const pts = [];
for (let v = 0; v < m.V; v++) {
  const nx = Math.abs(m.nrm[v * 3]), ny = Math.abs(m.nrm[v * 3 + 1]), nz = Math.abs(m.nrm[v * 3 + 2]);
  if (nx > ny && nx >= nz && m.mat[v] !== 3) pts.push([m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2], m.mat[v]]);
}
console.log('x-dominant non-stone vertices', pts.length);
const hist = new Map();
for (const p of pts) { const k = `${Math.floor(p[0] / 4) * 4},${Math.floor(p[2] / 4) * 4}`; hist.set(k, (hist.get(k) ?? 0) + 1); }
console.log([...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
const ys = pts.map((p) => p[1]); console.log('y range', Math.min(...ys), Math.max(...ys));
