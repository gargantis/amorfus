// Side-by-side close views of real terrain: hints | approach.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const views = {
  'mtn-close': { chunk: [-1, 1, 1], eye: [30, 30, 30], target: [14, 16, 14] },
  'beach-close': { chunk: [0, 0, -3], eye: [26, 25, 27], target: [17, 18, 13] },
};
for (const [label, v] of Object.entries(views)) {
  const inp = buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: mod.apron ?? 10 }).input;
  const imgs = [];
  for (const A of [null, mod]) {
    const mesh = A ? A.mesh(inp, null, core) : core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
    imgs.push(renderShaded(mesh, { width: 480, height: 340, eye: v.eye, target: v.target, fragment: A?.fragment ? (a, i) => A.fragment(a, i, null) : null }));
  }
  const W = imgs[0].width * 2 + 6, H = imgs[0].height;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  imgs.forEach((im, k) => { for (let j = 0; j < H; j++) for (let i = 0; i < im.width; i++) for (let c = 0; c < 3; c++) rgb[(j * W + k * (im.width + 6) + i) * 3 + c] = im.rgb[(j * im.width + i) * 3 + c]; });
  const f = join(import.meta.dirname, 'img', `${label}-hints-vs-${mod.name}.png`);
  writePng(f, W, H, rgb);
  console.log(f);
}
