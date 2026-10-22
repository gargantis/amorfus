// E2c: does an attached 1x1x4 bar drain under FID-0.15 without a tunnel to
// absorb it? Solid 6x4x3 host + bar at x=6..9 (y=0, z=0), and a 1x1x4 bar
// standing on a 6x1x6 plate; n 12; bar-region volume (labels).
import { writeFileSync } from 'node:fs';
import { simulate } from '../../../lib/mbo.mjs';
import { box, bar, STONE, r4 } from './common.mjs';
const [out] = process.argv.slice(2);
const res = {};
const scenes = {
  'solidHost+lyingBar': { blocks: [...box(0, 0, 0, 6, 4, 3, STONE), ...bar(6)], inBar: (x, y, z) => x >= 6 },
  'plate+standingBar': { blocks: [...box(0, 0, 0, 6, 1, 6, STONE), ...[1, 2, 3, 4].map((y) => [2, y, 2, STONE])], inBar: (x, y, z) => y >= 1.5 },
  'tunnelHost+standingBarOnTop': { blocks: [...box(0, 0, 0, 6, 4, 3, STONE, (x, y) => x === 1 && (y === 1 || y === 2)), ...[4, 5, 6, 7].map((y) => [5, y, 1, STONE])], inBar: (x, y, z) => y >= 4.5 },
};
for (const [name, sc] of Object.entries(scenes)) {
  for (const k of [0.15, 0.25]) {
    const sim = simulate(sc.blocks, { anchor: { kind: 'fidelity', k }, n: 12, maxSteps: 300 });
    let v = 0; const dv = 1 / 12 ** 3;
    for (let kk = 0; kk < sim.NZ; kk++) for (let j = 0; j < sim.NY; j++) for (let i = 0; i < sim.NX; i++) { if (!sim.label[(kk * sim.NY + j) * sim.NX + i]) continue; const x = sim.ox + (i + 0.5) / 12, y = sim.oy + (j + 0.5) / 12, z = sim.oz + (kk + 0.5) / 12; if (sc.inBar(x, y, z)) v += dv; }
    res[`${name} FID-${k}`] = { barRegionVolume: r4(v), steps: sim.steps, converged: !!sim.converged, lambda: r4(sim.phases.find((P, p) => p && P.alive).lambda) };
    console.log(name, `FID-${k}`, JSON.stringify(res[`${name} FID-${k}`]));
  }
}
writeFileSync(out, JSON.stringify(res, null, 1));
