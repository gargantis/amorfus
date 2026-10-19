#!/usr/bin/env node
// vmf: score the adversarial plan scenes with the HARNESS's own rasteriser
// and materialMetrics (feature = the scene's minority paint), to make every
// repro independent of the review's own helpers.
//   node work/vmf/harness-metrics.mjs [--apron N] [--only a,b] approaches/a.mjs approaches/b.mjs
import * as core from '../../harness/core.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { materialMetrics } from '../../harness/metrics.mjs';
import { ADV_SCENES } from './adv-scenes.mjs';
import { loadApproach } from './lib.mjs';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only')?.split(',');
const apronOpt = opt('--apron');
const files = args.filter((a) => a.endsWith('.mjs'));
const apps = [];
for (const f of files) apps.push(await loadApproach(f));
const FEATURE = { 'pixel-text-planks-on-stone': core.PLANKS };
console.log(`| scene (harness materialMetrics, feature area ×, parts) | ${apps.map((a) => a.name).join(' | ')} |`);
console.log(`|---|${apps.map(() => '---').join('|')}|`);
for (const sc of ADV_SCENES) {
  if (sc.kind !== 'plan' || (only && !only.includes(sc.name))) continue;
  const scene = { ...sc, feature: FEATURE[sc.name] ?? core.STONE, window: sc.win, ideals: [] };
  const cells = [];
  for (const A of apps) {
    const region = core.buildRegion(sc.cell, Number(apronOpt ?? A.apron ?? 10));
    const mesh = A.mesh(region, null, core);
    const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S: 32, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const m = materialMetrics(img, scene);
    cells.push(`×${m.area.ratio.toFixed(2)}, ${m.components} part${m.components === 1 ? '' : 's'}${m.specks ? ` +${m.specks} specks` : ''}`);
  }
  console.log(`| ${sc.name} | ${cells.join(' | ')} |`);
}
