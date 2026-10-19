import { MeshWorld, run, spawn, natural, placed, f2 } from './phys.mjs';
const terr = (ph) => (x, y) => natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0));
const sc = { J: (ph) => (x, y) => (x === 12 && y === 9 ? placed() : terr(ph)(x, y)), K: (ph) => (x, y) => (x === 13 && y === 9 ? placed() : terr(ph)(x, y)) };
for (const [k, mk] of Object.entries(sc)) for (const v of ['hints', 'gs-ctx', 'gs-mls']) {
  const cells = [];
  for (const ph of [-0.25, -0.15, -0.05, 0, 0.05, 0.15, 0.25]) {
    const w = new MeshWorld(mk(ph), v).build(0, 0, 0);
    const r = run(w, spawn(5.5, 9.5 + ph, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4, { probe: false });
    cells.push(`${ph.toFixed(2)}:${r.s.position[0] > 14.5 ? 'OVER' : 'blk'}(${f2(r.s.position[0])},${f2(r.maxY)})`);
  }
  console.log(`${k} ${v.padEnd(7)} ${cells.join(' ')}`);
}
