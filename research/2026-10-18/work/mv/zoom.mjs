// Zoomed plan view with triangle edges: node work/mv/zoom.mjs <module> <scene> x0 z0 w h [S=64] [out=png] [k=v]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown, PALETTE } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const [modPath, sceneName, x0, z0, w, h, ...rest] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(modPath)).href);
let S = 64, out = `work/mv/zoom.png`;
const over = {};
for (const a of rest) { const [k, v] = a.split('='); if (k === 'S') S = +v; else if (k === 'out') out = v; else over[k] = isNaN(Number(v)) ? v : Number(v); }
if (mod.OPT) Object.assign(mod.OPT, over);
const scene = ALL_SCENES.find((s) => s.name === sceneName);
const apron = mod.apronFor ? mod.apronFor(mod.OPT) : mod.apron ?? 10;
const region = core.buildRegion(scene.cell, apron);
const mesh = mod.mesh(region, scene, core);
const frag = mod.fragment ? (a, i) => mod.fragment(a, i, scene) : null;
const img = rasterTopDown(mesh, { x0: +x0, z0: +z0, w: +w, h: +h, S, fragment: frag, scene });
const W = img.W, H = img.H;
const rgb = new Uint8Array(W * H * 3);
for (let k = 0; k < W * H; k++) {
  const m = img.mat[k];
  const c = m === 0 ? [20, 20, 20] : PALETTE[m];
  rgb[k * 3] = c[0]; rgb[k * 3 + 1] = c[1]; rgb[k * 3 + 2] = c[2];
}
// block grid (dark) and triangle edges of up-facing triangles (white, thin)
const put = (i, j, c, a = 1) => { if (i < 0 || j < 0 || i >= W || j >= H) return; const k = (j * W + i) * 3; for (let t = 0; t < 3; t++) rgb[k + t] = rgb[k + t] * (1 - a) + c[t] * a; };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (i % S === 0 || j % S === 0) put(i, j, [0, 0, 0], 0.35);
const { pos, tri, T } = mesh;
for (let t = 0; t < T; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
  const area = (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]) - (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]);
  if (area >= -1e-12) continue;
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const ax = (pos[p * 3] - +x0) * S, az = (pos[p * 3 + 2] - +z0) * S, bx = (pos[q * 3] - +x0) * S, bz = (pos[q * 3 + 2] - +z0) * S;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let s = 0; s <= n; s++) put(Math.round(ax + (bx - ax) * s / n), Math.round(az + (bz - az) * s / n), [255, 255, 255], 0.25);
  }
}
writePng(out, W, H, rgb);
console.log(out);
