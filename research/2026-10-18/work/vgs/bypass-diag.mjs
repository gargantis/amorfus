// VGS: diagonal (staircase-in-plan) 2-block risers, fully PLACED, walked into diagonally.
//  E  binary ground, placed 2 layers where x + z ≥ 28 (1:1 staircase edge in plan)
//  F  natural ground φ, placed 2 layers where x + z ≥ 28
//  G  binary ground, placed 2 layers where x + 2z ≥ 42 (1:2 edge in plan), walk perpendicular-ish
//  H  natural ground φ, ONE placed row (1 high) on a natural 1-terrace with a 1:2 plan edge (A-type, 1:2)
import { MeshWorld, run, spawn, natural, placed, binary, f2, yawTo } from './phys.mjs';
const variants = (process.argv[2] ?? 'cubes,hints,gs-ctx,gs-mls').split(',');
const PH = [-0.45, -0.25, -0.05, 0.15, 0.35];
const sc = {
  E: () => (x, y, z) => (y < 8 ? binary(y) : x + z >= 28 && y < 10 ? placed() : { v: 0 }),
  F: (ph) => (x, y, z) => (x + z >= 28 && (y === 8 || y === 9) ? placed() : natural(y, 8 + ph)),
  G: () => (x, y, z) => (y < 8 ? binary(y) : x + 2 * z >= 42 && y < 10 ? placed() : { v: 0 }),
  H: (ph) => (x, y, z) => (x + 2 * z >= 42 && y === 9 ? placed() : natural(y, 8 + ph + (x + 2 * z + 1.5 >= 42 ? 1 : 0))),
};
const dirs = { E: [1, 1], F: [1, 1], G: [1, 2], H: [1, 2] };
for (const [k, mk] of Object.entries(sc)) {
  const phs = k === 'E' || k === 'G' ? [null] : PH;
  console.log(`scene ${k}`);
  for (const v of variants) {
    const cells = [];
    for (const ph of phs) {
      const w = new MeshWorld(mk(ph ?? 0), v).build(0, 0, 0);
      const [dx, dz] = dirs[k];
      let up = 0;
      for (const [sprint, zoff] of [[false, 0], [true, 0], [true, 1.3]]) {
        const x0 = k === 'G' || k === 'H' ? 6.5 : 8.5, z0 = (k === 'G' || k === 'H' ? 8.5 : 8.5) + zoff;
        const r = run(w, spawn(x0, 9.5 + (ph ?? 0), z0), { move: [0, 1], yaw: yawTo(dx, dz), sprint }, 4, { probe: false });
        const lhs = k === 'G' || k === 'H' ? r.s.position[0] + 2 * r.s.position[2] : r.s.position[0] + r.s.position[2];
        const thr = k === 'G' || k === 'H' ? 44.5 : 29.5;
        if (lhs > thr && r.s.position[1] > 9.5 + (k === 'H' ? 0 : 0)) up++;
      }
      cells.push(`${ph === null ? 'binary' : (ph >= 0 ? '+' : '') + ph.toFixed(2)}:${up === 0 ? 'blk' : `UP${up}/3`}`);
    }
    console.log(`  ${v.padEnd(7)} ${cells.join(' ')}`);
  }
}
