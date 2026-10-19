// vmf adversarial scenes — approach-agnostic, harness scene format:
//   { name, cell(x,y,z) → {v, rho?, edited?}, camera, closeups?, plan?, win? }
// `plan` (x,z) → material of the top layer for flat/heightfield scenes (used
// for plan rasters and metrics). Scene coords = chunk-local of chunk [0,32)³.
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS, BRICK, SHARP_BIT } from '../../harness/core.mjs';
import { clampRho } from '../../harness/scenes.mjs';

export const GROUND = 8;
/** Flat generated (hinted) ground, top at `top`; top layer = plan(x,z). */
export function flatGround(plan, top = GROUND) {
  return (x, y, z) => {
    const d = top - (y + 0.5);
    if (d <= 0) return { v: AIR, rho: clampRho(d) };
    const depth = top - 1 - y;
    return { v: depth === 0 ? plan(x, z) : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
  };
}
const CAM = { eye: [16, GROUND + 17, 16 + 21], target: [16, GROUND, 15] };
const WIN = [4, 4, 28, 28];
const S = [];
const flat = (name, plan, extra = {}) => S.push({ name, kind: 'plan', plan, cell: flatGround(plan), camera: CAM, win: WIN, ...extra });

// ---- paint patterns on flat ground --------------------------------------
const box = (x, z, x0 = 8, z0 = 8, x1 = 24, z1 = 24) => x >= x0 && x < x1 && z >= z0 && z < z1;
flat('stripes-h2', (x, z) => (box(x, z, 8, 9, 24, 23) && (z - 9) % 2 === 0 ? STONE : GRASS));
flat('checker16', (x, z) => (box(x, z) && (x + z) % 2 === 0 ? STONE : GRASS)); // = 1:1 diagonal 1-wide stripes 1 apart
flat('stripes-d3', (x, z) => (box(x, z) && (((x - z) % 3) + 3) % 3 === 0 ? STONE : GRASS)); // 1:1 diagonals, gap 2
flat('stripes-12', (x, z) => { // 1-wide 1:2 lines, 1-block gap between them
  if (!box(x, z, 6, 4, 26, 28)) return GRASS;
  const k = z - Math.floor(x / 2);
  return k >= 2 && k < 14 && (k % 2 === 0) ? STONE : GRASS;
});
flat('dither-2x1', (x, z) => (box(x, z) && (((x >> 1) + z) % 2 === 0) ? STONE : GRASS));
flat('dither-25', (x, z) => (box(x, z) && x % 2 === 0 && z % 2 === 0 ? STONE : GRASS));
flat('lines-T', (x, z) => ((z === 10 && x >= 5 && x < 27) || (x === 16 && z > 10 && z < 27) ? STONE : GRASS));
flat('lines-X', (x, z) => ((z === 16 && x >= 5 && x < 27) || (x === 16 && z >= 5 && z < 27) ? STONE : GRASS));
flat('lines-Xdiag', (x, z) => (x >= 5 && x < 27 && z >= 5 && z < 27 && (x - z === 0 || x + z === 31) ? STONE : GRASS));
flat('lines-Tdiag', (x, z) => ((x >= 5 && x < 27 && z >= 5 && z < 27 && x - z === 0) || (z === 16 && x > 16 && x < 27) ? STONE : GRASS));

// pixel-art 3×5 glyphs, 1-block strokes, 1-block gaps
const FONT = {
  0: ['111', '101', '101', '101', '111'], 2: ['111', '001', '111', '100', '111'],
  6: ['111', '100', '111', '101', '111'], 8: ['111', '101', '111', '101', '111'],
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  E: ['111', '100', '110', '100', '111'], M: ['101', '111', '101', '101', '101'],
  R: ['110', '101', '110', '101', '101'], S: ['011', '100', '010', '001', '110'],
  '#': ['101', '111', '101', '111', '101'], 4: ['101', '101', '111', '001', '001'],
};
const TEXT = [['2068', 6, 5], ['BEAM', 6, 12], ['RS#4', 6, 19]];
const textPlan = (fg, bg) => (x, z) => {
  for (const [s, x0, z0] of TEXT) {
    const r = z - z0;
    if (r < 0 || r >= 5) continue;
    const c = x - x0;
    if (c < 0 || c >= s.length * 4) continue;
    const g = FONT[s[Math.floor(c / 4)]], col = c % 4;
    if (col < 3 && g[r][col] === '1') return fg;
  }
  return bg;
};
flat('pixel-text', textPlan(STONE, GRASS), { win: [4, 3, 26, 26] });
flat('pixel-text-planks-on-stone', textPlan(PLANKS, STONE), { win: [4, 3, 26, 26] });

// material corners
flat('corner4', (x, z) => (x >= 16 ? (z >= 16 ? STONE : GRASS) : (z >= 16 ? SAND : PLANKS)));
flat('corner3', (x, z) => (z < 16 ? GRASS : x >= 16 ? STONE : SAND));
flat('corner4-diag', (x, z) => { const u = x + z - 31, v = x - z; return u >= 0 ? (v >= 0 ? STONE : GRASS) : (v >= 0 ? SAND : PLANKS); });
flat('corner3-thin', (x, z) => (z === 16 && x < 16 ? SAND : x === 16 && z < 16 ? STONE : GRASS)); // two 1-wide lines meeting at an L of different materials

// ---- generated hill (curved, non-planar quads) with painted lines --------
const hillH = (x, z) => 9 + 5 * Math.exp(-((x - 16) ** 2 + (z - 16) ** 2) / (2 * 5.5 ** 2));
const hillCell = (plan) => (x, y, z) => {
  const d = hillH(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const HCAM = { eye: [16, 26, 38], target: [15, 10, 15] };
const hill = (name, plan, extra = {}) => S.push({ name, kind: 'plan', plan, cell: hillCell(plan), camera: HCAM, win: WIN, ...extra });
hill('hill-line1-1:1', (x, z) => (x >= 3 && x < 29 && z === x ? STONE : GRASS));
hill('hill-line1-1:2', (x, z) => (x >= 3 && x < 29 && z === Math.round(0.5 * (x + 0.5) + 8.3 - 0.5) ? STONE : GRASS));
hill('hill-edge-1:1', (x, z) => ((x + 0.5 - 16.13) * -Math.SQRT1_2 + (z + 0.5 - 16.37) * Math.SQRT1_2 > 0 ? STONE : GRASS));
hill('hill-edge-1:2', (x, z) => { const t = Math.atan(0.5); return (x + 0.5 - 16.13) * -Math.sin(t) + (z + 0.5 - 16.37) * Math.cos(t) > 0 ? STONE : GRASS; });
// same paints on flat ground, for a like-for-like comparison
flat('flat-line1-1:1', (x, z) => (x >= 3 && x < 29 && z === x ? STONE : GRASS));
flat('flat-edge-1:1', (x, z) => ((x + 0.5 - 16.13) * -Math.SQRT1_2 + (z + 0.5 - 16.37) * Math.SQRT1_2 > 0 ? STONE : GRASS));

// ---- steps (built, shape-edited) with 1-wide lines --------------------------
const stepCell = (top, line) => (x, y, z) => {
  if (y === GROUND && x >= 16) return { v: line(x, y, z) ? STONE : GRASS, edited: true }; // 1-high built platform
  const c = flatGround((xx, zz) => (line(xx, GROUND - 1, zz) ? STONE : GRASS))(x, y, z);
  return c;
};
const STEPCAM = { eye: [8, GROUND + 7, 30], target: [17, GROUND, 14] };
const STEPCLOSE = [{ eye: [12.5, GROUND + 3.5, 21], target: [16.5, GROUND + 0.5, 15] }];
S.push({ name: 'step-line-top', kind: 'view', cell: stepCell(0, (x, y, z) => y === GROUND && x === 16 && z >= 6 && z < 26), camera: STEPCAM, closeups: STEPCLOSE });
S.push({ name: 'step-line-foot', kind: 'view', cell: stepCell(0, (x, y, z) => y === GROUND - 1 && x === 15 && z >= 6 && z < 26), camera: STEPCAM, closeups: STEPCLOSE });
S.push({ name: 'step-line-cross', kind: 'view', cell: stepCell(0, (x, y, z) => z === 16 && x >= 6 && x < 26 && (y === GROUND || (y === GROUND - 1 && x < 16))), camera: STEPCAM, closeups: STEPCLOSE });
S.push({ name: 'step-line-diag', kind: 'view', cell: stepCell(0, (x, y, z) => (y === GROUND ? x >= 16 : x < 16) && x - z === 0 && x >= 6 && x < 26), camera: STEPCAM, closeups: STEPCLOSE });

// ---- 3-D: walls, through-wall counting, ceilings, overhangs, sharp --------
const ground = flatGround(() => GRASS);
S.push({
  name: 'wall-stripes', kind: 'view',
  cell: (x, y, z) => {
    if (z === 16 && x >= 4 && x < 28 && y >= GROUND && y < GROUND + 10) {
      const u = x - 4, v = y - GROUND;
      const s1 = u - v === 3; // 1:1 stripe
      const s2 = v === Math.round((u - 11) / 2 + 0.25) && u >= 11; // 1:2 stripe
      const band = v === 8; // horizontal 1-high band
      return { v: s1 || s2 ? STONE : band ? PLANKS : BRICK, edited: true };
    }
    return ground(x, y, z);
  },
  camera: { eye: [16, GROUND + 6, 2], target: [16, GROUND + 5, 16] },
  closeups: [{ eye: [10.5, GROUND + 4, 11.5], target: [9.5, GROUND + 4.5, 16] }],
});
S.push({
  name: 'planks-wall-on-grass', kind: 'view',
  cell: (x, y, z) => (y >= GROUND && y < GROUND + 3 && x === 16 && z >= 6 && z < 26 ? { v: PLANKS, edited: true } : ground(x, y, z)),
  camera: { eye: [9, GROUND + 4, 26], target: [16, GROUND + 1, 15] },
  closeups: [{ eye: [13.2, GROUND + 1.6, 18.5], target: [16, GROUND + 0.6, 15.5] }],
});
// 1-thick brick wall; north side ground sand (x<16) / stone (x≥16), south side grass
const twGround = flatGround((x, z) => (z > 16 ? (x < 16 ? SAND : STONE) : GRASS));
S.push({
  name: 'through-wall', kind: 'view',
  plan: (x, z) => (z === 16 && x >= 4 && x < 28 ? BRICK : z > 16 ? (x < 16 ? SAND : STONE) : GRASS),
  cell: (x, y, z) => (z === 16 && x >= 4 && x < 28 && y >= GROUND && y < GROUND + 3 ? { v: BRICK, edited: true } : twGround(x, y, z)),
  camera: { eye: [16, GROUND + 5, 4], target: [16, GROUND + 1, 16] },
  closeups: [{ eye: [16, GROUND + 2.2, 12.5], target: [16, GROUND + 0.3, 16] }],
  win: [4, 4, 28, 16], // south side only: nothing but grass (and the wall) belongs here
});
// 1-thick planks wall with a 1-thick stone wall right behind it (2-thick wall, planks face south)
S.push({
  name: 'planks-on-stone-wall', kind: 'view',
  cell: (x, y, z) => {
    if (x >= 6 && x < 26 && y >= GROUND && y < GROUND + 4) {
      if (z === 16) return { v: PLANKS, edited: true };
      if (z === 17) return { v: STONE, edited: true };
    }
    return ground(x, y, z);
  },
  camera: { eye: [16, GROUND + 6, 5], target: [16, GROUND + 2, 16] },
  closeups: [{ eye: [9, GROUND + 5.5, 12], target: [7, GROUND + 3.5, 16] }],
});
// hut: 1-thick brick walls, planks floor inside, grass outside, a doorway on the south
const hutPlan = (x, z) => (x >= 12 && x < 19 && z >= 12 && z < 19 ? PLANKS : GRASS);
const hutGround = flatGround(hutPlan);
const hutWall = (x, z) => (x === 11 || x === 19 || z === 11 || z === 19) && x >= 11 && x <= 19 && z >= 11 && z <= 19 && !(z === 19 && x === 15);
S.push({
  name: 'hut', kind: 'view',
  plan: (x, z) => (hutWall(x, z) ? BRICK : hutPlan(x, z)),
  cell: (x, y, z) => (y >= GROUND && y < GROUND + 3 && hutWall(x, z) ? { v: BRICK, edited: true } : hutGround(x, y, z)),
  camera: { eye: [15.5, GROUND + 13, 26], target: [15.5, GROUND, 15] },
  closeups: [{ eye: [15.5, GROUND + 3.4, 17.6], target: [15.5, GROUND, 12] }],
  win: [12, 12, 19, 19],
});
// tunnel 2 high, 3 wide, dug under a 2-thick roof (grass over dirt) in flat generated ground (top y=12)
const TOP = 12;
const deep = flatGround(() => GRASS, TOP);
S.push({
  name: 'tunnel-roof2', kind: 'view',
  cell: (x, y, z) => (y >= 8 && y < 10 && z >= 14 && z < 17 && x >= 2 && x < 30 ? { v: AIR, edited: true } : deep(x, y, z)),
  camera: { eye: [2.6, 9.0, 15.5], target: [12, 9.6, 15.5] },
  closeups: [{ eye: [10, 8.6, 15.5], target: [16, 10, 15.5] }],
});
// 1-wide tunnel under a 2-thick roof
S.push({
  name: 'tunnel1-roof2', kind: 'view',
  cell: (x, y, z) => (y >= 8 && y < 10 && z === 15 && x >= 2 && x < 30 ? { v: AIR, edited: true } : deep(x, y, z)),
  camera: { eye: [2.6, 9.0, 15.5], target: [12, 9.5, 15.5] },
});
// overhang: a 2-thick slab (grass over dirt) jutting out of a stone cliff, seen from below
S.push({
  name: 'overhang', kind: 'view',
  cell: (x, y, z) => {
    if (x >= 20 && y >= GROUND && y < GROUND + 8) return { v: STONE, edited: true }; // cliff
    if (x >= 12 && x < 20 && z >= 10 && z < 22) {
      if (y === GROUND + 5) return { v: GRASS, edited: true };
      if (y === GROUND + 4) return { v: DIRT, edited: true };
    }
    return ground(x, y, z);
  },
  camera: { eye: [6, GROUND + 1.5, 16], target: [16, GROUND + 4.5, 16] },
});
// sharp blocks next to smooth ones
S.push({
  name: 'sharp-mix', kind: 'plan',
  plan: (x, z) => {
    if (x >= 5 && x < 27 && z === x) return BRICK | SHARP_BIT; // sharp 1:1 line
    if (x >= 5 && x < 27 && z === x + 3) return STONE; // smooth 1:1 line next to it
    if (x >= 20 && x < 26 && z >= 6 && z < 12) return (x === 22 && z === 8) ? PLANKS : BRICK | SHARP_BIT; // smooth planks dot inside sharp bricks
    if (x === 8 && z === 22) return STONE | SHARP_BIT; // lone sharp stone
    if (x === 12 && z === 24) return STONE; // lone smooth stone
    return GRASS;
  },
  camera: CAM, win: WIN,
});
S[S.length - 1].cell = flatGround(S[S.length - 1].plan);

export const ADV_SCENES = S;
export const sceneByName = (n) => S.find((s) => s.name === n);
