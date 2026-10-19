// Debug render with AO forced to 1 (geometry + normals only).
//   node work/gs/tools/noao.mjs <approach.mjs> <scene> [<scene> ...]
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';
const [ap, ...names] = process.argv.slice(2);
const approach = await import(pathToFileURL(resolve(ap)).href);
for (const n of names) {
  const s = ALL_SCENES.find((x) => x.name === n);
  const mesh = approach.mesh(core.buildRegion(s.cell, approach.apron ?? 10), s, core);
  mesh.ao.fill(1);
  const img = renderShaded(mesh, { ...s.camera, flatShading: approach.flatShading === true });
  const out = join('work/gs/img', `${approach.name}-${n}-noao.png`);
  writePng(out, img.width, img.height, img.rgb);
  console.log(out);
}
