// vmv: copy of work/vmf/hill-edges.mjs, output to out/vmv-adv and work/vmv.
// vmf: straight painted edges/lines on the curved generated hill vs flat
// ground, scored with the HARNESS materialMetrics (std / maxDev) and the mf
// team's own high-pass split (work/mf/highpass.mjs), plus zoomed plan images
// with triangle edges (out/vmf-adv/zoom-*.png).
import { join } from 'node:path';
import * as core from '../../harness/core.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { materialMetrics } from '../../harness/metrics.mjs';
import { highpass } from '../mf/highpass.mjs';
import { ADV_SCENES } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, hcat, vcat, save, ROOT } from '../vmf/lib.mjs';
const DEG = Math.PI / 180;
const P0 = [16.13, 16.37];
const IDEALS = {
  'hill-edge-1:1': [{ label: 'hill 1:1 edge', pair: [1, 3], kind: 'line', p0: P0, theta: 45 * DEG, window: [6, 6, 26, 26] }],
  'flat-edge-1:1': [{ label: 'flat 1:1 edge', pair: [1, 3], kind: 'line', p0: P0, theta: 45 * DEG, window: [6, 6, 26, 26] }],
  'hill-edge-1:2': [{ label: 'hill 1:2 edge', pair: [1, 3], kind: 'line', p0: P0, theta: Math.atan(0.5), window: [6, 6, 26, 26] }],
};
const apps = [];
for (const f of process.argv.slice(2)) apps.push(await loadApproach(f));
console.log(`| scene | ${apps.map((a) => `${a.name} std / maxDev | ${a.name} high-pass / low-pass`).join(' | ')} |`);
for (const [n, ideals] of Object.entries(IDEALS)) {
  const sc = ADV_SCENES.find((s) => s.name === n);
  const scene = { ...sc, feature: core.STONE, window: sc.win, ideals };
  const cells = [];
  for (const A of apps) {
    const mesh = A.mesh(core.buildRegion(sc.cell, A.apron ?? 10), null, core);
    const frag = A.fragment ? (a, i) => A.fragment(a, i, null) : null;
    const img = rasterTopDown(mesh, { S: 32, fragment: frag });
    const m = materialMetrics(img, scene).boundaries[0];
    const h = highpass(img, scene)[0];
    cells.push(`${m.std.toFixed(3)} / ${m.maxDev.toFixed(3)}`, `${h.hp.toFixed(3)} / ${h.lp.toFixed(3)}`);
  }
  console.log(`| ${n} | ${cells.join(' | ')} |`);
}
// zoomed plan images with triangle edges, 96 px per block
const Z = 96;
const zooms = [['hill-edge-1:2', [12, 14, 20, 20]], ['hill-line1-1:1', [12, 12, 19, 19]], ['lines-X', [13, 13, 20, 20]], ['checker16', [8, 8, 14, 14]], ['line1-1:2-flat', null]];
for (const [n, w] of zooms) {
  const sc = ADV_SCENES.find((s) => s.name === n);
  if (!sc) continue;
  const row = [];
  for (const A of apps) {
    const mesh = A.mesh(core.buildRegion(sc.cell, A.apron ?? 10), null, core);
    const img = planRaster(mesh, { x0: w[0], z0: w[1], w: w[2] - w[0], h: w[3] - w[1], S: Z, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    row.push(planRgb(img, { edges: true }));
  }
  save(join(ROOT, 'out', 'vmv-adv', `zoom-${n}.png`), hcat(row));
}
