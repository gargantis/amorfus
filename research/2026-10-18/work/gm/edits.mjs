// Edit scenarios on real generated terrain (seed 1,1), as world-cell edit
// maps "x,y,z" → value for buildGenMeshInputGM.
import { generateRegionGM } from './gen-gm.mjs';
const STONE = 3, PLANKS = 5, BRICK = 6, AIR = 0;

/** topmost solid y in world column (wx, wz) within [y0, y0+96) */
export function surfaceY(wx, wz, y0 = -32) {
  const g = generateRegionGM([1, 1], wx, y0, wz, 1, 96, 1);
  for (let y = 95; y >= 0; y--) if (g.blocks[y]) return y0 + y;
  return null;
}
const key = (x, y, z) => `${x},${y},${z}`;

export const SCENARIOS = {
  // a 1-wide diagonal stone line painted into the ground (material edit only)
  'paint-diag': (cx, cz) => {
    const e = new Map();
    for (let t = 6; t < 26; t++) { const x = cx * 32 + t, z = cz * 32 + t; const y = surfaceY(x, z); e.set(key(x, y, z), STONE); }
    return e;
  },
  // a 1:2 line of brick
  'paint-1:2': (cx, cz) => {
    const e = new Map();
    for (let t = 4; t < 28; t++) { const x = cx * 32 + t, z = cz * 32 + 6 + Math.round(t / 2); const y = surfaceY(x, z); e.set(key(x, y, z), BRICK); }
    return e;
  },
  // a 6×6 stone square painted into the ground
  'paint-square': (cx, cz) => {
    const e = new Map();
    for (let a = 13; a < 19; a++) for (let b = 13; b < 19; b++) { const x = cx * 32 + a, z = cz * 32 + b; const y = surfaceY(x, z); e.set(key(x, y, z), STONE); }
    return e;
  },
  // planks blocks placed on the ground (shape edits): a 3×1 bench and a lone block
  'place-planks': (cx, cz) => {
    const e = new Map();
    for (const [a, b] of [[12, 14], [13, 14], [14, 14], [20, 18]]) { const x = cx * 32 + a, z = cz * 32 + b; const y = surfaceY(x, z); e.set(key(x, y + 1, z), PLANKS); }
    return e;
  },
  // a 4×4 pit dug 5 deep (air edits) — exposes generated layers
  'dig-pit': (cx, cz) => {
    const e = new Map();
    for (let a = 14; a < 18; a++) for (let b = 14; b < 18; b++) { const x = cx * 32 + a, z = cz * 32 + b; const y = surfaceY(x, z); for (let d = 0; d < 5; d++) e.set(key(x, y - d, z), AIR); }
    return e;
  },
};
export function allEdits(cx, cz, names) {
  const e = new Map();
  for (const n of names) for (const [k, v] of SCENARIOS[n](cx, cz)) e.set(k, v);
  return e;
}
