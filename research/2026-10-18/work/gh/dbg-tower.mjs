// Tower outline at mid-height: per-cell report of the outline vs the circle.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { geometryMetrics } from '../../harness/metrics.mjs';
import { VARIANTS } from './variants.mjs';
const scene = ALL_SCENES.find((s) => s.name === (process.argv[3] ?? 'tower-r4.6'));
const o = scene.ideal.outline;
for (const name of process.argv[2].split(',')) {
  const region = core.buildRegion(scene.cell, VARIANTS[name].apron ?? 10);
  const mesh = core.decodeMesh(VARIANTS[name].raw(region));
  const g = geometryMetrics(mesh, scene, {});
  // vertices of the wall at the layer corner y = 9 (lattice), print offsets vs circle
  const rows = [];
  for (let v = 0; v < mesh.V; v++) {
    if (!mesh.corner || mesh.corner[v * 3 + 1] !== 9) continue;
    const x = mesh.pos[v * 3], z = mesh.pos[v * 3 + 2];
    const d = Math.hypot(x - o.c[0], z - o.c[1]) - o.r;
    const cx = mesh.corner[v * 3], cz = mesh.corner[v * 3 + 2];
    const dc = Math.hypot(cx - o.c[0], cz - o.c[1]) - o.r;
    const ang = Math.atan2(z - o.c[1], x - o.c[0]) * 180 / Math.PI;
    rows.push([ang, d, dc, cx, cz, x, z]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  console.log(`${name}: outline std ${g.outline.std.toFixed(3)} max ${g.outline.maxDev.toFixed(3)} mean ${g.outline.mean.toFixed(3)}; y=9 vertices: ${rows.length}`);
  console.log(rows.map((r) => `${r[0].toFixed(0).padStart(4)}° c(${r[3]},${r[4]}) cd ${r[2].toFixed(2)} → d ${r[1].toFixed(2)}`).join('\n'));
}
