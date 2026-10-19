#!/usr/bin/env node
// Side-by-side renders of named variants (work/gh/variants.mjs) on a harness
// scene or a world from work/gh/worlds.mjs (team gh, study only).
//   node work/gh/render.mjs <out.png> <scene|world:name> v1,v2,… [--ao prod|none|gn]
//        [--eye x,y,z --target x,y,z] [--w 400 --h 280] [--cols 3] [--label]
import { resolve } from 'node:path';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { VARIANTS } from './variants.mjs';
import { WORLDS } from './worlds.mjs';
import { withGnAo } from './gnao.mjs';
import { ringNormals } from './ringnormals.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const out = resolve(args[0]);
const which = args[1];
const names = args[2].split(',');
const aoMode = opt('--ao') ?? 'prod';
const W = Number(opt('--w') ?? 400), H = Number(opt('--h') ?? 280);
let cell, cam;
if (which.startsWith('world:')) {
  const w = WORLDS[which.slice(6)];
  if (!w) throw new Error(`no world ${which}`);
  cell = w.cell;
  cam = { ...w.camera };
} else {
  const s = ALL_SCENES.find((x) => x.name === which);
  if (!s) throw new Error(`no scene ${which}`);
  cell = s.cell;
  cam = { ...s.camera };
}
if (opt('--eye')) cam.eye = opt('--eye').split(',').map(Number);
if (opt('--target')) cam.target = opt('--target').split(',').map(Number);
const imgs = [];
for (const n of names) {
  const v = VARIANTS[n];
  if (!v) throw new Error(`unknown variant ${n}`);
  const region = core.buildRegion(cell, v.apron ?? 10);
  const mesh = core.decodeMesh(v.raw(region));
  if (args.includes('--ring') && n.startsWith('gh')) ringNormals(mesh, region);
  if (aoMode === 'none') mesh.ao.fill(1);
  else if (aoMode === 'gn') withGnAo(mesh, region);
  imgs.push(renderShaded(mesh, { ...cam, width: W, height: H }));
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
console.log(`${out}: ${names.join(' | ')} (AO ${aoMode})`);
