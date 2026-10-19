// Real-terrain views, several approaches side by side, from the gm input
// (production GEN_MESH input + material planes; approaches that do not use
// the planes ignore them).
//   node work/gm/views.mjs <out.png> <view> a.mjs b.mjs …   (or 'hints')
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
import { buildGenMeshInputGM } from './input.mjs';
export const VIEWS = {
  'mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
  'beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
  'mtn-close': { chunk: [-1, 1, 1], eye: [30, 30, 30], target: [14, 16, 14] },
  'mtn-close2': { chunk: [-2, 1, 1], eye: [40, 36, 40], target: [16, 14, 16] },
  'beach-close': { chunk: [0, 0, -3], eye: [26, 25, 27], target: [17, 18, 13] },
  'stone-cliff': { chunk: [-3, 1, 0], eye: [44, 40, 44], target: [14, 14, 14] },
};
export async function loadMods(list) {
  const out = [];
  for (const f of list) {
    if (f === 'hints') out.push({ name: 'hints', mesh: (r, s, c) => c.decodeMesh(c.meshRegion({ ...r, params: {} })) });
    else out.push(await import(pathToFileURL(resolve(f)).href));
  }
  return out;
}
export function renderRow(mods, v, { width = 420, height = 300, edits, apron = 10 } = {}) {
  const inp = buildGenMeshInputGM([1, 1], ...v.chunk, edits ?? new Map(), { forceApron: apron }).input;
  const imgs = mods.map((A) => {
    const mesh = A.mesh(inp, null, core);
    return renderShaded(mesh, { width, height, eye: v.eye, target: v.target, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null, flatShading: A.flatShading === true });
  });
  return imgs;
}
export function tile(rows, gap = 6) {
  const th = rows[0][0].height, tw = rows[0][0].width;
  const cols = Math.max(...rows.map((r) => r.length));
  const W = cols * tw + (cols - 1) * gap, H = rows.length * th + (rows.length - 1) * gap;
  const rgb = new Uint8Array(W * H * 3).fill(255);
  rows.forEach((row, r) => row.forEach((im, c) => {
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) for (let k = 0; k < 3; k++) rgb[((r * (th + gap) + j) * W + c * (tw + gap) + i) * 3 + k] = im.rgb[(j * tw + i) * 3 + k];
  }));
  return { width: W, height: H, rgb };
}
if (process.argv[1]?.endsWith('views.mjs')) {
  const [out, viewList, ...files] = process.argv.slice(2);
  const mods = await loadMods(files);
  const rows = viewList.split(',').map((vn) => renderRow(mods, VIEWS[vn]));
  const t = tile(rows);
  writePng(resolve(out), t.width, t.height, t.rgb);
  console.log(resolve(out), mods.map((m) => m.name).join(' | '));
}
