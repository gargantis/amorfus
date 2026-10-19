// Builder's gallery: typical placed structures on hinted ground.
//   node work/gs/tools/builds.mjs <approach.mjs> [noao]
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../../harness/core.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';
const [ap, noao] = process.argv.slice(2);
const approach = await import(pathToFileURL(resolve(ap)).href);
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, PLANKS = 5, BRICK = 6;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
const ground = (x, y, z) => { const d = 6.2 - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
const E = (v) => ({ v, edited: true });
function cell(x, y, z) {
  if (y >= 6) {
    if (x === 4 && z === 26 && y === 6) return E(STONE);                                   // single block
    if (z === 22 && x >= 3 && x < 12 && y === 6) return E(PLANKS);                         // 1-high curb
    if (x >= 15 && x < 21 && z >= 21 && z < 27 && y === 6) return E(STONE);                // 1-high 6×6 platform
    if (z === 15 && x >= 3 && x < 12 && y < 8) return E(BRICK);                            // 2-high wall
    if (x === 26 && z >= 14 && z < 24 && y < 9) return E(STONE);                           // 3-high 1-thick wall
    if (z >= 4 && z < 10 && x >= 6 && y < 6 + Math.max(0, Math.min(6, x - 14))) return E(STONE); // 1:1 stair
  }
  return ground(x, y, z);
}
const mesh = approach.mesh(core.buildRegion(cell, approach.apron ?? 10), null, core);
if (noao) mesh.ao.fill(1);
const img = renderShaded(mesh, { width: 640, height: 420, eye: [16, 22, 44], target: [15, 5, 14], fovDeg: 50, flatShading: approach.flatShading === true });
const out = join('work/gs/img', `${approach.name}-builds${noao ? '-noao' : ''}.png`);
writePng(out, img.width, img.height, img.rgb);
console.log(out);
