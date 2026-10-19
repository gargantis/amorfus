import * as core from '../../harness/core.mjs';
import { ALL_SCENES, BASE } from '../../harness/scenes.mjs';
import { contourCross } from './syn.mjs';
const scene = ALL_SCENES.find((s) => s.name === 'terrace-1:2');
const region = core.buildRegion(scene.cell, 10);
const { crossT } = contourCross(region, { R: 8 });
const o = scene.ideal.outline;
const nrm = [-Math.sin(o.theta), Math.cos(o.theta)];
const dist = (x, z) => (x - o.p0[0]) * nrm[0] + (z - o.p0[1]) * nrm[1];
const y = BASE;
for (let z = 12; z <= 18; z++) {
  const row = [];
  for (let x = 12; x <= 22; x++) {
    const i = core.regionIndex(region, x, y, z);
    for (let a of [0, 2]) {
      const t = crossT[i * 3 + a];
      if (t < 0) continue;
      const px = a === 0 ? x + 0.5 + t : x + 0.5, pz = a === 2 ? z + 0.5 + t : z + 0.5;
      row.push(`${a === 0 ? 'x' : 'z'}(${x},${z}) t${t.toFixed(2)} d${dist(px, pz).toFixed(2)}`);
    }
  }
  console.log(row.join('  '));
}
