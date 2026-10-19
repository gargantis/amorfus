// Debug: render a scene's view with fragments coloured by dominant axis
// (y=material as usual, x → brick colour, z → reserved7 blue) to see where
// the side planes take over.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { dominant } from './mxlib.mjs';
const [modPath, sceneName, out, ...rest] = process.argv.slice(2);
const mod = await import(new URL(modPath, `file://${process.cwd()}/`).href);
let region, cam;
if (sceneName.startsWith('terrain-')) {
  const V = { 'terrain-mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] }, 'terrain-beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] } }[sceneName];
  region = buildGenMeshInput([1, 1], ...V.chunk, new Map(), { forceApron: mod.apron ?? 10 }).input;
  cam = { eye: V.eye, target: V.target };
} else {
  const scene = ALL_SCENES.find((s) => s.name === sceneName);
  region = core.buildRegion(scene.cell, mod.apron ?? 10);
  cam = scene.camera;
}
const mesh = mod.mesh(region, null, core);
const mode = rest[0] ?? 'axis';
const frag = (a, i) => {
  const m = mod.fragment(a, i, null);
  if (mode === 'axis') { const [ax] = dominant(a[0], a[1], a[2]); return ax === 1 ? m : ax === 0 ? 6 : 7; }
  if (mode === 'own') return i.ownMat;
  return m;
};
const W = Number(rest[1] ?? 960), H = Number(rest[2] ?? 640);
const img = renderShaded(mesh, { width: W, height: H, ...cam, fragment: frag });
writePng(out, img.width, img.height, img.rgb);
console.log('wrote', out);
