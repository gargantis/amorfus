// VGS: phase sweep of the tall-foot bypass — a 2-block rise whose lower
// block is natural (hinted) and upper block placed. Variants:
//  A  natural 1-block terrace edge (top jumps by 1 at x = 12) + 1 placed row on top
//  B  natural 45° hillside (top = 8 + φ + (x − 12) for x ≥ 12, flat before), 1-high placed wall on it at x = 14
//  C  as A but the placed row is 2 high (3-block rise; must be blocked)
//  D  as A, natural terrace edge running DIAGONALLY (x + z ≥ 28)
//   node work/vgs/bypass-sweep.mjs [variants]
import { MeshWorld, run, spawn, natural, placed, f2, yawTo } from './phys.mjs';
const variants = (process.argv[2] ?? 'hints,gs-ctx,gs-mls').split(',');
const PH = [-0.45, -0.35, -0.25, -0.15, -0.05, 0, 0.05, 0.15, 0.25, 0.35, 0.45];
const sc = {
  A: (ph) => (x, y) => (x >= 12 && y === 9 ? placed() : natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0))),
  B: (ph) => (x, y) => {
    const top = (xc) => 8 + ph + Math.max(0, xc - 12);
    const base = Math.ceil(top(14.5) - 0.5); // first air layer above the natural column at x = 14
    if (x === 14 && y === base) return placed();
    return natural(y, top(x + 0.5));
  },
  C: (ph) => (x, y) => (x >= 12 && (y === 9 || y === 10) ? placed() : natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0))),
  D: (ph) => (x, y, z) => (x + z >= 28 && y === 9 ? placed() : natural(y, 8 + ph + (x + z + 1 >= 28 ? 1 : 0))),
};
const EAST = { move: [0, 1], yaw: -Math.PI / 2 };
for (const [k, mk] of Object.entries(sc)) {
  console.log(`scene ${k}`);
  for (const v of variants) {
    const cells = [];
    for (const ph of PH) {
      const w = new MeshWorld(mk(ph), v).build(0, 0, 0);
      let up = 0;
      const tries = k === 'D'
        ? [[{ move: [0, 1], yaw: yawTo(1, 1) }, 8.5, 8.5], [{ move: [0, 1], yaw: yawTo(1, 1), sprint: true }, 8.5, 8.5]]
        : [[EAST, 5.5, 16.5], [{ ...EAST, sprint: true }, 5.5, 16.5]];
      for (const [inp, x0, z0] of tries) {
        const r = run(w, spawn(x0, 9.2 + ph, z0), inp, 4, { probe: false });
        const past = k === 'D' ? r.s.position[0] + r.s.position[2] > 29.5 : k === 'B' ? r.s.position[0] > 15.2 : r.s.position[0] > 12.6;
        if (past) up++;
      }
      cells.push(`${ph >= 0 ? '+' : ''}${ph.toFixed(2)}:${up === 0 ? 'blk' : up === 2 ? 'UP ' : 'up?'}`);
    }
    console.log(`  ${v.padEnd(7)} ${cells.join(' ')}`);
  }
}
