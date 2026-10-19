// Plan images for a config: node work/mf/look.mjs '<json config>' scene[,scene] [outdir]
// Writes a contact sheet (2×N grid of plan crops) to work/mf/img/<name>-<scenes>.png
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown, materialImageRgb } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { build } from './field.mjs';
import { regionFor, buildAny } from './sweep.mjs';

export function sheet(configs, names, file, { S = 16, crop = [4, 4, 28, 28] } = {}) {
  const tiles = [];
  for (const c of configs) {
    const A = buildAny(c);
    for (const n of names) {
      const scene = MATERIAL_SCENES.find((s) => s.name === n);
      const mesh = A.mesh(regionFor(scene, 10), null, core);
      const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: (a, i) => A.fragment(a, i, scene), scene });
      tiles.push(materialImageRgb(img, { crop: scene.window ?? crop }));
    }
  }
  const cols = names.length, rows = configs.length;
  const tw = tiles[0].width, th = tiles[0].height, gap = 6;
  const W = cols * tw + (cols - 1) * gap, H = rows * th + (rows - 1) * gap;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  tiles.forEach((t, k) => {
    const r = Math.floor(k / cols), c = k % cols;
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const s = (j * tw + i) * 3, d = ((r * (th + gap) + j) * W + c * (tw + gap) + i) * 3;
      rgb[d] = t.rgb[s]; rgb[d + 1] = t.rgb[s + 1]; rgb[d + 2] = t.rgb[s + 2];
    }
  });
  writePng(file, W, H, rgb);
  return file;
}

if (process.argv[1] && process.argv[1].endsWith('look.mjs') && process.argv[2]) {
  const configs = JSON.parse(process.argv[2]);
  const names = process.argv[3].split(',');
  const dir = join(import.meta.dirname, 'img');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, process.argv[4] ?? `${configs.map((c) => c.name).join('+')}.png`);
  console.log(sheet(Array.isArray(configs) ? configs : [configs], names, file, { S: Number(process.argv[5] ?? 16) }));
}
