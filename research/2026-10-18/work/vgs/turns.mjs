// VGS: L-turn passability with the REAL controller under many steering
// policies (turn early/late, hug inner/outer side, aim at the far end,
// continuous mouse turn). Reports how many policies get through.
//   node work/vgs/turns.mjs [variants] [scene]
import { MeshWorld, run, spawn, natural, placed, dug, binary, PLANKS, f2, yawTo } from './phys.mjs';

const ROCK = (y) => natural(y, 16);
const band = (x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28);
const SCENES = {
  'L-dug 1×2': (x, y, z) => (y >= 8 && y < 10 && band(x, z) ? dug() : ROCK(y)),
  'L-dug 1×3': (x, y, z) => (y >= 8 && y < 11 && band(x, z) ? dug() : ROCK(y)),
  'L-built roofed 1×2': (x, y, z) => {
    if (y < 8) return binary(y);
    if (y === 10 && x >= 2 && x < 30 && z >= 2 && z < 30) return placed(PLANKS);
    if (y < 10 && !band(x, z)) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (band(x + a, z + b)) return placed(PLANKS); }
    return { v: 0 };
  },
  'L-built open 1-wide (walls 3 high)': (x, y, z) => {
    if (y < 8) return binary(y);
    if (y < 11 && !band(x, z)) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (band(x + a, z + b)) return placed(PLANKS); }
    return { v: 0 };
  },
  'L-dug 1×2 in natural ground φ0.3 (roof natural)': (x, y, z) => (y >= 8 && y < 10 && band(x, z) ? dug() : natural(y, 13.3)),
};
const variants = (process.argv[2] ?? 'cubes,hints,gs-ctx,gs-mls').split(',');
const only = process.argv[3];

// policies: approach along arm A at lateral offset za, turn when x ≥ tx toward
// the far end of arm B (aim point at lateral offset xb), sliding along walls.
const policies = [];
for (const za of [8.35, 8.5, 8.65]) for (const tx of [15.4, 15.6, 15.8, 16.0, 16.2, 16.4]) for (const xb of [16.35, 16.5, 16.65]) policies.push({ za, tx, xb });
function policyInput(p) {
  return (s) => {
    const [x, , z] = s.position;
    if (x < p.tx && z < 9) return { move: [0, 1], yaw: yawTo(p.tx + 1 - x, p.za - z) };
    return { move: [0, 1], yaw: yawTo(p.xb - x, 26 - z) };
  };
}
for (const [name, fn] of Object.entries(SCENES)) {
  if (only && !name.includes(only)) continue;
  const row = [];
  for (const v of variants) {
    const w = new MeshWorld(fn, v).build(0, 0, 0);
    let ok = 0, bestZ = -Infinity, firstOk = null;
    for (const p of policies) {
      const r = run(w, spawn(6.5, 8.05, 8.5), policyInput(p), 9, { probe: false });
      const z = r.s.position[2];
      if (z > bestZ) bestZ = z;
      if (z > 20) { ok++; if (!firstOk) firstOk = p; }
    }
    row.push(`${v}: ${ok}/${policies.length} pass (best z ${f2(bestZ)})`);
  }
  console.log(name.padEnd(48) + row.map((r) => r.padEnd(34)).join(''));
}
