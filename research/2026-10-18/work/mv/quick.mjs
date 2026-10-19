// Quick material-scene evaluation of an approach module with option overrides.
//   node work/mv/quick.mjs <module.mjs> [k=v ...] [only=a,b] [img=dir]
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown, materialImageRgb } from '../../harness/raster.mjs';
import { materialMetrics } from '../../harness/metrics.mjs';
import { writePng } from '../../harness/png.mjs';
const args = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(args[0])).href);
const over = {};
let only = null, imgDir = null;
for (const a of args.slice(1)) {
  const [k, v] = a.split('=');
  if (k === 'only') only = v.split(',');
  else if (k === 'img') imgDir = v;
  else over[k] = isNaN(Number(v)) ? v : Number(v);
}
if (mod.OPT) Object.assign(mod.OPT, over);
const apron = mod.apronFor ? mod.apronFor(mod.OPT) : mod.apron ?? 10;
const f3 = (v) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(3));
let tot = 0;
const rows = [];
for (const scene of MATERIAL_SCENES) {
  if (only && !only.includes(scene.name)) continue;
  const region = core.buildRegion(scene.cell, apron);
  const t0 = performance.now();
  const mesh = mod.mesh(region, scene, core);
  const ms = performance.now() - t0;
  tot += ms;
  const frag = mod.fragment ? (a, i) => mod.fragment(a, i, scene) : null;
  const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S: 32, fragment: frag, scene });
  const r = materialMetrics(img, scene);
  if (imgDir) {
    mkdirSync(imgDir, { recursive: true });
    const crop = materialImageRgb(img, { crop: scene.window });
    writePng(join(imgDir, `${scene.name}-plan.png`), crop.width, crop.height, crop.rgb);
  }
  const worst = r.boundaries.reduce((a, b) => (b.std > (a?.std ?? -1) ? b : a), null);
  const b = r.boundaries.map((x) => `${f3(x.std)}/${f3(x.maxDev)}`).join(' ');
  const w = r.width ? ` w ${f3(r.width.min)}..${f3(r.width.mean)}` : '';
  rows.push(`${scene.name.padEnd(15)} ${b.padEnd(34)} area ×${f3(r.area.ratio)} parts ${r.components}${r.specks ? '+' + r.specks : ''}${w}  ${ms.toFixed(0)} ms`);
}
console.log(rows.join('\n'));
console.log(`total ${tot.toFixed(0)} ms; apron ${apron}; over ${JSON.stringify(over)}`);
