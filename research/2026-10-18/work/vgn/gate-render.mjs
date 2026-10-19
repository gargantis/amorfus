// vgn: production | gn-best | gn-best + 45° ring gate, flat palette and
// triplanar emulation, on the thin builds that broke and the mound.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as vgnMesh } from './mesher-vgn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS as BEST } from '../../approaches/gn-best.mjs';
import { THIN, BASE } from './thin-scenes.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { renderTri } from './triplanar-lib.mjs';
import { writePng } from '../../harness/png.mjs';
const OUT = new URL('../../out/vgn-gate70/img/', import.meta.url).pathname;
const shots = [
  ['posts-gap2', THIN, { eye: [10, BASE + 3.5, 9], target: [16, BASE + 1.5, 16] }],
  ['tree', THIN, { eye: [12, BASE + 4, 11], target: [16.5, BASE + 3, 16.5] }],
  ['wall-diag-1w', THIN, { eye: [22, BASE + 4, 12], target: [16, BASE + 1.5, 16] }],
  ['fence-1w-3h', THIN, { eye: [21, BASE + 3.5, 21], target: [16.5, BASE + 1.5, 14] }],
  ['mound-r6.4', ALL_SCENES, ALL_SCENES.find((s) => s.name === 'mound-r6.4').camera],
  ['tower-r4.6', ALL_SCENES, { eye: [30, 14, 27], target: [16, 6, 16] }],
];
for (const [n, list, cam] of shots) {
  const s = list.find((x) => x.name === n);
  const r = core.buildRegion(s.cell, 10);
  const ms = [core.decodeMesh(repoMesh({ ...r, params: {} })), core.decodeMesh(gnMesh({ ...r, params: BEST })), core.decodeMesh(vgnMesh({ ...r, params: { ...BEST, ringGate: 0.7071 } }))];
  for (const [suffix, fn] of [['flat', (m) => renderShaded(m, { ...cam, width: 360, height: 280, fovDeg: 55 })], ['triplanar', (m) => renderTri(m, { ...cam, width: 360, height: 280, fovDeg: 55 })]]) {
    if (suffix === 'triplanar' && (n === 'mound-r6.4' || n === 'tower-r4.6')) continue;
    const imgs = ms.map(fn);
    const gap = 4, W = 3 * 360 + 2 * gap, rgb = new Uint8Array(W * 280 * 3).fill(255);
    imgs.forEach((im, k) => { for (let j = 0; j < 280; j++) for (let i = 0; i < 360; i++) for (let q = 0; q < 3; q++) rgb[(j * W + k * 364 + i) * 3 + q] = im.rgb[(j * 360 + i) * 3 + q]; });
    writePng(`${OUT}cmp3-${n}-${suffix}.png`, W, 280, rgb);
    console.log(`${OUT}cmp3-${n}-${suffix}.png`);
  }
}
