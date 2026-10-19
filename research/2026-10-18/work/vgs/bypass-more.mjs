// I  player-DUG terrace: natural flat ground at 9+φ everywhere, the player digs
//    out layer y = 8 for x < 12 (edited air), then places 1 row at y = 9 on x ≥ 12.
// J  natural 1-block terrace edge (as A) with a 1-THICK 1-high placed wall at x = 12 only.
// K  as J but the wall is set 1 block back from the edge (x = 13): a 1:1 stair, walkable by design.
import { MeshWorld, run, spawn, natural, placed, dug, f2 } from './phys.mjs';
const variants = (process.argv[2] ?? 'hints,gs-ctx,gs-mls').split(',');
const PH = [-0.25, -0.15, -0.05, 0, 0.05, 0.15, 0.25];
const terr = (ph) => (x, y) => natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0));
const sc = {
  I: (ph) => (x, y) => { if (y === 8 && x < 12) return dug(); if (x >= 12 && y === 9) return placed(); return natural(y, 9 + ph); },
  J: (ph) => (x, y, z) => (x === 12 && y === 9 ? placed() : terr(ph)(x, y)),
  K: (ph) => (x, y, z) => (x === 13 && y === 9 ? placed() : terr(ph)(x, y)),
};
const EAST = { move: [0, 1], yaw: -Math.PI / 2 };
for (const [k, mk] of Object.entries(sc)) {
  console.log(`scene ${k}`);
  for (const v of variants) {
    const cells = [];
    for (const ph of PH) {
      const w = new MeshWorld(mk(ph), v).build(0, 0, 0);
      let up = 0;
      for (const inp of [EAST, { ...EAST, sprint: true }]) {
        const r = run(w, spawn(5.5, 9.5 + ph, 16.5), inp, 4, { probe: false });
        if (r.s.position[0] > (k === 'K' ? 13.6 : 12.6) && r.s.position[1] > 9.6) up++;
      }
      cells.push(`${ph >= 0 ? '+' : ''}${ph.toFixed(2)}:${up === 0 ? 'blk' : `UP${up}/2`}`);
    }
    console.log(`  ${v.padEnd(7)} ${cells.join(' ')}`);
  }
}
