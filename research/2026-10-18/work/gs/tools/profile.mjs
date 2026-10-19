// Print the surface profile (x, y of vertices with corner z = Z) of a scene.
//   node work/gs/tools/profile.mjs <scene> '<json params>' [Z] [x0] [x1]
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const [sceneName, pj, Zs, x0s, x1s] = process.argv.slice(2);
const s = ALL_SCENES.find((x) => x.name === sceneName);
const region = core.buildRegion(s.cell, 10);
const m = meshRegion({ ...region, params: JSON.parse(pj) });
const mesh = core.decodeMesh(m);
const Z = Number(Zs ?? 16), x0 = Number(x0s ?? 0), x1 = Number(x1s ?? 32);
const seen = new Map();
for (let v = 0; v < mesh.V; v++) {
  if (mesh.corner[v * 3 + 2] !== Z) continue;
  const cx = mesh.corner[v * 3], cy = mesh.corner[v * 3 + 1];
  if (cx < x0 || cx > x1) continue;
  const k = `${cx},${cy}`;
  if (seen.has(k)) continue;
  const n = [mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]];
  seen.set(k, { cx, cy, x: mesh.pos[v * 3], y: mesh.pos[v * 3 + 1], z: mesh.pos[v * 3 + 2], ang: Math.atan2(-n[0], n[1]) * 180 / Math.PI });
}
const list = [...seen.values()].sort((a, b) => a.cx - b.cx || a.cy - b.cy);
for (const r of list) console.log(`c(${r.cx},${r.cy}) pos(${r.x.toFixed(3)}, ${r.y.toFixed(3)}, ${r.z.toFixed(3)}) slopeDeg ${r.ang.toFixed(1)}`);
console.log(JSON.stringify(m.stats));
