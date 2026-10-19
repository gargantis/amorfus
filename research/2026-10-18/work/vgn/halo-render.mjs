// vgn: the light halo, rendered. Panels: production | gn-best | ground light
// relative to open flat ground under gn-best (red = brighter than open
// ground, blue = darker; ±8 % full scale). Harness tower and 4×4 block.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const OUT = new URL('../../out/vgn-thin/', import.meta.url).pathname;
const SUN = [0.5, 0.8, 0.3].map((x) => x / Math.hypot(0.5, 0.8, 0.3));
const L = (n, ao) => (0.9 * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) + 0.35 + 0.25 * (n[1] * 0.5 + 0.5)) * ao;
const OPEN = L([0, 1, 0], 1);
for (const sname of ['tower-r4.6', 'mound-r6.4']) {
  const s = ALL_SCENES.find((x) => x.name === sname);
  const r = core.buildRegion(s.cell, 10);
  const P = core.decodeMesh(repoMesh({ ...r, params: {} })), G = core.decodeMesh(gnMesh({ ...r, params: PARAMS }));
  const cam = { eye: [30, 14, 27], target: [16, 6, 16], width: 400, height: 300, fovDeg: 50 };
  const a = renderShaded(P, cam), b = renderShaded(G, cam);
  // ratio map: re-colour the gn mesh by its own light / OPEN using palette-free shading → encode in a fake material image
  // use per-vertex 'ao' channel trick: render with a mesh whose colours encode the ratio
  const H = { ...G, ao: new Float64Array(G.V), nrm: new Float64Array(G.V * 3), mat: new Uint8Array(G.V) };
  const ratio = new Float64Array(G.V);
  for (let v = 0; v < G.V; v++) ratio[v] = L([G.nrm[v * 3], G.nrm[v * 3 + 1], G.nrm[v * 3 + 2]], G.ao[v]) / OPEN;
  // custom raster: reuse renderShaded with fragment returning material by ratio band
  const bands = (q) => (q > 1.04 ? 6 : q > 1.015 ? 4 : q < 0.92 ? 7 : q < 0.985 ? 3 : 1); // brick=much brighter, sand=brighter, stone=darker, reserved(blue)=much darker, grass=neutral
  H.attrs = ratio; H.attrDim = 1; H.ao.fill(1); for (let v = 0; v < G.V; v++) { H.nrm[v * 3 + 1] = 1; }
  const c = renderShaded(H, { ...cam, fragment: (att) => bands(att[0]) });
  const gap = 4, W = 3 * 400 + 2 * gap;
  const rgb = new Uint8Array(W * 300 * 3).fill(255);
  [a, b, c].forEach((im, k) => { for (let j = 0; j < 300; j++) for (let i = 0; i < 400; i++) for (let q = 0; q < 3; q++) rgb[(j * W + k * (400 + gap) + i) * 3 + q] = im.rgb[(j * 400 + i) * 3 + q]; });
  writePng(`${OUT}halo-${sname}.png`, W, 300, rgb);
  console.log(`${OUT}halo-${sname}.png  (3rd panel: brick = >4 % brighter than open ground, sand = 1.5–4 % brighter, grass = neutral, stone = 1.5–8 % darker, blue = >8 % darker)`);
}
