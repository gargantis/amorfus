// Plan-crop contact sheet: rows = option sets for mv-quad, columns = scenes.
//   node work/mv/sheet.mjs out.png 'json[] option sets' scene,scene,...
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown, materialImageRgb } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import * as M from '../../approaches/mv-quad.mjs';
const [out, setsJ, namesS] = process.argv.slice(2);
const sets = JSON.parse(setsJ), names = namesS.split(',');
const S = 16, tiles = [];
for (const o of sets) {
  const save = { ...M.OPT }; Object.assign(M.OPT, o);
  for (const n of names) {
    const scene = MATERIAL_SCENES.find((s) => s.name === n);
    const mesh = M.mesh(core.buildRegion(scene.cell, 10), scene, core);
    const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: (a, i) => M.fragment(a, i, scene), scene });
    tiles.push(materialImageRgb(img, { crop: [8, 8, 24, 24] }));
  }
  Object.keys(M.OPT).forEach((k) => delete M.OPT[k]); Object.assign(M.OPT, save);
}
const cols = names.length, rows = sets.length, tw = tiles[0].width, th = tiles[0].height, gap = 6;
const W = cols * tw + (cols - 1) * gap, H = rows * th + (rows - 1) * gap;
const rgb = new Uint8Array(W * H * 3).fill(255);
tiles.forEach((t, k) => {
  const r = Math.floor(k / cols), c = k % cols;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) { const s = (j * tw + i) * 3, d = ((r * (th + gap) + j) * W + c * (tw + gap) + i) * 3; rgb[d] = t.rgb[s]; rgb[d + 1] = t.rgb[s + 1]; rgb[d + 2] = t.rgb[s + 2]; }
});
writePng(out, W, H, rgb);
console.log(out);
