import * as core from './harness/core.mjs';
import { GEOMETRY_SCENES } from './harness/scenes.mjs';
const scene = GEOMETRY_SCENES.find((s) => s.name === 'ramp-1:1');
const region = core.buildRegion(scene.cell, 10);
const mesh = core.decodeMesh(core.meshRegion({ ...region, params: { rule: 'bevel' } }));
const fn = [0, 0, 0, 0];
const hist = new Map();
for (let t = 0; t < mesh.T; t++) {
  const a = mesh.tri[t * 3], b = mesh.tri[t * 3 + 1], c = mesh.tri[t * 3 + 2];
  const cx = (mesh.pos[a * 3] + mesh.pos[b * 3] + mesh.pos[c * 3]) / 3;
  const cy = (mesh.pos[a * 3 + 1] + mesh.pos[b * 3 + 1] + mesh.pos[c * 3 + 1]) / 3;
  const cz = (mesh.pos[a * 3 + 2] + mesh.pos[b * 3 + 2] + mesh.pos[c * 3 + 2]) / 3;
  if (!scene.ideal.inWindow([cx, cy, cz])) continue;
  core.faceNormal(mesh, t, fn);
  const k = fn.slice(0, 3).map((v) => v.toFixed(2)).join(',') + ` y-h=${(cy - (6 + (cx - 4))).toFixed(2)}`;
  hist.set(k, (hist.get(k) ?? 0) + 1);
}
console.log([...hist].sort((a, b) => b[1] - a[1]).slice(0, 12));
