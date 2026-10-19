// Near-top-down debug render (AO forced to 1) of a scene.
//   node work/gs/tools/topview.mjs <approach.mjs> <scene> [eyeY]
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';
const [ap, n, ey] = process.argv.slice(2);
const approach = await import(pathToFileURL(resolve(ap)).href);
const s = ALL_SCENES.find((x) => x.name === n);
const mesh = approach.mesh(core.buildRegion(s.cell, approach.apron ?? 10), s, core);
mesh.ao.fill(1);
const img = renderShaded(mesh, { width: 400, height: 400, eye: [16.2, Number(ey ?? 30), 18.5], target: [16.2, 6, 15.9], fovDeg: 40, flatShading: approach.flatShading === true });
const out = join('work/gs/img', `${approach.name}-${n}-top.png`);
writePng(out, img.width, img.height, img.rgb);
console.log(out);
