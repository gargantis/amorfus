// VGS look gallery: panels [hints | gs-ctx | gs-mls], production AO and no AO.
//   node work/vgs/look.mjs [scene...]
import { join } from 'node:path';
import { meshWorld, renderPanels, IMG } from './viz.mjs';
import { natural, placed, GRASS, DIRT, STONE, PLANKS, BRICK, SAND, clampRho, AIR } from './phys.mjs';

const VARS = ['hints', 'gs-ctx', 'gs-mls'];
// natural ground with grass/dirt layering at a fixed hint phase
const nat = (top) => (y) => { const d = top - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
const G = nat(8.2);
const P = (m) => ({ v: m, edited: true });
const SCENES = {
  // isolated 1-high steps: a straight 1-high placed terrace edge, a diagonal one, and a 1-high L-shaped platform corner
  steps: {
    fn: (x, y, z) => {
      if (y === 8 && z >= 4 && z < 14 && x >= 14) return P(STONE);              // straight 1-high step (edge x = 14)
      if (y === 8 && z >= 17 && z < 29 && x + (z - 17) >= 16) return P(STONE);  // diagonal 1-high step (1:1 in plan)
      return G(y);
    },
    cams: [{ eye: [6, 12.2, 9], target: [16, 8.3, 16], fovDeg: 60 }, { eye: [10, 14, -2], target: [17, 8.5, 12], fovDeg: 55 }],
  },
  floor: { // 6×6 placed 1-high floor and a 1-high 2-wide path
    fn: (x, y, z) => {
      if (y === 8 && x >= 12 && x < 18 && z >= 12 && z < 18) return P(PLANKS);
      if (y === 8 && z >= 20 && z < 22 && x >= 4 && x < 28) return P(STONE);
      return G(y);
    },
    cams: [{ eye: [8, 11.0, 6], target: [15, 8.5, 15], fovDeg: 60 }],
  },
  kerbs: { // 1-wide 1-high kerbs: straight, diagonal (staircase in plan), and a 1-wide 1-deep gutter
    fn: (x, y, z) => {
      if (y === 8 && z === 10 && x >= 4 && x < 28) return P(STONE);
      if (y === 8 && x - z === -2 && x >= 6 && x < 22) return P(BRICK);
      if (y === 7 && z === 25 && x >= 4 && x < 28) return { v: AIR, edited: true };
      return G(y);
    },
    cams: [{ eye: [3, 11.5, 3], target: [16, 8, 16], fovDeg: 62 }],
  },
  wallslope: { // walls on a natural 1:3 slope: one running up the slope, one across it (3 high, 1 thick)
    fn: (x, y, z) => {
      const top = 8.2 + Math.max(0, (x + 0.5 - 6) / 3);
      const base = (xx) => Math.ceil(8.2 + Math.max(0, (xx + 0.5 - 6) / 3) - 0.5);
      if (z === 12 && x >= 6 && x < 26 && y >= base(x) && y < base(x) + 3) return P(BRICK);
      if (x === 16 && z >= 16 && z < 28 && y >= base(x) && y < base(x) + 3) return P(BRICK);
      return nat(top)(y);
    },
    cams: [{ eye: [2, 14, 30], target: [16, 11, 16], fovDeg: 60 }, { eye: [2, 13, 4], target: [16, 11, 14], fovDeg: 60 }],
  },
  stairswall: { // 2-wide 1:1 and 1:2 staircases against a 5-high wall
    fn: (x, y, z) => {
      if (z === 9 && x >= 6 && x < 26 && y >= 8 && y < 14) return P(BRICK);
      if ((z === 10 || z === 11) && x >= 8 && x < 14 && y >= 8 && y < 8 + (x - 7)) return P(STONE);
      if ((z === 10 || z === 11) && x >= 16 && x < 26 && y >= 8 && y < 8 + ((x - 15 + 1) >> 1)) return P(PLANKS);
      return G(y);
    },
    cams: [{ eye: [14, 13, 22], target: [16, 10, 10], fovDeg: 62 }],
  },
  house: { // hollow 7×7 house, door and windows, on natural ground
    fn: (x, y, z) => {
      const lx = x - 12, lz = z - 12;
      if (lx >= 0 && lx <= 6 && lz >= 0 && lz <= 6 && y >= 8 && y <= 12) {
        if (y === 12) return P(PLANKS);
        const wall = lx === 0 || lx === 6 || lz === 0 || lz === 6;
        if (wall && !(lx === 3 && lz === 0 && y < 10) && !(y === 10 && (lx === 1 || lx === 5) && lz === 0)) return P(BRICK);
        return G(y);
      }
      return G(y);
    },
    cams: [{ eye: [15.5, 11, 2], target: [15.5, 9.5, 14], fovDeg: 60 }],
  },
};
const want = process.argv.slice(2);
for (const [name, sc] of Object.entries(SCENES)) {
  if (want.length && !want.includes(name)) continue;
  sc.cams.forEach((cam, ci) => {
    for (const noao of [false, true]) {
      const panels = VARS.map((v) => ({ mesh: meshWorld(sc.fn, v) }));
      const f = renderPanels(join(IMG, `look-${name}-${ci}${noao ? '-noao' : ''}.png`), panels, cam, { width: 400, height: 280, noao });
      console.log(f);
    }
  });
}
