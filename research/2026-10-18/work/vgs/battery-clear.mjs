// VGS battery 2: clearance gates with the REAL controller — axis-aligned
// (team's), DIAGONAL and IRREGULAR passages, L-turns, junctions, doorways,
// roofs over natural ground at fine hint phases, stairwells.
//   node work/vgs/battery-clear.mjs [variants] [filter]
import { MeshWorld, run, follow, spawn, natural, placed, dug, binary, STONE, PLANKS, f2 } from './phys.mjs';

const variants = (process.argv[2] ?? 'cubes,hints,gs-ctx,gs-mls').split(',');
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const tests = [];
const T = (name, fn, path, opts = {}) => tests.push({ name, fn, path, opts });

// --- helpers ---
const ROCK_TOP = 16; // natural hill top far above the tunnels (walls rho ~ 1)
const rock = (y) => natural(y, ROCK_TOP);
/** dug tunnel: `isAir(x, z)` marks the plan cells; floor y = 8, height h. */
const tunnel = (isAir, h = 2, y0 = 8) => (x, y, z) => (y >= y0 && y < y0 + h && isAir(x, z) ? dug() : rock(y));
/** built corridor on binary ground: placed walls where isWall(x,z), h high, optional placed roof. */
const corridor = (isWall, h = 3, roof = false) => (x, y, z) => {
  if (y < 8) return binary(y);
  if (y < 8 + h && isWall(x, z)) return placed(PLANKS);
  if (roof && y === 10 && x >= 1 && x < 31 && z >= 1 && z < 31) return placed(PLANKS);
  return { v: 0 };
};
const P = (...pts) => pts;
/** placed 1-thick walls (3 high) hugging a plan band: every cell within
 *  Chebyshev 1 of the band that is not in it; optional roof at y = 10. */
const hug = (band, roof = false) => corridor((x, z) => {
  if (band(x, z)) return false;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (band(x + dx, z + dz)) return true;
  return false;
}, roof ? 2 : 3, roof);
const reach = (s, [tx, tz], tol = 0.6) => Math.hypot(s.position[0] - tx, s.position[2] - tz) < tol;

