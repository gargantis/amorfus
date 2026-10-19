// vgn: mf-iso alone | gn-best + mf-iso, same camera, real terrain and the hill scene.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import * as MF from '../../approaches/vgn-mf10.mjs';
import * as GM from '../../approaches/vgn-gnmf.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
const OUT = new URL('../../out/vgn-gnmf/img/', import.meta.url).pathname;
const views = [
  ['terrain-mountain', [-1, 1, 1], { eye: [44, 40, 44], target: [14, 14, 14] }],
  ['terrain-beach', [0, 0, -3], { eye: [40, 34, 42], target: [15, 18, 15] }],
];
function row(path, meshes, cam, frags) {
  const imgs = meshes.map((m, i) => renderShaded(m, { width: 480, height: 330, ...cam, fragment: frags[i] }));
  const gap = 4, W = imgs.length * 480 + gap * (imgs.length - 1), H = 330;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  imgs.forEach((im, k) => { for (let j = 0; j < H; j++) for (let i = 0; i < 480; i++) for (let c = 0; c < 3; c++) rgb[(j * W + k * (480 + gap) + i) * 3 + c] = im.rgb[(j * 480 + i) * 3 + c]; });
  writePng(path, W, H, rgb);
  console.log(path);
}
for (const [n, c, cam] of views) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  row(`${OUT}cmp-${n}.png`, [MF.mesh(inp, null, core), GM.mesh(inp, null, core)], cam, [(a, i) => MF.fragment(a, i, null), (a, i) => GM.fragment(a, i, null)]);
}
const hill = ALL_SCENES.find((s) => s.name === 'hill-materials');
const r = core.buildRegion(hill.cell, 10);
row(`${OUT}cmp-hill-materials.png`, [MF.mesh(r, hill, core), GM.mesh(r, hill, core)], hill.camera, [(a, i) => MF.fragment(a, i, hill), (a, i) => GM.fragment(a, i, hill)]);
