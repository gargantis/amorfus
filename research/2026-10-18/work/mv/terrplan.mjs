// Plan-view material sheets of real terrain chunks for several modules.
//   node work/mv/terrplan.mjs out.png cx,cy,cz x0,z0,w,h S mod1.mjs mod2.mjs ...
// (a module path of "hints" means the plain hints mesh)
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { rasterTopDown, PALETTE } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const [out, chunkS, winS, SS, ...mods] = process.argv.slice(2);
const chunk = chunkS.split(',').map(Number);
const [x0, z0, w, h] = winS.split(',').map(Number);
const S = Number(SS);
const tiles = [];
for (const mp of mods) {
  let mesh, frag = null;
  if (mp === 'hints') {
    const inp = buildGenMeshInput([1, 1], ...chunk, new Map(), { forceApron: 10 }).input;
    mesh = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  } else {
    const mod = await import(pathToFileURL(resolve(mp)).href);
    const inp = buildGenMeshInput([1, 1], ...chunk, new Map(), { forceApron: mod.apron ?? 10 }).input;
    mesh = mod.mesh(inp, null, core);
    if (mod.fragment) frag = (a, i) => mod.fragment(a, i, null);
  }
  const img = rasterTopDown(mesh, { x0, z0, w, h, S, fragment: frag });
  tiles.push(img);
}
const gap = 8;
const TW = tiles[0].W, TH = tiles[0].H;
const W = tiles.length * TW + (tiles.length - 1) * gap;
const rgb = new Uint8Array(W * TH * 3).fill(255);
tiles.forEach((img, k) => {
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const m = img.mat[j * TW + i];
    let c = m === 0 ? [30, 30, 30] : PALETTE[m];
    // shade by height a little so steps read
    const y = img.top[j * TW + i];
    const f = Number.isFinite(y) ? 0.75 + 0.25 * (((y % 4) + 4) % 4) / 4 : 1;
    const grid = i % S === 0 || j % S === 0 ? 0.85 : 1;
    const d = (j * W + k * (TW + gap) + i) * 3;
    rgb[d] = c[0] * f * grid; rgb[d + 1] = c[1] * f * grid; rgb[d + 2] = c[2] * f * grid;
  }
});
writePng(out, W, TH, rgb);
console.log(out);
