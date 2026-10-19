// Edit bench (C-12): an edit at a chunk corner dirties 8 chunks; time mesh()
// of each (min of N, interleaved with hints) on the edited 52³ inputs.
//   node work/mv/editbench.mjs <module> [N]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const hints = await import(pathToFileURL(resolve('approaches/hints.mjs')).href);
const N = Number(process.argv[3] ?? 5);
const AP = mod.apron ?? 10;
// world corner between chunks: x = 0, z = 0 (chunks cx ∈ {−1, 0}, cz ∈ {−1, 0}); find the surface y there
const probe = buildGenMeshInput([1, 1], 0, 0, 0, new Map(), { forceApron: AP }).input;
let ys = -1;
{
  const { nx, ny, nz, apron, blocks } = probe;
  for (let y = ny - 2; y >= 0; y--) { const i = (y * nz + apron) * nx + apron; if ((blocks[i] & 0xff) && !(blocks[i + nx * nz] & 0xff)) { ys = y - apron; break; } }
}
const cy0 = Math.floor(ys / 32);
console.log(`surface at world (0, ${ys}, 0); chunks cy ${cy0 - 1}..${cy0}`);
// the edit: a 4×4 stone platform 2 high centred on the corner + a 1-wide diagonal plank line painted into the ground
const edits = [];
for (let x = -2; x < 2; x++) for (let z = -2; z < 2; z++) for (let y = ys + 1; y <= ys + 2; y++) edits.push([x, y, z, 3]);
for (let k = -6; k <= 6; k++) edits.push([k, ys, k, 5]);
function input(cx, cy, cz) {
  const inp = buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: AP }).input;
  const { nx, ny, nz, apron } = inp;
  for (const [x, y, z, v] of edits) {
    const rx = x - cx * 32 + apron, ry = y - cy * 32 + apron, rz = z - cz * 32 + apron;
    if (rx < 0 || ry < 0 || rz < 0 || rx >= nx || ry >= ny || rz >= nz) continue;
    const i = (ry * nz + rz) * nx + rx;
    inp.blocks[i] = v; inp.shapeEdited[i] = 1; inp.rho[i] = 1;
  }
  return inp;
}
const chunks = [];
for (const cx of [-1, 0]) for (const cy of [cy0 - 1, cy0]) for (const cz of [-1, 0]) chunks.push([cx, cy, cz]);
const inputs = chunks.map((c) => input(...c));
const best = [chunks.map(() => Infinity), chunks.map(() => Infinity)];
for (let r = 0; r < N; r++) for (let i = 0; i < chunks.length; i++) for (const [k, M] of [[0, hints], [1, mod]]) {
  const t0 = performance.now(); M.mesh(inputs[i], null, core); const t = performance.now() - t0;
  if (t < best[k][i]) best[k][i] = t;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
for (let i = 0; i < chunks.length; i++) console.log(`chunk ${chunks[i]}: hints ${best[0][i].toFixed(1)} ms, ${mod.name} ${best[1][i].toFixed(1)} ms`);
console.log(`8-chunk edit (min of ${N}): hints total ${sum(best[0]).toFixed(1)} ms (max ${Math.max(...best[0]).toFixed(1)}), ${mod.name} total ${sum(best[1]).toFixed(1)} ms (max ${Math.max(...best[1]).toFixed(1)}); extra per chunk mean ${((sum(best[1]) - sum(best[0])) / 8).toFixed(1)} ms, max ${Math.max(...best[1].map((t, i) => t - best[0][i])).toFixed(1)} ms`);
