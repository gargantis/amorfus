// Radial error of terrace-disc foot (y=6) and rim (y=7) vertices vs the ideal circle.
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const params = JSON.parse(process.argv[2]);
const s = ALL_SCENES.find((x) => x.name === 'terrace-disc');
const mesh = core.decodeMesh(meshRegion({ ...core.buildRegion(s.cell, 10), params }));
const C = [16.2, 15.9], R = 6.3;
for (const Y of [6, 7]) {
  const seen = new Map();
  for (let v = 0; v < mesh.V; v++) {
    if (mesh.corner[v * 3 + 1] !== Y) continue;
    const k = `${mesh.corner[v * 3]},${mesh.corner[v * 3 + 2]}`;
    if (seen.has(k)) continue;
    const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
    const r = Math.hypot(x - C[0], z - C[1]);
    if (Math.abs(r - R) > 2) continue;
    seen.set(k, { ang: Math.atan2(z - C[1], x - C[0]) * 180 / Math.PI, r: r - R, y });
  }
  const list = [...seen.values()].sort((a, b) => a.ang - b.ang).filter((e) => e.ang >= 0 && e.ang <= 95);
  console.log(`y=${Y}: ` + list.map((e) => `${e.ang.toFixed(0)}°:${e.r >= 0 ? '+' : ''}${e.r.toFixed(2)}(${e.y.toFixed(2)})`).join(' '));
}
