// Close views of real terrain chunks, hints vs an approach module.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const views = {
  'mtn-close': { chunk: [-1, 1, 1], eye: [30, 30, 30], target: [14, 16, 14] },
  'mtn-close2': { chunk: [-2, 1, 1], eye: [40, 36, 40], target: [16, 14, 16] },
  'beach-close': { chunk: [0, 0, -3], eye: [30, 26, 30], target: [18, 18, 14] },
  'stone-cliff': { chunk: [-3, 1, 0], eye: [44, 40, 44], target: [14, 14, 14] },
};
for (const [label, v] of Object.entries(views)) {
  const inp = buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: 10 }).input;
  for (const [tag, A] of [['hints', null], [mod.name, mod]]) {
    const mesh = A ? A.mesh(inp, null, core) : core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
    const img = renderShaded(mesh, { width: 560, height: 380, eye: v.eye, target: v.target, fragment: A?.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const f = join(import.meta.dirname, 'img', `${label}-${tag}.png`);
    writePng(f, img.width, img.height, img.rgb);
    console.log(f);
  }
}
