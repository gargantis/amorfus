// Worst shading-normal errors in a geometry scene (same window/rules as metrics.mjs).
//   node work/gs/tools/worst.mjs <scene> '<json params>' [n]
import * as core from '../../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const [sceneName, pj, ns] = process.argv.slice(2);
const s = GEOMETRY_SCENES.find((x) => x.name === sceneName);
const mesh = core.decodeMesh(meshRegion({ ...core.buildRegion(s.cell, 10), params: JSON.parse(pj) }));
const g = s.ideal;
const fn = [0, 0, 0, 0];
const errs = new Map();
for (let t = 0; t < mesh.T; t++) {
  const a = mesh.tri[t * 3], b = mesh.tri[t * 3 + 1], c = mesh.tri[t * 3 + 2];
  const cx = (mesh.pos[a * 3] + mesh.pos[b * 3] + mesh.pos[c * 3]) / 3;
  const cy = (mesh.pos[a * 3 + 1] + mesh.pos[b * 3 + 1] + mesh.pos[c * 3 + 1]) / 3;
  const cz = (mesh.pos[a * 3 + 2] + mesh.pos[b * 3 + 2] + mesh.pos[c * 3 + 2]) / 3;
  if (!g.inWindow([cx, cy, cz])) continue;
  core.faceNormal(mesh, t, fn);
  if (fn[3] < 1e-9) continue;
  for (const v of [a, b, c]) {
    const p = [mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]];
    const nv = g.normal(p);
    const e = core.angleDeg(mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2], nv[0], nv[1], nv[2]);
    const k = `${mesh.corner[v * 3]},${mesh.corner[v * 3 + 1]},${mesh.corner[v * 3 + 2]}`;
    if (!errs.has(k) || errs.get(k).e < e) errs.set(k, { e, p: p.map((x) => x.toFixed(2)).join(','), n: [mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]].map((x) => x.toFixed(2)).join(',') });
  }
}
const list = [...errs.entries()].sort((a, b) => b[1].e - a[1].e).slice(0, Number(ns ?? 15));
for (const [k, v] of list) console.log(`corner ${k}  err ${v.e.toFixed(1)}°  pos ${v.p}  n ${v.n}`);
