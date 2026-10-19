// Plan view of a shoreline with the EXACT contour H = SEA+2 (rendered
// coordinates: generator point p − ½) drawn as a black line.
//   node work/gm/shore-img.mjs <out.png> <cx,cy,cz> <x0,z0,w,h> S a.mjs …
import { resolve } from 'node:path';
import * as core from '../../harness/core.mjs';
import { rasterTopDown, PALETTE } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { heightAt } from './gen-gm.mjs';
import { loadMods } from './terrain-metrics.mjs';
import { tile } from './views.mjs';
const [out, ch, win, Sarg, ...files] = process.argv.slice(2);
const c = ch.split(',').map(Number), [x0, z0, w, h] = win.split(',').map(Number), S = Number(Sarg);
const mods = await loadMods(files);
const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: 10 }).input;
const W = w * S, Hh = h * S;
// exact field per pixel
const sgn = new Int8Array(W * Hh);
for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
  const x = x0 + (i + 0.5) / S, z = z0 + (j + 0.5) / S;
  sgn[j * W + i] = heightAt([1, 1], c[0] * 32 + x - 0.5, c[2] * 32 + z - 0.5) <= 2 ? 1 : -1;
}
const tiles = mods.map((A) => {
  const m = A.mesh(inp, null, core);
  const img = rasterTopDown(m, { x0, z0, w, h, S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
  const rgb = new Uint8Array(W * Hh * 3);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, mm = img.mat[k];
    let col = mm === 0 ? [20, 20, 20] : PALETTE[mm];
    const grid = (i % S === 0 || j % S === 0) ? 0.85 : 1;
    const edge = (i + 1 < W && sgn[k] !== sgn[k + 1]) || (j + 1 < Hh && sgn[k] !== sgn[k + W]);
    if (edge) col = [0, 0, 0];
    for (let q = 0; q < 3; q++) rgb[k * 3 + q] = edge ? 0 : col[q] * grid;
  }
  return { width: W, height: Hh, rgb };
});
const t = tile([tiles]);
writePng(resolve(out), t.width, t.height, t.rgb);
console.log(resolve(out), mods.map((m) => m.name).join(' | '));
