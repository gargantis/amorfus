import { MeshWorld, run, spawn, natural, dug, f2, yawTo } from './phys.mjs';
const band = (x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28);
const fn = (x, y, z) => (y >= 8 && y < 10 && band(x, z) ? dug() : natural(y, 16));
for (const v of ['hints', 'gs-mls']) {
  const w = new MeshWorld(fn, v).build(0, 0, 0);
  for (const za of [8.35, 8.5, 8.65]) for (const tx of [15.4, 15.6, 15.8, 16.0, 16.2, 16.4]) for (const xb of [16.35, 16.5, 16.65]) {
    const r = run(w, spawn(6.5, 8.05, 8.5), (s) => { const [x, , z] = s.position; if (x < tx && z < 9) return { move: [0, 1], yaw: yawTo(tx + 1 - x, za - z) }; return { move: [0, 1], yaw: yawTo(xb - x, 26 - z) }; }, 9, { probe: false });
    if (r.s.position[2] <= 20) console.log(`${v} FAIL za ${za} tx ${tx} xb ${xb}: stuck at (${f2(r.s.position[0])}, ${f2(r.s.position[2])}) — turn point x=${tx} ${r.s.position[0] < tx ? 'never reached' : 'reached'}`);
  }
  // max x reachable along arm A at the corner (how far into the corner cell can you walk)
  const r2 = run(w, spawn(6.5, 8.05, 8.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4, { probe: false });
  console.log(`${v}: walking straight down arm A stops at x = ${f2(r2.s.position[0])} (cubes: 16.70)`);
}
