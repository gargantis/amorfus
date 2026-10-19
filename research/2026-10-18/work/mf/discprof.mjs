// deviation of the rendered disc boundary vs angle (isotropic fast field)
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { boundaryPoints } from '../../harness/metrics.mjs';
import { makeFast, fragmentArgmax } from './fast.mjs';
import { regionFor } from './sweep.mjs';
const sceneName = process.argv[2] ?? 'disc-r7.6';
const P = JSON.parse(process.argv[3] ?? '{"sigma":1.2,"trunc":2.5,"tau":0.55,"bits":5}');
const scene = MATERIAL_SCENES.find((s) => s.name === sceneName);
const add = makeFast(P);
const mesh = add(core.decodeMesh(core.meshRegion({ ...regionFor(scene, 10), params: {} })), regionFor(scene, 10));
const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S: 32, fragment: (a, i) => fragmentArgmax(a, i), scene });
const id = scene.ideals[0];
const pts = boundaryPoints(img, id.pair[0], id.pair[1]);
const bins = new Array(72).fill(0).map(() => []);
for (const p of pts) {
  const a = Math.atan2(p[1] - id.c[1], p[0] - id.c[0]);
  const b = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 72) % 72;
  bins[b].push(Math.hypot(p[0] - id.c[0], p[1] - id.c[1]) - id.r);
}
// also the raw block staircase for comparison
const raw = core.decodeMesh(core.meshRegion({ ...regionFor(scene, 10), params: {} }));
const img0 = rasterTopDown(raw, { x0: 0, z0: 0, w: 32, h: 32, S: 32 });
const bins0 = new Array(72).fill(0).map(() => []);
for (const p of boundaryPoints(img0, id.pair[0], id.pair[1])) {
  const a = Math.atan2(p[1] - id.c[1], p[0] - id.c[0]);
  const b = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 72) % 72;
  bins0[b].push(Math.hypot(p[0] - id.c[0], p[1] - id.c[1]) - id.r);
}
const mean = (v) => v.reduce((x, y) => x + y, 0) / (v.length || 1);
let line = '';
for (let b = 0; b < 72; b += 2) line += `${(b * 5 - 180).toString().padStart(5)}° field ${mean(bins[b]).toFixed(2).padStart(6)} raw ${mean(bins0[b]).toFixed(2).padStart(6)}\n`;
console.log(line);
