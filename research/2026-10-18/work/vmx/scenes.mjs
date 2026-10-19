// vmx adversarial scenes for mx-codes (player-made content first), in the
// harness scene format { name, kind, cell(x,y,z) → {v, rho?, edited?},
// camera, closeups?, plan?, win? }. Scene coords = chunk-local of [0,32)³.
// findScene(name) also finds the harness scenes and vmf's adversarial scenes.
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS, BRICK, SHARP_BIT } from '../../harness/core.mjs';
import { clampRho, ALL_SCENES } from '../../harness/scenes.mjs';
import { ADV_SCENES, flatGround, GROUND } from '../vmf/adv-scenes.mjs';
export { flatGround, GROUND };

const S = [];
const E = (v) => ({ v, edited: true });
const ground = flatGround(() => GRASS);
const CAM = { eye: [16, GROUND + 17, 16 + 21], target: [16, GROUND, 15] };
const WIN = [4, 4, 28, 28];
const flat = (name, plan, extra = {}) => S.push({ name, kind: 'plan', plan, cell: flatGround(plan), camera: CAM, win: WIN, ...extra });

// ---------------------------------------------------------------- (1) projection switch
// generated steep mound (slopes up to ~68°), painted: the 63° y/x switch runs round it
const moundH = (x, z) => 8 + 14 * Math.exp(-((x - 16) ** 2 + (z - 16) ** 2) / (2 * 3.6 ** 2));
const moundCell = (plan) => (x, y, z) => {
  const d = moundH(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  return { v: depth <= 1 ? plan(x, y, z) : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
const MCAM = { eye: [30, 26, 34], target: [16, 14, 16] };
S.push({ name: 'mound-line', kind: 'view', cell: moundCell((x, y, z) => (z === x + 2 ? STONE : GRASS)), camera: MCAM,
  closeups: [{ eye: [24, 20, 27], target: [17, 15, 18] }] });
S.push({ name: 'mound-ring', kind: 'view', cell: moundCell((x, y, z) => { const r = Math.hypot(x + 0.5 - 16, z + 0.5 - 16); return r >= 3.6 && r < 4.6 ? STONE : GRASS; }), camera: MCAM,
  closeups: [{ eye: [24, 20, 27], target: [17, 15, 18] }] });
// player-PAINTED steep mound: the same mound, every exposed block painted by
// a 3-D rule (a horizontal stone band at y 14–15, a 1:1 diagonal stripe) — what
// a player painting a cliff face block by block gets
S.push({ name: 'mound-band', kind: 'view', cell: moundCell((x, y, z) => (y === 14 || y === 15 ? STONE : (x - y) % 5 === 0 ? SAND : GRASS)), camera: MCAM,
  closeups: [{ eye: [24, 20, 27], target: [17, 15, 18] }] });

// built round tower (edited), radius 5.5, brick with a planks band and a stone spiral
const towerCell = (x, y, z) => {
  const r = Math.hypot(x + 0.5 - 16, z + 0.5 - 16);
  if (r < 5.5 && y >= GROUND && y < GROUND + 12) {
    const ang = Math.atan2(z + 0.5 - 16, x + 0.5 - 16);
    const turn = ((ang / (2 * Math.PI)) * 12 + 12) % 12; // 0..12 per turn
    if (y === GROUND + 7) return E(PLANKS);
    if (Math.abs(((y - GROUND - turn) % 12 + 12) % 12) < 1) return E(STONE);
    return E(BRICK);
  }
  return ground(x, y, z);
};
S.push({ name: 'tower-paint', kind: 'view', cell: towerCell, camera: { eye: [33, GROUND + 9, 31], target: [16, GROUND + 5, 16] },
  closeups: [{ eye: [27, GROUND + 7.5, 25], target: [19, GROUND + 6.5, 19] }] });
// built 3-thick wall with a stone base course, planks band, 1:1 stone stripe, sand coping
S.push({ name: 'wall-courses', kind: 'view',
  cell: (x, y, z) => {
    if (z >= 15 && z < 18 && x >= 4 && x < 28 && y >= GROUND && y < GROUND + 8) {
      const u = x - 4, v = y - GROUND;
      if (v === 0) return E(STONE);
      if (v === 7) return E(SAND);
      if (u - v === 4 || u + v === 18) return E(STONE);
      if (v === 4) return E(PLANKS);
      return E(BRICK);
    }
    return ground(x, y, z);
  },
  camera: { eye: [16, GROUND + 7, 3], target: [16, GROUND + 4, 16] },
  closeups: [{ eye: [11, GROUND + 9.5, 9], target: [12, GROUND + 6.5, 15.5] }, { eye: [20, GROUND + 2.5, 10], target: [19, GROUND + 0.5, 15] }] });

// ---------------------------------------------------------------- (2) column search
// planks bridge (1 thick, y = G+3) with brick rails over grass with a stone path below
S.push({ name: 'bridge', kind: 'view',
  cell: (x, y, z) => {
    if (x >= 6 && x < 26 && z >= 14 && z < 18) {
      if (y === GROUND + 3) return E(PLANKS);
      if (y === GROUND + 4 && (z === 14 || z === 17)) return E(BRICK);
    }
    if (x >= 6 && x < 26 && (z === 14 || z === 17) && y >= GROUND && y < GROUND + 3 && (x === 6 || x === 25)) return E(BRICK); // piers
    return flatGround((xx, zz) => (zz === 15 || zz === 16 ? STONE : GRASS))(x, y, z);
  },
  camera: { eye: [16, GROUND + 1.2, 6], target: [16, GROUND + 2.6, 16] },
  closeups: [{ eye: [10, GROUND + 7, 9], target: [14, GROUND + 3, 15.5] }] });
// house with brick walls and a planks roof overhanging by 1 (eaves), grass outside, stone path round it
const houseCell = (x, y, z) => {
  const inX = x >= 10 && x <= 21, inZ = z >= 10 && z <= 21;
  if (y === GROUND + 4 && x >= 9 && x <= 22 && z >= 9 && z <= 22) return E(PLANKS); // roof + eaves
  if (y >= GROUND && y < GROUND + 4 && inX && inZ && (x === 10 || x === 21 || z === 10 || z === 21) && !(z === 21 && x === 15 && y < GROUND + 2)) return E(BRICK);
  return flatGround((xx, zz) => (xx >= 9 && xx <= 22 && zz >= 9 && zz <= 22 && !(xx >= 11 && xx <= 20 && zz >= 11 && zz <= 20) ? STONE : xx >= 11 && xx <= 20 && zz >= 11 && zz <= 20 ? PLANKS : GRASS))(x, y, z);
};
S.push({ name: 'house-eaves', kind: 'view', cell: houseCell, camera: { eye: [28, GROUND + 3, 29], target: [16, GROUND + 3, 16] },
  closeups: [{ eye: [24, GROUND + 1.6, 25], target: [21, GROUND + 3.6, 21] }, { eye: [26, GROUND + 9, 27], target: [20, GROUND + 4.5, 20] }] });
// stone stairs climbing to 1 below a brick roof (as in gh's town)
S.push({ name: 'stairs-roof', kind: 'view',
  cell: (x, y, z) => {
    if (x >= 8 && x < 14 && z >= 10 && z < 16 && y >= GROUND && y <= GROUND + 4) {
      const wall = x === 8 || x === 13 || z === 10 || z === 15;
      if (wall || y === GROUND + 4) return E(BRICK);
      return { v: AIR, edited: true };
    }
    if (x === 14 && z >= 10 && z < 16 && y >= GROUND) { const k = 15 - z; if (y <= GROUND + Math.floor(k / 1.5)) return E(STONE); }
    return flatGround(() => STONE)(x, y, z);
  },
  camera: { eye: [22, GROUND + 9, 22], target: [12, GROUND + 3, 13] },
  closeups: [{ eye: [18, GROUND + 7, 15], target: [13.5, GROUND + 4.5, 12] }] });
// pillars on a planks floor, grass around
S.push({ name: 'pillars', kind: 'view',
  cell: (x, y, z) => {
    if (y >= GROUND && y < GROUND + 3 && x % 3 === 1 && z % 3 === 1 && x > 6 && x < 26 && z > 6 && z < 26) return E(BRICK);
    return flatGround((xx, zz) => (xx > 5 && xx < 27 && zz > 5 && zz < 27 ? PLANKS : GRASS))(x, y, z);
  },
  camera: { eye: [16, GROUND + 8, 30], target: [16, GROUND, 16] },
  closeups: [{ eye: [15, GROUND + 2.2, 21], target: [13, GROUND + 0.5, 16] }] });

// ---------------------------------------------------------------- (4) heuristics (plan)
const box = (x, z, x0 = 8, z0 = 8, x1 = 24, z1 = 24) => x >= x0 && x < x1 && z >= z0 && z < z1;
flat('checker2', (x, z) => (box(x, z) && ((x >> 1) + (z >> 1)) % 2 === 0 ? STONE : GRASS));
flat('stripes-2w-diag', (x, z) => (box(x, z) && (((x - z) % 4) + 4) % 4 < 2 ? STONE : GRASS));
flat('stripes-2w-h', (x, z) => (box(x, z) && (z % 4) < 2 ? STONE : GRASS));
flat('dots-dashes', (x, z) => {
  if (z === 7 && x >= 5 && x < 27) return x % 2 === 0 ? STONE : GRASS; // dotted row
  if (z === 11 && x >= 5 && x < 27) return x % 3 !== 2 ? STONE : GRASS; // dashes 2 on 1 off
  if (z === 15 && x >= 5 && x < 27) return x % 4 !== 3 ? STONE : GRASS; // dashes 3 on 1 off
  if (x >= 5 && x < 27 && z === Math.floor((x - 5) / 2) + 18 && x % 2 === 0) return STONE; // dotted 1:2 (lone blocks)
  if (x >= 5 && x < 27 && z === Math.floor((x - 5) / 2) + 22 && (x % 4) < 2) return STONE; // dashed 1:2
  return GRASS;
});
const FONT5 = { // 5×7 glyphs with 1-block strokes
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
};
const text5 = (rows, fg, bg) => (x, z) => {
  for (const [s, x0, z0] of rows) {
    const r = z - z0; if (r < 0 || r >= 7) continue;
    const c = x - x0; if (c < 0 || c >= s.length * 6) continue;
    const g = FONT5[s[Math.floor(c / 6)]], col = c % 6;
    if (col < 5 && g[r][col] === '1') return fg;
  }
  return bg;
};
flat('text5', text5([['AMORF', 2, 3], ['SKWX3', 2, 12]], STONE, GRASS), { win: [1, 2, 31, 21] });
// 2-wide strokes (a bigger font made by doubling the 5×7 glyphs)
flat('text5x2', (x, z) => text5([['AM', 2, 2]], STONE, GRASS)(Math.floor(x / 2), Math.floor(z / 2)), { win: [2, 2, 30, 20] });
flat('shapes', (x, z) => {
  const cells = [[6, 6], [10, 6], [11, 6], [15, 6], [16, 6], [15, 7], [20, 6], [21, 6], [20, 7], [21, 7], // lone, domino, L-tromino, 2x2
    [6, 12], [5, 13], [6, 13], [7, 13], [6, 14], // plus
    [11, 12], [12, 12], [13, 12], [11, 13], [13, 13], [11, 14], [12, 14], [13, 14], // ring 3x3
    [17, 12], [18, 13], [19, 14], [20, 15], // 4-long diagonal
    [24, 11], [24, 12], [24, 13], [24, 14], [24, 15], // 5-long bar
  ];
  return cells.some(([a, b]) => a === x && b === z) ? STONE : GRASS;
}, { win: [3, 3, 28, 18] });
// circular 1-wide path (ring), radius 7
flat('ring7', (x, z) => { const r = Math.hypot(x + 0.5 - 16, z + 0.5 - 16); return r >= 6.5 && r < 7.5 ? STONE : GRASS; });
// 1-wide wavy path (sine), and its 2-wide twin
flat('wave1', (x, z) => (x >= 3 && x < 29 && z === Math.round(14 + 4 * Math.sin((x + 0.5) / 3.2)) ? STONE : GRASS));
// 1-wide rectangle frame and an L-shaped path with 1-wide arms
flat('frame', (x, z) => ((x === 8 || x === 23) && z >= 8 && z < 24) || ((z === 8 || z === 23) && x >= 8 && x < 24) ? STONE : GRASS);

export const VMX_SCENES = S;
const ALL = [...S, ...ADV_SCENES, ...ALL_SCENES];
export const findScene = (n) => ALL.find((s) => s.name === n);
export const allScenes = () => ALL;
