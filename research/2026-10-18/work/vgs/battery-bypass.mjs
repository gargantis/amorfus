// VGS: 2-block rises whose FOOT CELL lies outside the D-3 zone, so the
// context caps (incl. tall-foot) never apply, while gs's dilated R still
// relaxes it. The lower block is natural (a sharp natural 1-block cliff:
// the generator's hint gives a vertical face where H jumps), the upper
// block is placed flush on top.
//   node work/vgs/battery-bypass.mjs [variants]
import { MeshWorld, run, spawn, natural, placed, STONE, f2, yawTo } from './phys.mjs';

const variants = (process.argv[2] ?? 'cubes,hints,gs-ctx,gs-mls').split(',');
const EAST = { move: [0, 1], yaw: -Math.PI / 2 };
// natural ground: top(x) = base + (x ≥ cx ? 1 : 0) (a vertical natural cliff), at hint phase ph
const cliff = (ph, cx = 12) => (xc) => 8 + ph + (xc >= cx ? 1 : 0);
const scenes = [];
for (const ph of [-0.3, 0, 0.3]) {
  const top = cliff(ph);
  scenes.push([`natural 1-cliff φ${ph} (no placed block)`, (x, y) => natural(y, top(x + 0.5)), 1]);
  scenes.push([`natural 1-cliff φ${ph} + placed block flush on top`, (x, y) => (x >= 12 && y === 9 ? placed() : natural(y, top(x + 0.5))), 2]);
  scenes.push([`natural 1-cliff φ${ph} + placed block 1 back`, (x, y) => (x >= 13 && y === 9 ? placed() : natural(y, top(x + 0.5))), 1]);
  scenes.push([`natural 2-cliff φ${ph} (no placed)`, (x, y) => natural(y, 8 + ph + (x >= 12 ? 2 : 0)), 2]);
  scenes.push([`natural 2-cliff φ${ph} + one block placed on its top 2 back`, (x, y, z) => (x === 14 && z === 16 && y === 10 ? placed() : natural(y, 8 + ph + (x >= 12 ? 2 : 0))), 2]);
  scenes.push([`natural 2-cliff φ${ph} + placed block on ground 1 in front (diag)`, (x, y, z) => (x === 10 && z === 15 && y === 8 ? placed() : natural(y, 8 + ph + (x >= 12 ? 2 : 0))), 2]);
}
for (const [name, fn, rise] of scenes) {
  const row = [];
  for (const v of variants) {
    const w = new MeshWorld(fn, v).build(0, 0, 0);
    const outs = [];
    let climbed = 0;
    for (const [label, inp, z0] of [['walk', EAST, 16.5], ['sprint', { ...EAST, sprint: true }, 16.5], ['sprint 30°', { move: [0, 1], yaw: yawTo(Math.cos(0.52), Math.sin(0.52)), sprint: true }, 10.5]]) {
      const r = run(w, spawn(5.5, 9, z0), inp, 4, { probe: false });
      const up = r.s.position[0] > 12.5;
      if (up) climbed++;
      outs.push(`${label}:${up ? 'UP' : 'no'}(${f2(r.s.position[0])},${f2(r.s.position[1])})`);
    }
    row.push(`${v} ${climbed}/3 ${outs.join(' ')}`);
  }
  console.log(`[${rise}-block] ${name}`);
  for (const r of row) console.log('    ' + r);
}
