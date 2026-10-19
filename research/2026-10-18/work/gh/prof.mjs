// Interleaved timing + per-phase profile on the edited mountain chunk and
// on unedited bench chunks (team gh).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { contourCross2 } from './syn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { readFileSync } from 'node:fs';
// reuse the edit set from editbench by importing its builder would rerun images; rebuild here
const SEED = [1, 1], CHUNK = 32;
const CX_MIN = -(2 ** 23) / 32, CX_SPAN = 2 ** 24 / 32, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const C = [-1, 1, 1];
const base = buildGenMeshInput(SEED, C[0], C[1], C[2], new Map(), { forceApron: 10 }).input;
const A = 10, n = base.nx, wx0 = C[0] * CHUNK - A, wy0 = C[1] * CHUNK - A, wz0 = C[2] * CHUNK - A;
const solidAt = (wx, wy, wz) => { const x = wx - wx0, y = wy - wy0, z = wz - wz0; if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return false; return (base.blocks[(y * n + z) * n + x] & 0xff) !== 0; };
const top = (wx, wz) => { for (let wy = wy0 + n - 1; wy >= wy0; wy--) if (solidAt(wx, wy, wz)) return wy; return wy0 - 1; };
const edits = new Map();
const set = (wx, wy, wz, v) => { const cx = Math.floor(wx / CHUNK), cy = Math.floor(wy / CHUNK), cz = Math.floor(wz / CHUNK); const k = key(cx, cy, cz); if (!edits.has(k)) edits.set(k, new Map()); edits.get(k).set(((wy - cy * CHUNK) * CHUNK + (wz - cz * CHUNK)) * CHUNK + (wx - cx * CHUNK), v); };
const X0 = C[0] * CHUNK, Z0 = C[2] * CHUNK;
for (let x = X0 + 12; x < X0 + 32; x++) for (let z = Z0 + 2; z < Z0 + 7; z++) { const h = 45 + (X0 + 31.5 - (x + 0.5)) / 4; for (let y = Math.floor(h); y <= top(x, z); y++) if (y + 0.5 >= h && solidAt(x, y, z)) set(x, y, z, 0); }
{ const cx = X0 + 22.3, cz = Z0 + 14.2, cy = top(X0 + 22, Z0 + 14) + 0.5; for (let x = X0 + 15; x < X0 + 30; x++) for (let z = Z0 + 8; z < Z0 + 21; z++) for (let y = Math.floor(cy) - 6; y < cy + 6; y++) if (!solidAt(x, y, z) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) < 5) set(x, y, z, 3); }
const edited = buildGenMeshInput(SEED, C[0], C[1], C[2], edits, { forceApron: 10 }).input;
const unedited = [[0, 0, -3], [0, 0, 0], [-2, 1, 1], [1, 0, 0]].map((c) => buildGenMeshInput(SEED, c[0], c[1], c[2], new Map(), { forceApron: 10 }).input);
const V = {
  repo: (r) => repoMesh({ ...r, params: {} }),
  'gh-cc8': (r) => { const c = contourCross2(r, { R: 8, w0: 1, dome: false }); return ghMesh({ ...r, crossT: c?.crossT, params: { k: 0, clearance: 'narrow' } }); },
  'gh-cc8-ao': (r) => { const c = contourCross2(r, { R: 8, w0: 1, dome: false }); return ghMesh({ ...r, crossT: c?.crossT, params: { k: 0, clearance: 'narrow', aoMode: 'position' } }); },
  'synth-only': (r) => contourCross2(r, { R: 8, w0: 1, dome: false }),
};
const best = {};
for (let round = 0; round < 12; round++) {
  for (const [name, f] of Object.entries(V)) {
    for (const [label, inp] of [['edited', edited], ...unedited.map((u, i) => [`plain${i}`, u])]) {
      const t0 = performance.now(); f(inp); const t = performance.now() - t0;
      const k = `${name} ${label}`; best[k] = Math.min(best[k] ?? Infinity, t);
    }
  }
}
for (const [k, t] of Object.entries(best)) console.log(k.padEnd(28), t.toFixed(2), 'ms');
