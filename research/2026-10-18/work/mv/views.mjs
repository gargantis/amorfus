// Perspective views of terrain chunks for several modules, side by side (2 per row).
//   node work/mv/views.mjs out.png view mod1 mod2 ...   (view: mountain|beach|mtn-close|beach-close|mtn-close2|stone-cliff)
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const VIEWS = {
  mountain: { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
  beach: { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
  'mtn-close': { chunk: [-1, 1, 1], eye: [30, 30, 30], target: [14, 16, 14] },
  'mtn-close2': { chunk: [-2, 1, 1], eye: [40, 36, 40], target: [16, 14, 16] },
  'beach-close': { chunk: [0, 0, -3], eye: [30, 26, 30], target: [18, 18, 14] },
  'stone-cliff': { chunk: [-3, 1, 0], eye: [44, 40, 44], target: [14, 14, 14] },
};
const [out, view, ...mods] = process.argv.slice(2);
const v = VIEWS[view];
const imgs = [];
for (const mp of mods) {
  let mesh, frag = null;
  if (mp === 'hints') { mesh = core.decodeMesh(core.meshRegion({ ...buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: 10 }).input, params: {} })); }
  else {
    const mod = await import(pathToFileURL(resolve(mp)).href);
    mesh = mod.mesh(buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: mod.apron ?? 10 }).input, null, core);
    if (mod.fragment) frag = (a, i) => mod.fragment(a, i, null);
  }
  imgs.push(renderShaded(mesh, { width: 560, height: 380, eye: v.eye, target: v.target, fragment: frag }));
}
const cols = Math.min(2, imgs.length), rows = Math.ceil(imgs.length / cols), gap = 6;
const W = cols * 560 + (cols - 1) * gap, H = rows * 380 + (rows - 1) * gap;
const rgb = new Uint8Array(W * H * 3).fill(255);
imgs.forEach((im, k) => {
  const r = Math.floor(k / cols), c = k % cols;
  for (let j = 0; j < 380; j++) for (let i = 0; i < 560; i++) {
    const s = (j * 560 + i) * 3, d = ((r * (380 + gap) + j) * W + c * (560 + gap) + i) * 3;
    rgb[d] = im.rgb[s]; rgb[d + 1] = im.rgb[s + 1]; rgb[d + 2] = im.rgb[s + 2];
  }
});
writePng(out, W, H, rgb);
console.log(out);
