// Seam test: shared boundary vertices must come out identical (position,
// normal, AO) from either chunk's region.
//  (1) a built (shape-edited) mound straddling the x = 32 chunk boundary;
//  (2) two adjacent generated chunks from the bench (seed 1,1).
import * as core from '../../harness/core.mjs';
import { BASE } from '../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const AIR = 0, STONE = 3, GRASS = 1, DIRT = 2;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
const ground = (x, y, z) => { const d = BASE - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: BASE - 1 - y === 0 ? GRASS : DIRT, rho: clampRho(d) }; };
const C = [32.3, BASE, 15.7];
const world = (x, y, z) => (y >= BASE && Math.hypot(x + 0.5 - C[0], y + 0.5 - C[1], z + 0.5 - C[2]) < 6.4 ? { v: STONE, edited: true } : ground(x, y, z));
function compare(A, B, offB, axis, plane) {
  // A, B plain meshes; B's coords + offB = world; compare vertices near plane
  const key = (x, y, z) => `${Math.round(x * 256)},${Math.round(y * 256)},${Math.round(z * 256)}`;
  const mapB = new Map();
  for (let v = 0; v < B.V; v++) {
    const p = [B.pos[v * 3] + offB[0], B.pos[v * 3 + 1] + offB[1], B.pos[v * 3 + 2] + offB[2]];
    if (Math.abs(p[axis] - plane) > 0.75) continue;
    mapB.set(key(...p) + `|${B.mat[v]}|${B.flags[v]}`, v);
  }
  let shared = 0, posOnly = 0, nrmBad = 0, aoBad = 0, near = 0;
  const pts = [];
  for (let v = 0; v < B.V; v++) { const p = [B.pos[v * 3] + offB[0], B.pos[v * 3 + 1] + offB[1], B.pos[v * 3 + 2] + offB[2]]; if (Math.abs(p[axis] - plane) <= 0.75) pts.push(p); }
  for (let v = 0; v < A.V; v++) {
    const p = [A.pos[v * 3], A.pos[v * 3 + 1], A.pos[v * 3 + 2]];
    if (Math.abs(p[axis] - plane) > 0.75) continue;
    const w = mapB.get(key(...p) + `|${A.mat[v]}|${A.flags[v]}`);
    if (w === undefined) {
      // a B vertex very close but not identical = crack
      for (const q of pts) { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d > 0 && d < 0.02) { near++; break; } }
      continue;
    }
    shared++;
    for (let a = 0; a < 3; a++) if (A.nrm[v * 3 + a] !== B.nrm[w * 3 + a]) { nrmBad++; break; }
    if (A.ao[v] !== B.ao[w]) aoBad++;
  }
  return { shared, nearMiss: near, normalMismatch: nrmBad, aoMismatch: aoBad };
}
const names = process.argv.slice(2);
for (const n of names) {
  const M = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  const ap = M.apron ?? 10;
  const A = M.mesh(core.buildRegion(world, ap), null, core);
  const B = M.mesh(core.buildRegion((x, y, z) => world(x + 32, y, z), ap), null, core);
  const r1 = compare(A, B, [32, 0, 0], 0, 32);
  const inp = (c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: ap }).input;
  const G1 = M.mesh(inp([-1, 1, 1]), null, core), G0 = M.mesh(inp([-2, 1, 1]), null, core);
  // G0 is at x-32 relative to G1: world(G0) = local - 32 relative to G1's origin
  const r2 = compare(G1, G0, [-32, 0, 0], 0, 0);
  const inp2 = (c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: ap }).input;
  const H1 = M.mesh(inp2([-1, 1, 1]), null, core), H2 = M.mesh(inp2([-1, 1, 2]), null, core);
  const r3 = compare(H1, H2, [0, 0, 32], 2, 32);
  console.log(`${n}: built mound across x=32 ${JSON.stringify(r1)} | terrain x-seam ${JSON.stringify(r2)} | terrain z-seam ${JSON.stringify(r3)}`);
}
