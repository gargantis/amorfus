import { MeshWorld, run, spawn, natural, placed, f2, penetration } from './phys.mjs';
const terr = (ph) => (x, y) => natural(y, 8 + ph + (x + 0.5 >= 12 ? 1 : 0));
const fn = (x, y) => (x === 13 && y === 9 ? placed() : terr(0)(x, y));
for (const v of ['cubes', 'hints']) {
  const w = new MeshWorld(fn, v).build(0, 0, 0);
  let k = -1;
  run(w, spawn(5.5, 9.5, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 3, { probe: false, onStep: (s, t) => { const kk = Math.floor(t * 10); if (kk !== k) { k = kk; if (s.position[0] > 10.5 && s.position[0] < 16) console.log(`${v} t ${t.toFixed(2)} (${f2(s.position[0])}, ${f2(s.position[1])}) pen ${f2(penetration(w, s))} onG ${s.onGround}`); } } });
  // list the solid blocks along x at z=16 for y 7..10
  for (let y = 10; y >= 7; y--) { let line = `  y${y} `; for (let x = 9; x < 16; x++) line += (fn(x, y, 16).v ? (fn(x, y, 16).edited ? 'P' : '#') : '.'); console.log(line); }
}
