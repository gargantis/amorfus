// where does gh-cc8b spend time on the dense town input?
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { contourCross5 } from './syn2.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
import { readFileSync } from 'node:fs';
// rebuild the town edit set by importing editbench2's builder is awkward; replicate quickly
const SEED = [1, 1], CHUNK = 32;
const CX_MIN = -(2 ** 23) / 32, CX_SPAN = 2 ** 24 / 32, CY_MIN = -8, CY_SPAN = 24;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const g = buildGenMeshInput(SEED, 1, 0, 0, new Map(), { forceApron: 0 }).input;
const genSolid = (wx, wy, wz) => { const x = wx - 32, y = wy, z = wz; if (x < 0 || x >= 32 || y < 0 || y >= 32 || z < 0 || z >= 32) return false; return (g.blocks[(y * 32 + z) * 32 + x] & 0xff) !== 0; };
const topAt = (wx, wz) => { for (let y = 31; y >= 0; y--) if (genSolid(wx, y, wz)) return y; return -1; };
const edits = new Map();
const set = (wx, wy, wz, v) => { const cx = Math.floor(wx / CHUNK), cy = Math.floor(wy / CHUNK), cz = Math.floor(wz / CHUNK); const k = key(cx, cy, cz); if (!edits.has(k)) edits.set(k, new Map()); edits.get(k).set(((wy - cy * CHUNK) * CHUNK + (wz - cz * CHUNK)) * CHUNK + (wx - cx * CHUNK), v); };
const X0 = 32, Z0 = 0, H = 16;
for (let x = X0 + 2; x < X0 + 30; x++) for (let z = Z0 + 2; z < Z0 + 30; z++) { const t = topAt(x, z); for (let y = H + 1; y <= t; y++) set(x, y, z, 0); for (let y = t + 1; y <= H; y++) set(x, y, z, 3); }
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const hx = X0 + 4 + 9 * i, hz = Z0 + 4 + 9 * j;
  for (let x = hx; x < hx + 5; x++) for (let z = hz; z < hz + 5; z++) for (let y = H + 1; y <= H + 5; y++) { const wall = x === hx || x === hx + 4 || z === hz || z === hz + 4; const door = z === hz && x === hx + 2 && (y === H + 1 || y === H + 2); if ((wall || y === H + 5) && !door) set(x, y, z, 5); }
  for (let k = 0; k < 8; k++) for (let y = H + 1; y <= H + 1 + Math.floor(k / 2); y++) set(hx + 5, y, hz + 4 - (k >> 1), 3); }
const inp = buildGenMeshInput(SEED, 1, 0, 0, edits, { forceApron: 10 }).input;
let best = { cc: 1e9, mesh: 1e9, repo: 1e9 }, st;
for (let r = 0; r < 7; r++) {
  let t0 = performance.now(); const c = contourCross5(inp, cc8b.CFG); best.cc = Math.min(best.cc, performance.now() - t0); st = c.stats;
  t0 = performance.now(); ghMesh({ ...inp, crossT: c.crossT, params: cc8b.PARAMS }); best.mesh = Math.min(best.mesh, performance.now() - t0);
  t0 = performance.now(); repoMesh({ ...inp, params: {} }); best.repo = Math.min(best.repo, performance.now() - t0);
}
console.log(best, st);
