#!/usr/bin/env node
// Render one scene for several configs side by side (team gh, study only).
//   node work/gh/view.mjs <configs.mjs> <scene> <out.png> [--labels a,b] [--noao] [--eye x,y,z --target x,y,z] [--w 400 --h 280]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';

const args = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(args[0])).href);
const scene = ALL_SCENES.find((s) => s.name === args[1]);
if (!scene) throw new Error(`no scene ${args[1]}`);
const out = resolve(args[2]);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const labels = opt('--labels')?.split(',');
const noao = args.includes('--noao');
const W = Number(opt('--w') ?? 400), H = Number(opt('--h') ?? 280);
const cam = { ...scene.camera };
if (opt('--eye')) cam.eye = opt('--eye').split(',').map(Number);
if (opt('--target')) cam.target = opt('--target').split(',').map(Number);
const configs = mod.configs.filter((c) => !labels || labels.includes(c.label));
const imgs = [];
for (const c of configs) {
  const region = core.buildRegion(scene.cell, c.apron ?? 10);
  const mesh = c.mesh(region, core);
  if (noao) mesh.ao.fill(1);
  imgs.push(renderShaded(mesh, { ...cam, width: W, height: H, flatShading: c.flatShading === true }));
}
const cols = Math.min(imgs.length, Number(opt('--cols') ?? 3));
const rows = Math.ceil(imgs.length / cols);
const TW = cols * W + (cols - 1) * 4, TH = rows * H + (rows - 1) * 4;
const rgb = new Uint8Array(TW * TH * 3).fill(255);
imgs.forEach((im, k) => {
  const ox = (k % cols) * (W + 4), oy = Math.floor(k / cols) * (H + 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) for (let ch = 0; ch < 3; ch++) rgb[((oy + j) * TW + ox + i) * 3 + ch] = im.rgb[(j * W + i) * 3 + ch];
});
writePng(out, TW, TH, rgb);
console.log(`${out}: ${configs.map((c) => c.label).join(' | ')}`);
