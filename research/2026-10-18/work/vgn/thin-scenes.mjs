// vgn adversarial built scenes on hinted flat ground (top at BASE = 6).
import { AIR, GRASS, DIRT, STONE, PLANKS, BRICK, SHARP_BIT } from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
export const BASE = 6;
export const ground = (x, y, z) => {
  const d = BASE - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = BASE - 1 - y;
  return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
};
const B = BASE;
/** inside(x,y,z) → material value (0 = not built) */
const built = (inside) => (x, y, z) => {
  const v = y >= B ? inside(x, y, z) : 0;
  return v ? { v, edited: true } : ground(x, y, z);
};
const SH = (m) => m | SHARP_BIT;
const cam = (eye, target) => ({ eye, target });
export const THIN = [
  { name: 'fence-1w-3h', cell: built((x, y, z) => (x === 16 && z >= 6 && z < 26 && y < B + 3 ? PLANKS : 0)), camera: cam([24, B + 6, 30], [16, B + 1.5, 16]) },
  { name: 'wall-1w-6h', cell: built((x, y, z) => (x === 16 && z >= 6 && z < 26 && y < B + 6 ? STONE : 0)), camera: cam([25, B + 8, 31], [16, B + 3, 16]) },
  { name: 'posts-gap2', cell: built((x, y, z) => ((x - 10) % 3 === 0 && x >= 10 && x <= 22 && z === 16 && y < B + 3 ? PLANKS : 0)), camera: cam([19, B + 5, 25], [16, B + 1.5, 16]) },
  { name: 'carport-roof', cell: built((x, y, z) => ((x >= 10 && x < 12 && z >= 8 && z < 24 && y < B + 4) || (y === B + 3 && x >= 10 && x < 22 && z >= 8 && z < 24) ? PLANKS : 0)), camera: cam([28, B + 2.2, 30], [17, B + 2, 16]) },
  { name: 'table', cell: built((x, y, z) => ((y === B + 1 && x >= 10 && x < 22 && z >= 10 && z < 22) || (y === B && (x === 10 || x === 21) && (z === 10 || z === 21)) ? PLANKS : 0)), camera: cam([27, B + 1.6, 29], [16, B + 0.8, 16]) },
  { name: 'stairs-1w', cell: built((x, y, z) => (z === 16 && x >= 8 && x < 20 && y - B <= x - 8 ? STONE : 0)), camera: cam([12, B + 8, 26], [14, B + 4, 16]) },
  { name: 'stairs-3w', cell: built((x, y, z) => (z >= 15 && z <= 17 && x >= 8 && x < 20 && y - B <= x - 8 ? STONE : 0)), camera: cam([10, B + 9, 28], [14, B + 4, 16]) },
  { name: 'tree', cell: built((x, y, z) => {
      if (x === 16 && z === 16 && y < B + 5) return PLANKS;
      return Math.hypot(x + 0.5 - 16.5, y + 0.5 - (B + 6.5), z + 0.5 - 16.5) < 2.7 ? GRASS : 0;
    }), camera: cam([24, B + 7, 25], [16.5, B + 4, 16.5]) },
  { name: 'ledge-1thick', cell: built((x, y, z) => ((x >= 18 && y < B + 4 && z >= 6 && z < 26) || (y === B + 2 && x >= 14 && x < 18 && z >= 8 && z < 24) ? STONE : 0)), camera: cam([6, B + 2.5, 28], [16, B + 1.5, 16]) },
  { name: 'ramp-by-sharp-wall', cell: built((x, y, z) => {
      if (x === 20 && z >= 6 && z < 26 && y < B + 4) return SH(BRICK);
      return x >= 8 && x < 20 && z >= 8 && z < 24 && (y - B + 0.5) < (x - 8 + 0.5) / 3 ? PLANKS : 0;
    }), camera: cam([8, B + 7, 30], [15, B + 1, 16]) },
  { name: 'fence-sharp-posts', cell: built((x, y, z) => {
      if (x !== 16 || z < 6 || z >= 26) return 0;
      if ((z - 6) % 5 === 0 && y < B + 4) return SH(BRICK);
      return y < B + 2 ? PLANKS : 0;
    }), camera: cam([24, B + 5, 30], [16, B + 1.5, 16]) },
  { name: 'house-door-window', cell: built((x, y, z) => {
      const wall = (x === 8 || x === 23 || z === 8 || z === 23) && x >= 8 && x <= 23 && z >= 8 && z <= 23 && y < B + 5;
      const roof = y === B + 4 && x >= 8 && x <= 23 && z >= 8 && z <= 23;
      const door = z === 23 && x >= 15 && x <= 16 && y < B + 2;
      const win = x === 23 && z >= 13 && z <= 14 && y === B + 2;
      return (wall || roof) && !door && !win ? PLANKS : 0;
    }), camera: cam([30, B + 5, 31], [16, B + 2, 16]) },
  { name: 'wall-diag-1w', cell: built((x, y, z) => (x === z && x >= 6 && x < 26 && y < B + 3 ? STONE : 0)), camera: cam([26, B + 6, 10], [16, B + 1.5, 16]) },
  { name: 'two-walls-gap1', cell: built((x, y, z) => ((x === 14 || x === 16) && z >= 8 && z < 24 && y < B + 4 ? STONE : 0)), camera: cam([24, B + 6, 30], [15, B + 2, 16]) },
  { name: 'slab-1-above-ground', cell: built((x, y, z) => (y === B + 1 && x >= 8 && x < 24 && z >= 8 && z < 24 ? PLANKS : 0)), camera: cam([28, B + 1.5, 30], [16, B + 1, 16]) },
  { name: 'beam-1x1-span', cell: built((x, y, z) => ((y === B + 3 && z === 16 && x >= 8 && x < 24) || ((x === 8 || x === 23) && z === 16 && y < B + 3) ? STONE : 0)), camera: cam([16, B + 2, 26], [16, B + 2, 16]) },
];