// 1. straight 1×2 tunnel (control)
T('1×2 tunnel straight (x)', tunnel((x, z) => z === 16 && x >= 4 && x < 28), P([4.5, 16.5], [27.5, 16.5]));
// 2. L-turns, both hands, both orders
T('1×2 L-turn x→+z', tunnel((x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28)), P([4.5, 8.5], [16.5, 8.5], [16.5, 27.5]));
T('1×2 L-turn x→−z', tunnel((x, z) => (z === 24 && x >= 4 && x <= 16) || (x === 16 && z > 4 && z <= 24)), P([4.5, 24.5], [16.5, 24.5], [16.5, 4.5]));
T('1×2 Z-bend (two L-turns 2 apart)', tunnel((x, z) => (z === 8 && x >= 4 && x <= 12) || (x === 12 && z >= 8 && z <= 10) || (z === 10 && x >= 12 && x < 28)), P([4.5, 8.5], [12.5, 8.5], [12.5, 10.5], [27.5, 10.5]));
T('1×2 zig-zag (L-turn every block)', tunnel((x, z) => { const k = x - 4; return k >= 0 && k < 20 && (z === 8 + (k >> 1) || z === 8 + ((k + 1) >> 1)); }), P([4.5, 8.5], [24, 18]));
// 3. diagonal tunnels (staircase bands, the minimal passable band under cubes)
T('1×2 diagonal 1:1 band {0,1}', tunnel((x, z) => x >= 4 && x < 28 && (x - z === 0 || x - z === 1)), P([5, 4.5], [27, 26.5]));
T('1×2 diagonal 1:1 band {0,1} other hand', tunnel((x, z) => x >= 4 && x < 28 && (x + z === 32 || x + z === 33)), P([5, 27.5], [27, 5.5]));
T('1×2 diagonal 1:2 band (3 per row)', tunnel((x, z) => { const k = z - 6; return k >= 0 && k < 10 && x >= 4 + 2 * k && x < 7 + 2 * k; }), P([5.5, 6.5], [25, 15.5]));
T('1×2 diagonal 2:1 band (3 per column)', tunnel((x, z) => { const k = x - 6; return k >= 0 && k < 10 && z >= 4 + 2 * k && z < 7 + 2 * k; }), P([6.5, 5.5], [15.5, 25]));
T('1×2 diagonal 1:3 band (4 per row)', tunnel((x, z) => { const k = z - 8; return k >= 0 && k < 7 && x >= 3 + 3 * k && x < 7 + 3 * k; }), P([4.5, 8.5], [26, 14.5]));
// 4. junctions
T('1×2 T-junction straight through', tunnel((x, z) => (z === 16 && x >= 4 && x < 28) || (x === 16 && z >= 4 && z <= 16)), P([4.5, 16.5], [27.5, 16.5]));
T('1×2 T-junction turn', tunnel((x, z) => (z === 16 && x >= 4 && x < 28) || (x === 16 && z >= 4 && z <= 16)), P([4.5, 16.5], [16.5, 16.5], [16.5, 4.5]));
T('1×2 crossing straight through', tunnel((x, z) => (z === 16 && x >= 4 && x < 28) || (x === 16 && z >= 4 && z < 28)), P([4.5, 16.5], [27.5, 16.5]));
// 5. 1×2 tunnel with irregular walls (niches/bumps) and 2-wide sections
T('1×2 tunnel with 1-block side niches', tunnel((x, z) => (z === 16 && x >= 4 && x < 28) || (z === 17 && x % 3 === 0 && x > 5 && x < 26)), P([4.5, 16.5], [27.5, 16.5]));
T('1×2 tunnel alternating niches both sides', tunnel((x, z) => (z === 16 && x >= 4 && x < 28) || (z === 17 && x % 4 === 0 && x > 5 && x < 26) || (z === 15 && x % 4 === 2 && x > 5 && x < 26)), P([4.5, 16.5], [27.5, 16.5]));
T('1×2 tunnel 2-wide then 1-wide', tunnel((x, z) => (z === 16 && x >= 4 && x < 28) || (z === 17 && x >= 4 && x < 14)), P([4.5, 16.5], [27.5, 16.5]));
// 6. built 1-wide gaps (no roof): placed walls 3 high
T('gap 1-wide placed|placed straight', corridor((x, z) => (z === 15 || z === 17) && x >= 6 && x < 26), P([3.5, 16.5], [28.5, 16.5]));
T('gap 1-wide DIAGONAL placed walls', corridor((x, z) => x >= 4 && x < 28 && (x - z === -1 || x - z === 2)), P([4, 2.5], [28, 26.5]));
T('gap 1-wide diagonal 1:2 placed walls', hug((x, z) => { const k = z - 6; return k >= 0 && k < 10 && x >= 4 + 2 * k && x < 7 + 2 * k; }), P([5.5, 6.5], [24.5, 15.5]));
T('gap 1-wide diagonal 1:1 hugging walls', hug((x, z) => x >= 4 && x < 28 && (x - z === 0 || x - z === 1)), P([5, 4.5], [27, 26.5]));
T('gap 1-wide zig-zag hugging walls', hug((x, z) => { const k = x - 4; return k >= 0 && k < 20 && (z === 8 + (k >> 1) || z === 8 + ((k + 1) >> 1)); }), P([4.5, 8.5], [24, 18]));
T('roofed 1×2 L-turn hugging walls (built, not dug)', hug((x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28), true), P([4.5, 8.5], [16.5, 8.5], [16.5, 27.5]));
T('roofed 1×2 diagonal hugging walls (built)', hug((x, z) => x >= 4 && x < 28 && (x - z === 0 || x - z === 1), true), P([5, 4.5], [27, 26.5]));
T('gap 1-wide, walls with outward niches', corridor((x, z) => ((z === 15 || z === 17) && x >= 6 && x < 26 && !((x === 12 || x === 20) && z === 17)) || (z === 18 && ((x >= 11 && x <= 13) || (x >= 19 && x <= 21))) || (z === 17 && (x === 11 || x === 13 || x === 19 || x === 21))), P([3.5, 16.5], [28.5, 16.5]));
// 7. doorways
const wallX = (x0, door) => (x, y, z) => {
  if (y < 8) return binary(y);
  if (x === x0 && y < 12 && z >= 2 && z < 30 && !door(y, z)) return placed(PLANKS);
  return { v: 0 };
};
T('1×2 doorway, 1-thick wall (control)', wallX(16, (y, z) => z === 16 && y < 10), P([10.5, 16.5], [22.5, 16.5]));
T('1×2 doorway approached at 45°', wallX(16, (y, z) => z === 16 && y < 10), P([12.5, 12.5], [16.5, 16.5], [20.5, 20.5]));
T('1×2 doorway beside a perpendicular wall', (x, y, z) => {
  if (y < 8) return binary(y);
  if (y < 12 && ((x === 16 && z >= 2 && z < 30 && !(z === 16 && y < 10)) || (z === 15 && x >= 17 && x < 28))) return placed(PLANKS);
  return { v: 0 };
}, P([10.5, 16.5], [22.5, 16.5]));
T('1×2 doorway in a 2-thick wall', (x, y, z) => {
  if (y < 8) return binary(y);
  if ((x === 16 || x === 17) && y < 12 && z >= 2 && z < 30 && !(z === 16 && y < 10)) return placed(PLANKS);
  return { v: 0 };
}, P([10.5, 16.5], [22.5, 16.5]));
T('1×2 doorway in a DIAGONAL wall', (x, y, z) => {
  if (y < 8) return binary(y);
  const onWall = x - z === 0 || x - z === 1; // 2-cell staircase band = solid diagonal wall
  if (onWall && y < 12 && x >= 4 && x < 28 && !(x >= 15 && x <= 16 && z === 15 && y < 10)) return placed(PLANKS);
  return { v: 0 };
}, P([12.5, 17.5], [15.5, 15.5], [18.5, 13.5]));
// 8. roof 2 above natural ground, fine phases; and a diagonal roof edge
for (const ph of [0, 0.1, 0.2, 0.3, 0.4, 0.45, 0.49]) {
  T(`roof 2 above natural ground φ${ph}`, (x, y, z) => (x >= 10 && x < 22 && z >= 12 && z < 20 && y === 10 ? placed(PLANKS) : natural(y, 8 + ph)), P([5.5, 16.5], [26.5, 16.5]));
}
for (const ph of [0.2, 0.45]) {
  T(`roof 2 above natural φ${ph}, diagonal edge, walk diagonally in`, (x, y, z) => (y === 10 && x >= 8 && z >= 8 && x < 28 && z < 28 && x + z >= 26 ? placed(PLANKS) : natural(y, 8 + ph)), P([6.5, 6.5], [22.5, 22.5]));
  T(`roof 2 above natural φ${ph}, walk under a roof corner`, (x, y, z) => (y === 10 && x >= 14 && z >= 14 && x < 28 && z < 28 ? placed(PLANKS) : natural(y, 8 + ph)), P([8.5, 8.5], [24.5, 24.5]));
}
// 9. 2-high room: placed walls + roof on natural ground, door, walk to the far corner
for (const ph of [0, 0.3, 0.45]) {
  T(`2-high room on natural φ${ph}: enter, go to corner`, (x, y, z) => {
    const inBox = x >= 8 && x <= 20 && z >= 8 && z <= 20;
    if (y === 10 && inBox) return placed(PLANKS);
    if ((y === 8 || y === 9) && inBox && (x === 8 || x === 20 || z === 8 || z === 20) && !(x === 8 && z === 14)) return placed(PLANKS);
    return natural(y, 8 + ph);
  }, P([4.5, 14.5], [10.5, 14.5], [18.6, 18.6]), { goalTol: 0.4 });
}
// 10. stairwell: 1-wide 1:1 stairs going up through rock with 2 headroom above each tread
T('stairwell 1:1, 1 wide, headroom 2 (cubes needs jumps)', (x, y, z) => {
  if (z !== 16 || x < 4 || x >= 24) return rock2(y);
  const tread = 8 + Math.max(0, x - 8); // floor top
  return y >= tread && y < tread + 2 ? dug() : rock2(y);
}, P([4.5, 16.5], [23.5, 16.5]), { goalY: 22 });
T('stairwell 1:1, 1 wide, headroom 3', (x, y, z) => {
  if (z !== 16 || x < 4 || x >= 24) return rock2(y);
  const tread = 8 + Math.max(0, x - 8);
  return y >= tread && y < tread + 3 ? dug() : rock2(y);
}, P([4.5, 16.5], [23.5, 16.5]), { goalY: 22 });
T('stairwell 1:2, 1 wide, headroom 2', (x, y, z) => {
  if (z !== 16 || x < 4 || x >= 28) return rock2(y);
  const tread = 8 + Math.max(0, (x - 8) >> 1);
  return y >= tread && y < tread + 2 ? dug() : rock2(y);
}, P([4.5, 16.5], [27.5, 16.5]), { goalY: 17 });
function rock2(y) { return natural(y, 30); }

