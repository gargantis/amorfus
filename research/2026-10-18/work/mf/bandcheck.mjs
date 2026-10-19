// Per-side mean offsets of the thin-line bands, and the scene's own
// block-centre bias relative to its ideal centreline.
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { boundaryPoints } from '../../harness/metrics.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const mods = [];
for (const f of process.argv.slice(2)) mods.push(await import(pathToFileURL(resolve(f)).href));
for (const name of ['line1-1:1', 'line1-1:2', 'line2-1:1']) {
  const scene = MATERIAL_SCENES.find((s) => s.name === name);
  const id = scene.ideals[0];
  const nx = -Math.sin(id.theta), nz = Math.cos(id.theta);
  // block-centre bias: signed distance of the feature blocks' centres from the ideal centreline
  let sb = 0, nb = 0;
  for (let x = 6; x < 26; x++) for (let z = 0; z < 32; z++) if (scene.plan(x, z) === scene.feature) { sb += (x + 0.5 - id.p0[0]) * nx + (z + 0.5 - id.p0[1]) * nz; nb++; }
  const line = [`${name}: block centres sit ${(sb / nb).toFixed(3)} off the ideal centreline;`];
  for (const A of mods) {
    const region = core.buildRegion(scene.cell, A.apron ?? 10);
    const mesh = A.mesh(region, scene, core);
    const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S: 32, fragment: A.fragment ? (a, i) => A.fragment(a, i, scene) : null, scene });
    const pts = boundaryPoints(img, id.pair[0], id.pair[1]).filter((p) => p[0] >= 6 && p[0] <= 26 && p[1] >= 6 && p[1] <= 26);
    const side = [[], []];
    for (const p of pts) { const d = (p[0] - id.p0[0]) * nx + (p[1] - id.p0[1]) * nz; side[d > 0 ? 0 : 1].push(d); }
    const st = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return [m, Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)]; };
    const [m0, s0] = st(side[0]), [m1, s1] = st(side[1]);
    line.push(`${A.name}: sides at ${m0.toFixed(3)} / ${m1.toFixed(3)} (centre ${((m0 + m1) / 2).toFixed(3)}, width ${(m0 - m1).toFixed(3)}), per-side std ${s0.toFixed(3)} / ${s1.toFixed(3)}`);
  }
  console.log(line.join('\n   '));
}
