import { MeshWorld, run, spawn, binary, placed, f2, penetration } from './phys.mjs';
const tread = (x) => 8 + Math.max(0, x - 8);
const fn = (x, y) => (y < 8 ? binary(y) : y < tread(x) && x < 24 ? placed() : { v: 0 });
for (const v of ['cubes', 'hints']) {
  const w = new MeshWorld(fn, v).build(0, 0, 0);
  const m = w.meshes.values().next().value.mesh;
  console.log(v, 'quads', m.quadCount, 'verts', m.vertexCount);
  let last = -1;
  run(w, spawn(5.5, 8.05, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 8, { probe: false, onStep: (s, t) => { const k = Math.floor(t * 4); if (k !== last) { last = k; if (k % 2 === 0) console.log(`  t ${t.toFixed(2)} pos (${f2(s.position[0])}, ${f2(s.position[1])}, ${f2(s.position[2])}) onGround ${s.onGround} pen ${f2(penetration(w, s))}`); } } });
}
