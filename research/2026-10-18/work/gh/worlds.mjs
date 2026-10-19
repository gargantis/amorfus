// Team gh test worlds (scene coordinates, chunk at [0,32)³). Generated ground
// is hinted flat (top at BASE = 6, the harness's generator layering); builds
// are shape-edited (placed blocks are binary, dug air is edited air).
import { clampRho } from '../../harness/scenes.mjs';
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, PLANKS = 5, BRICK = 6;
const BASE = 6;
const ground = (top) => (x, y, z) => {
  const d = top - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = top - 1 - y;
  return { v: depth < 1 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
};
const g6 = ground(BASE);

// Builder's gallery: the shapes a player actually makes.
function gallery(x, y, z) {
  const put = (v) => ({ v, edited: true });
  // 1. 1-high stone platform 6×6
  if (y === BASE && x >= 2 && x < 8 && z >= 2 && z < 8) return put(STONE);
  // 2. 1-high, 1-wide curb
  if (y === BASE && x === 11 && z >= 2 && z < 11) return put(BRICK);
  // 3. planks floor 1 high, 8×6, with a 2-high planks wall on its far edge
  if (y === BASE && x >= 15 && x < 23 && z >= 2 && z < 8) return put(PLANKS);
  if ((y === BASE + 1 || y === BASE + 2) && x >= 15 && x < 23 && z === 2) return put(PLANKS);
  // 4. 1:1 staircase, 4 steps, then a 3-deep landing
  if (z >= 12 && z < 17 && x >= 2 && x < 9) { const h = Math.min(4, x - 1); if (y >= BASE && y < BASE + h) return put(STONE); }
  // 5. 2-high brick wall, 1 thick
  if ((y === BASE || y === BASE + 1) && z === 22 && x >= 2 && x < 11) return put(BRICK);
  // 6. dug pit 1 deep, 4×4
  if (y === BASE - 1 && x >= 15 && x < 19 && z >= 12 && z < 16) return { v: AIR, edited: true };
  // 7. 1:2 staircase, 4 steps
  if (z >= 12 && z < 17 && x >= 21 && x < 30) { const h = Math.min(4, Math.floor((x - 21) / 2) + 1); if (y >= BASE && y < BASE + h) return put(SAND); }
  // 8. 3×3 tower 3 high
  if (y >= BASE && y < BASE + 3 && x >= 16 && x < 19 && z >= 21 && z < 24) return put(STONE);
  // 9. a 1-high diagonal ridge (1:1 plan staircase, 2 wide)
  if (y === BASE && x >= 22 && x < 30 && (z - x === -2 || z - x === -1) && z >= 19) return put(STONE);
  return g6(x, y, z);
}

// One isolated 1-high step across the chunk (x ≥ 16), on hinted ground.
const step1 = (x, y, z) => (y === BASE && x >= 16 ? { v: STONE, edited: true } : g6(x, y, z));
// A 1-high planks floor (placed layer) with a sharp-less edge, on hinted ground
// whose hint sits 0.45 above its grid plane (worst floating case).
const g645 = ground(BASE + 0.45);
const floor45 = (x, y, z) => (y === BASE && x >= 10 && x < 24 && z >= 8 && z < 24 ? { v: PLANKS, edited: true } : g645(x, y, z));

export const WORLDS = {
  gallery: { cell: gallery, camera: { eye: [16, BASE + 17, 38], target: [16, BASE, 14] } },
  'gallery-low': { cell: gallery, camera: { eye: [-4, BASE + 7, 30], target: [12, BASE + 1, 12] } },
  step1: { cell: step1, camera: { eye: [9, BASE + 4, 26], target: [17, BASE + 0.5, 15] } },
  floor45: { cell: floor45, camera: { eye: [6, BASE + 5, 30], target: [16, BASE + 0.5, 15] } },
};
