import * as core from '../../harness/core.mjs';
import { ALL_SCENES, BASE } from '../../harness/scenes.mjs';
import { contourCross2 as contourCross } from './syn.mjs';
const name = process.argv[2], yl = Number(process.argv[3] ?? BASE + 3);
const scene = ALL_SCENES.find((s) => s.name === name);
const region = core.buildRegion(scene.cell, 10);
const { crossT } = contourCross(region, { R: 8 });
const o = scene.ideal.outline;
const rows = [];
const all = [];
for (let z = 8; z <= 24; z++) for (let x = 8; x <= 24; x++) {
  const i = core.regionIndex(region, x, yl, z);
  for (const a of [0, 2]) {
    const t = crossT[i * 3 + a];
    if (t < 0) continue;
    const px = a === 0 ? x + 0.5 + t : x + 0.5, pz = a === 2 ? z + 0.5 + t : z + 0.5;
    const d = Math.hypot(px - o.c[0], pz - o.c[1]) - o.r;
    const tb = 0.5; const bx = a === 0 ? x + 1 : x + 0.5, bz = a === 2 ? z + 1 : z + 0.5;
    const db = Math.hypot(bx - o.c[0], bz - o.c[1]) - o.r;
    all.push([Math.atan2(pz - o.c[1], px - o.c[0]), d, db, a, x, z, t]);
  }
}
all.sort((p, q) => p[0] - q[0]);
for (const r of all) console.log(`${(r[0] * 180 / Math.PI).toFixed(0).padStart(5)}° ${'xz'[r[3] === 0 ? 0 : 1]}(${r[4]},${r[5]}) t=${r[6].toFixed(2)} d=${r[1].toFixed(2)} binary=${r[2].toFixed(2)}`);
const s = core.stats(all.map((r) => r[1])), sb = core.stats(all.map((r) => r[2]));
console.log('crossings std', s.std.toFixed(3), 'max', s.maxDev.toFixed(3), ' binary std', sb.std.toFixed(3), 'max', sb.maxDev.toFixed(3));
