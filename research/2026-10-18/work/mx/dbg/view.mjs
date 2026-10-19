// Debug/compare renders on real terrain or a scene with any approach.
//  node view.mjs <approach.mjs> <terrain-mountain|terrain-beach|scene|cx,cy,cz> <out.png> [mode] [W H] [eye] [target]
//  mode: mat (default) | axis (x → brick, z → reserved7) | nosurf (fallbacks → reserved7) | own
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { renderShaded } from '../../../harness/raster.mjs';
import { writePng } from '../../../harness/png.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [modPath, where, out, mode = 'mat', Ws = '560', Hs = '380', eyeS, tgtS] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(modPath)).href);
const VIEWS = { 'terrain-mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] }, 'terrain-beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] } };
let region, cam;
if (VIEWS[where] || where.includes(',')) {
  const V = VIEWS[where] ?? { chunk: where.split(',').map(Number), eye: [44, 40, 44], target: [14, 14, 14] };
  region = buildGenMeshInput([1, 1], ...V.chunk, new Map(), { forceApron: mod.apron ?? 10 }).input;
  cam = { eye: V.eye, target: V.target };
} else {
  const scene = ALL_SCENES.find((s) => s.name === where);
  region = core.buildRegion(scene.cell, mod.apron ?? 10);
  cam = scene.camera;
}
if (eyeS) cam.eye = eyeS.split(',').map(Number);
if (tgtS) cam.target = tgtS.split(',').map(Number);
const mesh = mod.mesh(region, null, core);
const dom = (a) => { const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2]); return ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2; };
const frag = (a, i) => {
  if (mode === 'own') return i.ownMat;
  const m = mod.fragment ? mod.fragment(a, i, null) : i.ownMat;
  if (mode === 'axis') { const ax = dom(a); return ax === 1 ? m : ax === 0 ? 6 : 7; }
  return m;
};
const img = renderShaded(mesh, { width: Number(Ws), height: Number(Hs), ...cam, fragment: frag });
writePng(out, img.width, img.height, img.rgb);
console.log('wrote', out);
