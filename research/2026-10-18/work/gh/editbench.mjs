#!/usr/bin/env node
// Real generated terrain WITH player edits (team gh, study only).
//   node work/gh/editbench.mjs <approach.mjs> [more.mjs…] [--no-images]
// Seed (1,1), the harness's mountain chunk (−1,1,1). Edits, in world
// coordinates: a stone 1:3 ramp built up the slope, a stone mound, a dug
// pit, a cut terrace (flattened platform), a 1-thick brick wall and a 1×2
// tunnel into the hillside. Every approach meshes the same edited regions
// (apron = approach.apron, as REMESH would), reports ms, triangles, and
// renders two views.
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const images = !args.includes('--no-images');
const mods = [];
for (const a of args.filter((x) => !x.startsWith('--'))) mods.push(await import(pathToFileURL(resolve(a)).href));
const SEED = [1, 1];
const CHUNK = 32;
const CX_MIN = -(2 ** 23) / 32, CX_SPAN = 2 ** 24 / 32, CY_MIN = -256 / 32, CY_SPAN = 768 / 32;
const key = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const STONE = 3, BRICK = 6, AIR = 0;

// world surface height from an unedited region (apron 10 around chunk C)
const C = [-1, 1, 1];
const base = buildGenMeshInput(SEED, C[0], C[1], C[2], new Map(), { forceApron: 10 }).input;
const A = 10, n = base.nx;
const wx0 = C[0] * CHUNK - A, wy0 = C[1] * CHUNK - A, wz0 = C[2] * CHUNK - A;
const solidAt = (wx, wy, wz) => {
  const x = wx - wx0, y = wy - wy0, z = wz - wz0;
  if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return false;
  return (base.blocks[(y * n + z) * n + x] & 0xff) !== 0;
};
const top = (wx, wz) => { for (let wy = wy0 + n - 1; wy >= wy0; wy--) if (solidAt(wx, wy, wz)) return wy; return wy0 - 1; };

const edits = new Map();
const set = (wx, wy, wz, v) => {
  const cx = Math.floor(wx / CHUNK), cy = Math.floor(wy / CHUNK), cz = Math.floor(wz / CHUNK);
  const k = key(cx, cy, cz);
  if (!edits.has(k)) edits.set(k, new Map());
  const lx = wx - cx * CHUNK, ly = wy - cy * CHUNK, lz = wz - cz * CHUNK;
  edits.get(k).set((ly * CHUNK + lz) * CHUNK + lx, v);
};
const X0 = C[0] * CHUNK, Y0 = C[1] * CHUNK, Z0 = C[2] * CHUNK;
// 1) a 1:4 road dug into the hillside: x ∈ [X0+12, X0+32), z ∈ [Z0+2, Z0+7),
//    everything above h(x) = 45 + (X0+31.5 − x)/4 removed
for (let x = X0 + 12; x < X0 + 32; x++) for (let z = Z0 + 2; z < Z0 + 7; z++) {
  const h = 45 + (X0 + 31.5 - (x + 0.5)) / 4;
  for (let y = Math.floor(h); y <= top(x, z); y++) if (y + 0.5 >= h && solidAt(x, y, z)) set(x, y, z, AIR);
  for (let y = top(x, z) + 1; y + 0.5 < h; y++) set(x, y, z, STONE);
}
// 2) a stone mound r = 5 on the surface at (X0+22, Z0+14)
{
  const cx = X0 + 22.3, cz = Z0 + 14.2, cy = top(X0 + 22, Z0 + 14) + 0.5;
  for (let x = X0 + 15; x < X0 + 30; x++) for (let z = Z0 + 8; z < Z0 + 21; z++) for (let y = Math.floor(cy) - 6; y < cy + 6; y++) {
    if (!solidAt(x, y, z) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) < 5) set(x, y, z, STONE);
  }
}
// 3) a dug pit r = 4 at (X0+6, Z0+22)
{
  const cx = X0 + 6.4, cz = Z0 + 22.1, cy = top(X0 + 6, Z0 + 22) + 0.7;
  for (let x = X0 + 0; x < X0 + 14; x++) for (let z = Z0 + 15; z < Z0 + 30; z++) for (let y = Math.floor(cy) - 5; y <= Math.floor(cy) + 3; y++) {
    if (solidAt(x, y, z) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) < 4) set(x, y, z, AIR);
  }
}
// 4) a cut terrace: flatten [X0+16, X0+26) × [Z0+22, Z0+31) to the height at its centre
{
  const H = top(X0 + 21, Z0 + 26);
  for (let x = X0 + 16; x < X0 + 26; x++) for (let z = Z0 + 22; z < Z0 + 31; z++) {
    for (let y = H + 1; y <= top(x, z); y++) set(x, y, z, AIR);
    for (let y = top(x, z) + 1; y <= H; y++) set(x, y, z, STONE);
  }
  // 5) a 1-thick brick wall, 3 high, along the terrace's downhill edge
  for (let z = Z0 + 22; z < Z0 + 31; z++) for (let y = H + 1; y <= H + 3; y++) set(X0 + 25, y, z, BRICK);
}
let count = 0;
for (const m of edits.values()) count += m.size;

const input = (c, apron) => buildGenMeshInput(SEED, c[0], c[1], c[2], edits, { forceApron: apron }).input;
const outDir = join(HERE, 'editbench');
mkdirSync(outDir, { recursive: true });
console.log(`edits: ${count} blocks around chunk ${C}`);
for (const mod of mods) {
  const apron = mod.apron ?? 10;
  const inp = input(C, apron);
  for (let r = 0; r < 3; r++) mod.mesh(input(C, apron), null, core); // warm
  const t = [];
  let mesh;
  for (let r = 0; r < 9; r++) { const inp2 = input(C, apron); const t0 = performance.now(); mesh = mod.mesh(inp2, null, core); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  console.log(`${mod.name}: mesh median ${t[4].toFixed(1)} ms, min ${t[0].toFixed(1)} ms (apron ${apron}, generation excluded), ${mesh.T} triangles, ${mesh.V} vertices`);
  if (images) {
    const VIEWS = {
      'edit-overview': { eye: [46, 44, 16], target: [14, 18, 16] },
      'edit-road': { eye: [36, 30, -6], target: [20, 16, 6] },
      'edit-mound': { eye: [34, 34, 4], target: [22, 20, 14] },
      'edit-pit-terrace': { eye: [8, 46, 40], target: [14, 24, 23] },
    };
    for (const [label, v] of Object.entries(VIEWS)) {
      const img = renderShaded(mesh, { width: 560, height: 380, eye: v.eye, target: v.target, flatShading: mod.flatShading === true });
      writePng(join(outDir, `${mod.name}-${label}.png`), img.width, img.height, img.rgb);
    }
  }
}
