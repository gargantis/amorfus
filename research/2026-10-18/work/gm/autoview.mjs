// 3-D view of any chunk with an automatic camera (looks at the mean surface
// height from a corner), approaches side by side; optional edits.
//   node work/gm/autoview.mjs <out.png> <cx,cy,cz>[;<cx,cy,cz>…] [dist] a.mjs …
import { resolve } from 'node:path';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { heightAt } from './gen-gm.mjs';
import { loadMods } from './terrain-metrics.mjs';
import { tile } from './views.mjs';
export function autoCam(chunk, dist = 1, focus = [16, 16]) {
  const h = heightAt([1, 1], chunk[0] * 32 + focus[0], chunk[2] * 32 + focus[1]) - chunk[1] * 32;
  return { eye: [focus[0] + 22 * dist, h + 18 * dist, focus[1] + 24 * dist], target: [focus[0], h - 2, focus[1] - 1] };
}
export function renderMods(mods, chunk, cam, { width = 420, height = 300, edits, apron = 10 } = {}) {
  const inp = buildGenMeshInputGM([1, 1], ...chunk, edits ?? new Map(), { forceApron: apron }).input;
  return mods.map((A) => renderShaded(A.mesh(inp, null, core), { width, height, ...cam, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null, flatShading: A.flatShading === true }));
}
if (process.argv[1]?.endsWith('autoview.mjs')) {
  const [out, chs, dist, ...files] = process.argv.slice(2);
  const mods = await loadMods(files);
  const rows = chs.split(';').map((s) => { const c = s.split(',').map(Number); return renderMods(mods, c, autoCam(c, Number(dist))); });
  const t = tile(rows);
  writePng(resolve(out), t.width, t.height, t.rgb);
  console.log(resolve(out), mods.map((m) => m.name).join(' | '));
}
