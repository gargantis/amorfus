// Plan-view material images of bench chunks, approaches side by side.
//   node work/gm/plan.mjs <out.png> <cx,cy,cz> [S] a.mjs b.mjs …
import { resolve } from 'node:path';
import * as core from '../../harness/core.mjs';
import { rasterTopDown, materialImageRgb } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { loadMods } from './terrain-metrics.mjs';
import { tile } from './views.mjs';
export function planImgs(mods, chunk, { S = 12, crop = null, edits, apron = 10 } = {}) {
  const inp = buildGenMeshInputGM([1, 1], ...chunk, edits ?? new Map(), { forceApron: apron }).input;
  return mods.map((A) => {
    const m = A.mesh(inp, null, core);
    const img = rasterTopDown(m, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    // shade by height so relief reads
    const rgbI = materialImageRgb(img, { crop });
    return rgbI;
  });
}
if (process.argv[1]?.endsWith('plan.mjs')) {
  const [out, ch, Sarg, ...files] = process.argv.slice(2);
  const mods = await loadMods(files);
  const rows = [planImgs(mods, ch.split(',').map(Number), { S: Number(Sarg) })];
  const t = tile(rows);
  writePng(resolve(out), t.width, t.height, t.rgb);
  console.log(resolve(out), mods.map((m) => m.name).join(' | '));
}
