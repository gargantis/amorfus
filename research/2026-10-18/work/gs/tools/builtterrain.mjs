// Real generated terrain (seed 1,1; the bench's beach chunk) WITH builds:
// a mound, a 1:3 ramp, a 1-high platform and a 1:1 stair placed on the
// generated surface. Renders hints vs an approach, with and without AO.
//   node work/gs/tools/builtterrain.mjs <approach.mjs> [...]
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../../harness/core.mjs';
import { buildGenMeshInput, localIndex } from '../../../lib/gen-mesh.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';
const CX_MIN = -(2 ** 18), CX_SPAN = 2 ** 19, CY_MIN = -8, CY_SPAN = 24;
const packChunkKey = (cx, cy, cz) => ((cx - CX_MIN) * CX_SPAN + (cz - CX_MIN)) * CY_SPAN + (cy - CY_MIN);
const SEED = [1, 1], CH = [0, 0, -3];
const CAM = process.env.CAM ? JSON.parse(process.env.CAM) : { eye: [40, 34, 42], target: [15, 18, 15] };
const TAG = process.env.TAG ?? '';
const STONE = 3, PLANKS = 5, BRICK = 6;
// surface height per column from the unedited region
const base = buildGenMeshInput(SEED, CH[0], CH[1], CH[2], new Map(), { forceApron: 10 }).input;
const n = base.nx, A = base.apron;
const top = (lx, lz) => { for (let y = n - 1; y >= 0; y--) if ((base.blocks[(y * n + (lz + A)) * n + (lx + A)] & 0xff) !== 0) return y - A; return -999; };
const edits = new Map();
const put = (lx, ly, lz, v) => {
  const wx = CH[0] * 32 + lx, wy = CH[1] * 32 + ly, wz = CH[2] * 32 + lz;
  const cx = Math.floor(wx / 32), cy = Math.floor(wy / 32), cz = Math.floor(wz / 32);
  const k = packChunkKey(cx, cy, cz);
  if (!edits.has(k)) edits.set(k, new Map());
  edits.get(k).set(localIndex(wx - cx * 32, wy - cy * 32, wz - cz * 32), v);
};
for (let lx = 0; lx < 32; lx++) for (let lz = 0; lz < 32; lz++) {
  const t = top(lx, lz) + 1; // first air
  // mound r 5 centred at (8, 8)
  const dm = Math.hypot(lx + 0.5 - 8, lz + 0.5 - 8);
  if (dm < 5) for (let y = t; y < t + Math.floor(Math.sqrt(25 - dm * dm)); y++) put(lx, y, lz, STONE);
  // 1:3 ramp along +x at z 18..24, from x 4 to 22
  if (lz >= 18 && lz < 24 && lx >= 4 && lx < 22) for (let y = t; y < t + Math.floor((lx - 4 + 0.5) / 3) + 1; y++) put(lx, y, lz, STONE);
  // 1-high 6×6 platform of planks at (20..25, 4..9)
  if (lx >= 20 && lx < 26 && lz >= 4 && lz < 10) put(lx, t, lz, PLANKS);
  // 1:1 brick stair along +z at x 27..30, z 14..22
  if (lx >= 27 && lx < 31 && lz >= 14 && lz < 23) for (let y = t; y < t + (lz - 14) + 1; y++) put(lx, y, lz, BRICK);
}
console.log('surface y at (8,8)', top(8, 8), '(13,21)', top(13, 21), '(22,6)', top(22, 6), '(28,18)', top(28, 18));
for (const ap of process.argv.slice(2)) {
  const approach = await import(pathToFileURL(resolve(ap)).href);
  const inp = buildGenMeshInput(SEED, CH[0], CH[1], CH[2], edits, { forceApron: approach.apron ?? 10 }).input;
  for (const noao of [false, true]) {
    const mesh = approach.mesh(inp, null, core);
    if (noao) mesh.ao.fill(1);
    const img = renderShaded(mesh, { width: 560, height: 380, eye: CAM.eye, target: CAM.target, flatShading: approach.flatShading === true });
    const out = join('work/gs/img', `${approach.name}-terrain-beach-built${TAG}${noao ? '-noao' : ''}.png`);
    writePng(out, img.width, img.height, img.rgb);
    console.log(out);
  }
}
