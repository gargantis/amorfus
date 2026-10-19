import * as core from './harness/core.mjs';
import { MATERIAL_SCENES } from './harness/scenes.mjs';
import { renderShaded } from './harness/raster.mjs';
import { writePng } from './harness/png.mjs';
const scene = MATERIAL_SCENES.find((s) => s.name === 'hill-materials');
const mesh = core.decodeMesh(core.meshRegion({ ...core.buildRegion(scene.cell, 10), params: {} }));
let lo = 1, hi = 0; for (const a of mesh.ao) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
console.log('AO range on the hinted hill:', lo.toFixed(3), hi.toFixed(3));
mesh.ao.fill(1);
const v = renderShaded(mesh, { ...scene.camera });
writePng('out/dbg-hill-noao.png', v.width, v.height, v.rgb);
