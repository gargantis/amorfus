// Height profile of a harness scene along x at z = zc vs the ideal h(x).
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { VARIANTS } from './variants.mjs';
const [sceneName, names, zcs, x0s, x1s, steps] = process.argv.slice(2);
const scene = ALL_SCENES.find((s) => s.name === sceneName);
const zc = Number(zcs ?? 16.5), x0 = Number(x0s ?? 2), x1 = Number(x1s ?? 30), step = Number(steps ?? 0.5);
const S = 16;
for (const n of names.split(',')) {
  const v = VARIANTS[n];
  const region = core.buildRegion(scene.cell, v.apron ?? 10);
  const mesh = core.decodeMesh(v.raw(region));
  const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S });
  const j = Math.floor(zc * S);
  const row = [];
  for (let x = x0; x < x1; x += step) row.push(img.top[j * img.W + Math.floor(x * S)].toFixed(2));
  console.log(n.padEnd(12), row.join(' '));
}
