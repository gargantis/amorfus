#!/usr/bin/env node
// Real generated terrain WITH edits (work/gh/editscenes.mjs), rendered per
// variant with gn AO (or production AO), side by side per view.
//   node work/gh/render-edit.mjs <outPrefix> <scenario> v1,v2,… [--ao gn|prod|none] [--w 520 --h 360]
import { resolve } from 'node:path';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { VARIANTS } from './variants.mjs';
import { buildScenarios, scenarioInputs } from './editscenes.mjs';
import { withGnAo } from './gnao.mjs';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const prefix = resolve(args[0]);
const scen = args[1];
const names = args[2].split(',');
const aoMode = opt('--ao') ?? 'gn';
const W = Number(opt('--w') ?? 520), H = Number(opt('--h') ?? 360);
const sc = buildScenarios()[scen];
const VIEWS = {
  mountain: {
    overview: { eye: [46, 44, 16], target: [14, 18, 16] },
    road: { eye: [36, 30, -6], target: [20, 16, 6] },
    mound: { eye: [34, 34, 4], target: [22, 20, 14] },
    'pit-terrace': { eye: [8, 46, 40], target: [14, 24, 23] },
  },
  town: {
    overview: { eye: [16, 34, 44], target: [16, 16, 14] },
    houses: { eye: [36, 26, 36], target: [18, 18, 16] },
  },
}[scen];
const meshes = names.map((n) => {
  const v = VARIANTS[n];
  const inp = scenarioInputs(sc, v.apron ?? 10)[0];
  const m = core.decodeMesh(v.raw(inp));
  if (aoMode === 'gn') withGnAo(m, inp); else if (aoMode === 'none') m.ao.fill(1);
  return m;
});
for (const [label, cam] of Object.entries(VIEWS)) {
  const imgs = meshes.map((m) => renderShaded(m, { ...cam, width: W, height: H }));
  const cols = Math.min(imgs.length, Number(opt('--cols') ?? 2));
  const rows = Math.ceil(imgs.length / cols);
  const TW = cols * W + (cols - 1) * 4, TH = rows * H + (rows - 1) * 4;
  const rgb = new Uint8Array(TW * TH * 3).fill(255);
  imgs.forEach((im, k) => {
    const ox = (k % cols) * (W + 4), oy = Math.floor(k / cols) * (H + 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) for (let ch = 0; ch < 3; ch++) rgb[((oy + j) * TW + ox + i) * 3 + ch] = im.rgb[(j * W + i) * 3 + ch];
  });
  const out = `${prefix}-${scen}-${label}.png`;
  writePng(out, TW, TH, rgb);
  console.log(`${out}: ${names.join(' | ')} (AO ${aoMode})`);
}
