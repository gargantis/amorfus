// Edit scenarios: plan + 3-D views, approaches side by side.
//   node work/gm/editview.mjs <out.png> <cx,cy,cz> <scenario[,scenario]> [S] a.mjs …
import { resolve } from 'node:path';
import * as core from '../../harness/core.mjs';
import { rasterTopDown, materialImageRgb, renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { loadMods } from './terrain-metrics.mjs';
import { tile } from './views.mjs';
import { allEdits, surfaceY } from './edits.mjs';
export function editRows(mods, chunk, names, { S = 12, crop = [4, 4, 28, 28], camDist = 0.55, focus = [16, 16] } = {}) {
  const edits = allEdits(chunk[0], chunk[2], names);
  const inp = buildGenMeshInputGM([1, 1], ...chunk, edits, { forceApron: 10 }).input;
  const plans = [], views = [], stats = [];
  const y = surfaceY(chunk[0] * 32 + focus[0], chunk[2] * 32 + focus[1]) - chunk[1] * 32;
  const cam = { eye: [focus[0] + 13 * camDist * 1.6, y + 16 * camDist * 1.6, focus[1] + 15 * camDist * 1.6], target: [focus[0], y, focus[1]] };
  for (const A of mods) {
    const m = A.mesh(inp, null, core);
    stats.push(m.gmStats ?? null);
    const frag = A.fragment ? (a, i) => A.fragment(a, i, null) : null;
    const img = rasterTopDown(m, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: frag });
    plans.push(materialImageRgb(img, { crop }));
    views.push(renderShaded(m, { width: crop ? (crop[2] - crop[0]) * S : 32 * S, height: 260, ...cam, fragment: frag }));
  }
  return { plans, views, stats };
}
if (process.argv[1]?.endsWith('editview.mjs')) {
  const [out, ch, names, Sarg, ...files] = process.argv.slice(2);
  const mods = await loadMods(files);
  const r = editRows(mods, ch.split(',').map(Number), names.split(','), { S: Number(Sarg) });
  const t = tile([r.plans, r.views]);
  writePng(resolve(out), t.width, t.height, t.rgb);
  console.log(resolve(out), mods.map((m) => m.name).join(' | '));
  r.stats.forEach((s, i) => s && console.log(mods[i].name, JSON.stringify(s)));
}
