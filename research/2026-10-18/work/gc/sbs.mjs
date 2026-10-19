// Side-by-side renders (same camera) of several approaches: one PNG per view.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const [outPath, sceneName, camJson, ...names] = process.argv.slice(2);
const scene = ALL_SCENES.find((s) => s.name === sceneName);
const cam = camJson === '-' ? scene.camera : JSON.parse(camJson);
const imgs = [];
for (const n of names) {
  const A = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  const m = A.mesh(core.buildRegion(scene.cell, A.apron ?? 10), null, core);
  imgs.push(renderShaded(m, { width: 360, height: 270, ...cam, flatShading: A.flatShading === true }));
}
const W = imgs.reduce((s, i) => s + i.width + 4, -4), H = imgs[0].height;
const rgb = new Uint8Array(W * H * 3).fill(255);
let x0 = 0;
for (const im of imgs) {
  for (let j = 0; j < H; j++) for (let i = 0; i < im.width; i++) for (let c = 0; c < 3; c++) rgb[(j * W + x0 + i) * 3 + c] = im.rgb[(j * im.width + i) * 3 + c];
  x0 += im.width + 4;
}
writePng(outPath, W, H, rgb);
console.log('wrote', outPath, names.join(' | '));
