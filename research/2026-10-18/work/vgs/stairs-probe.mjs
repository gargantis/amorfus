// VGS: why does a 1-wide 1:1 stairwell fail? Variants of the stair scene.
import { MeshWorld, run, spawn, natural, placed, dug, binary, PLANKS, f2 } from './phys.mjs';
const rock = (y) => natural(y, 30);
const tread = (x) => 8 + Math.max(0, x - 8);
const S = {
  'dug 1-wide h3': (x, y, z) => (z === 16 && x >= 4 && x < 24 && y >= tread(x) && y < tread(x) + 3 ? dug() : rock(y)),
  'dug 2-wide h3': (x, y, z) => ((z === 16 || z === 17) && x >= 4 && x < 24 && y >= tread(x) && y < tread(x) + 3 ? dug() : rock(y)),
  'dug 3-wide h3': (x, y, z) => (z >= 15 && z <= 17 && x >= 4 && x < 24 && y >= tread(x) && y < tread(x) + 3 ? dug() : rock(y)),
  'built open 1:1 stairs, infinite width': (x, y) => (y < 8 ? binary(y) : y < tread(x) && x < 24 ? placed() : { v: 0 }),
  'built 1:1 stairs 1 wide between 4-high walls': (x, y, z) => { if (y < 8) return binary(y); if ((z === 15 || z === 17) && x >= 4 && x < 26 && y < tread(x) + 4) return placed(PLANKS); if (z === 16 && x < 24 && y < tread(x)) return placed(); return { v: 0 }; },
  'built 1:1 stairs 1 wide, no walls (balance beam stairs)': (x, y, z) => { if (y < 8) return binary(y); if (z === 16 && x < 24 && y < tread(x)) return placed(); return { v: 0 }; },
};
for (const v of (process.argv[2] ?? 'hints,gs-ctx,gs-mls').split(',')) {
  for (const [n, fn] of Object.entries(S)) {
    const w = new MeshWorld(fn, v).build(0, 0, 0);
    const r = run(w, spawn(5.5, 8.05, 16.5), { move: [0, 1], yaw: -Math.PI / 2 }, 8, { probe: false });
    console.log(`${v.padEnd(7)} ${n.padEnd(52)} end (${f2(r.s.position[0])}, ${f2(r.s.position[1])}, ${f2(r.s.position[2])}) ${r.s.position[1] > 20 ? 'CLIMBED' : 'STUCK'}`);
  }
}
