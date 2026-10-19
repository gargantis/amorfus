// Custom scenes (not in the harness) rendered with the harness renderer.
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { renderShaded, rasterTopDown, materialImageRgb } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { clampRho } from '../../harness/scenes.mjs';
import { build } from './field.mjs';
const { AIR, GRASS, DIRT, STONE, SAND, PLANKS, BRICK } = core;
const BASE = 6;
const ground = (x, y, z) => {
  const d = BASE - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = BASE - 1 - y;
  return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
};
export const CUSTOM = {
  // a 1-thick smooth planks wall (3 high) and a 3-thick brick block on grass,
  // plus a stone 1-high step: material meets material across a crease
  walls: {
    cell: (x, y, z) => {
      if (y >= BASE && y < BASE + 3 && x === 12 && z >= 8 && z < 24) return { v: PLANKS, edited: true };
      if (y >= BASE && y < BASE + 2 && x >= 18 && x < 21 && z >= 10 && z < 16) return { v: BRICK, edited: true };
      if (y === BASE && x >= 17 && x < 24 && z >= 18 && z < 25) return { v: STONE, edited: true };
      return ground(x, y, z);
    },
    camera: { eye: [30, BASE + 9, 34], target: [16, BASE + 1, 15] },
  },
};
CUSTOM['walls-close'] = { cell: CUSTOM.walls.cell, camera: { eye: [16.5, BASE + 3.2, 21], target: [15.5, BASE + 0.8, 12.5] } };
CUSTOM['walls-close2'] = { cell: CUSTOM.walls.cell, camera: { eye: [9.5, BASE + 3.5, 19], target: [12.5, BASE + 0.5, 14] } };
const args = process.argv.slice(2);
const sceneName = args[0];
const configs = JSON.parse(args[1]);
const sc = CUSTOM[sceneName];
const region = core.buildRegion(sc.cell, 10);
if (args[2] === 'hints') {
  const mesh = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  const img = renderShaded(mesh, { ...sc.camera, width: 480, height: 320 });
  const f = join(import.meta.dirname, 'img', `${sceneName}-hints.png`);
  writePng(f, img.width, img.height, img.rgb);
  console.log(f);
}
for (const c of configs) {
  const A = build(c);
  const mesh = A.mesh(region, null, core);
  const img = renderShaded(mesh, { ...sc.camera, width: 480, height: 320, fragment: (a, i) => A.fragment(a, i, null) });
  const f = join(import.meta.dirname, 'img', `${sceneName}-${c.name}.png`);
  writePng(f, img.width, img.height, img.rgb);
  console.log(f, JSON.stringify(mesh.mfStats));
}
