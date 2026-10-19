// The AO check pieces (shared by aocheck.mjs and composite.mjs).
import * as core from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';
const { AIR, GRASS, DIRT, STONE, PLANKS } = core;
const BASE = 6;
const ground = (top) => (x, y, z) => {
  const d = top - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = top - 1 - y;
  return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
};
const g = ground(BASE);
const built = (inside, v = STONE) => (x, y, z) => (y >= BASE && inside(x, y, z) ? { v, edited: true } : g(x, y, z));
export const CHECKS = [
  { name: 'wall-foot', cell: built((x, y, z) => x >= 16 && y < BASE + 4),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35 && p[2] > 8 && p[2] < 24, dist: (p) => 16 - p[0],
    camera: { eye: [6, BASE + 7, 30], target: [16, BASE + 1, 16] } },
  { name: 'inside-corner', cell: built((x, y, z) => (x >= 16 || z >= 16) && y < BASE + 4),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35, dist: (p) => Math.max(0, Math.hypot(Math.max(0, 16 - p[0]), Math.max(0, 16 - p[2])) ),
    camera: { eye: [6, BASE + 8, 6], target: [16, BASE + 1, 16] } },
  { name: 'overhang', cell: built((x, y, z) => x >= 16 && y === BASE + 1, PLANKS),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35 && p[2] > 8 && p[2] < 24, dist: (p) => 3 - (p[0] - 16),
    camera: { eye: [8, BASE + 3, 30], target: [18, BASE + 0.5, 16] } },
  { name: 'gap-1-high', cell: built((x, y, z) => x >= 12 && x < 21 && z >= 12 && z < 21 && y === BASE + 1, PLANKS),
    probe: (p) => Math.abs(p[1] - BASE) < 0.35 && p[0] > 14 && p[0] < 19 && p[2] > 14 && p[2] < 19, dist: () => 0,
    camera: { eye: [16.5, BASE + 2.5, 30], target: [16.5, BASE + 0.5, 16.5] } },
  { name: 'tunnel-floor', cell: (x, y, z) => {
      const dug = x === 16 && (y === 8 || y === 9) && z >= 4 && z < 28;
      return y < 12 && !dug ? { v: STONE } : { v: AIR, edited: dug };
    },
    probe: (p) => Math.abs(p[1] - 8) < 0.35 && p[2] > 8 && p[2] < 24 && p[0] > 15.6 && p[0] < 17.4, dist: () => 0,
    camera: { eye: [16.5, 9, 31], target: [16.5, 9, 16] } },
  { name: 'flat-open', cell: g,
    probe: (p) => Math.abs(p[1] - BASE) < 0.35, dist: () => 0,
    camera: { eye: [16, BASE + 8, 30], target: [16, BASE, 16] } },
];