let results = {};
for (const t of tests) {
  if (filter && !filter.test(t.name)) continue;
  const row = [];
  for (const v of variants) {
    const w = new MeshWorld(t.fn, v).build(0, 0, 0);
    const goal = t.path[t.path.length - 1];
    const start = t.path[0];
    const f = follow(t.path.slice(1), { tol: t.opts.goalTol ?? 0.45 });
    const r = run(w, spawn(start[0], t.opts.spawnY ?? 8.05, start[1]), f, t.opts.seconds ?? 14);
    let pass = reach(r.s, goal, (t.opts.goalTol ?? 0.45) + 0.35);
    if (t.opts.goalY !== undefined) pass = pass && r.s.position[1] > t.opts.goalY;
    const detail = `${pass ? 'PASS' : 'FAIL'} @(${f2(r.s.position[0])},${f2(r.s.position[1])},${f2(r.s.position[2])}) wp${f.progress()} pen ${f2(r.maxPen)}`;
    row.push(detail);
    (results[t.name] ??= {})[v] = { pass, pos: r.s.position, wp: f.progress(), pen: r.maxPen, penAt: r.maxPenAt };
  }
  console.log(t.name.padEnd(56) + row.map((r) => r.padEnd(40)).join(''));
}
for (const v of variants) {
  const names = Object.keys(results);
  console.log(`${v}: ${names.filter((n) => results[n][v].pass).length}/${names.length} pass`);
}
