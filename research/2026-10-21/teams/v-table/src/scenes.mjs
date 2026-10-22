// v-table scenes. Terrain windows of seed [1,1] and builds come from team
// table's scene.mjs (imported read-only, so the windows are exactly theirs).
// New-seed windows are built here with the same recipe (windowScene logic
// copied from teams/table/src/scene.mjs: 9x8x9 window, 'world' clusters from
// a 12-block apron, clamped boundary, evaluation 2 blocks inside).
import { terrainScenes as tableTerrain, buildScenes as tableBuilds } from '../../table/src/scene.mjs';
import { generateRegion } from './repo.mjs';

export const W = [9, 8, 9];
const APRON = 12;

export function windowScene(name, get, origin, size, regionLo, regionHi, guard = 2) {
  const [ax, ay, az] = regionLo, [bx, by, bz] = regionHi;
  const NX = bx - ax, NY = by - ay, NZ = bz - az;
  const idx = (x, y, z) => ((y - ay) * NZ + (z - az)) * NX + (x - ax);
  const par = new Int32Array(NX * NY * NZ).map((_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let y = ay; y < by; y++) for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
    const m = get(x, y, z);
    if (!m) continue;
    if (x + 1 < bx && get(x + 1, y, z) === m) par[f(idx(x + 1, y, z))] = f(idx(x, y, z));
    if (y + 1 < by && get(x, y + 1, z) === m) par[f(idx(x, y + 1, z))] = f(idx(x, y, z));
    if (z + 1 < bz && get(x, y, z + 1) === m) par[f(idx(x, y, z + 1))] = f(idx(x, y, z));
  }
  const blocks = [];
  for (let y = origin[1]; y < origin[1] + size[1]; y++) for (let z = origin[2]; z < origin[2] + size[2]; z++) for (let x = origin[0]; x < origin[0] + size[0]; x++) {
    const m = get(x, y, z);
    if (m) blocks.push([x, y, z, m]);
  }
  const group = (b) => f(idx(b[0], b[1], b[2]));
  const bbox = [origin[0], origin[1], origin[2], origin[0] + size[0] - 1, origin[1] + size[1] - 1, origin[2] + size[2] - 1];
  const evalLo = origin.map((o) => o + guard), evalHi = origin.map((o, t) => o + size[t] - guard);
  return { name, blocks, group, get, bbox, evalLo, evalHi, clamp: true, origin, size };
}

/** Terrain windows for any seed: per chunk, one window centred on a random
 *  surface corner ('a') and one on a random seam corner ('s'). */
export function seedScenes(seed, chunks, tag, size = W, guard = 2, rngSeed = 777) {
  const out = [];
  let st = rngSeed >>> 0;
  const rnd = (k) => { st = (Math.imul(st, 1103515245) + 12345) >>> 0; return Math.floor((st / 4294967296) * k); };
  const make = (name, C) => {
    const O = [C[0] - Math.floor(size[0] / 2), C[1] - Math.floor(size[1] / 2), C[2] - Math.floor(size[2] / 2)];
    const lo = O.map((v) => v - APRON), sz = size.map((v) => v + 2 * APRON);
    const R = generateRegion(seed, lo[0], lo[1], lo[2], sz[0], sz[1], sz[2]);
    const get = (x, y, z) => {
      const i = x - lo[0], j = y - lo[1], k = z - lo[2];
      if (i < 0 || j < 0 || k < 0 || i >= R.nx || j >= R.ny || k >= R.nz) return 0;
      return R.blocks[(j * R.nz + k) * R.nx + i] & 0xff;
    };
    const hint = (x, y, z) => {
      const i = x - lo[0], j = y - lo[1], k = z - lo[2];
      if (i < 0 || j < 0 || k < 0 || i >= R.nx || j >= R.ny || k >= R.nz) return -127;
      return R.hints[(j * R.nz + k) * R.nx + i];
    };
    const sc = windowScene(name, get, O, size, lo, lo.map((v, t) => v + sz[t]), guard);
    sc.hint = hint;
    out.push(sc);
  };
  chunks.forEach((c, ci) => {
    const r = generateRegion(seed, c[0] * 32 - 1, c[1] * 32 - 1, c[2] * 32 - 1, 33, 33, 33);
    const get = (x, y, z) => r.blocks[((y + 1) * 33 + (z + 1)) * 33 + (x + 1)] & 0xff;
    const surf = [], seam = [];
    for (let y = 0; y < 32; y++) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
      let air = false; const ms = new Set();
      for (let b = 0; b < 8; b++) { const v = get(x - 1 + (b & 1), y - 1 + ((b >> 2) & 1), z - 1 + ((b >> 1) & 1)); if (v) ms.add(v); else air = true; }
      if (!air || !ms.size) continue;
      const w = [c[0] * 32 + x, c[1] * 32 + y, c[2] * 32 + z];
      surf.push(w); if (ms.size >= 2) seam.push(w);
    }
    if (!surf.length) return;
    make(`${tag}${ci}a`, surf[rnd(surf.length)]);
    if (seam.length) make(`${tag}${ci}s`, seam[rnd(seam.length)]);
  });
  return out;
}

// chunks for seed [7,13]: 4 near the surface band, 2 lower (caves likely)
export const S7_CHUNKS = [[5, 1, -7], [-11, 1, 3], [14, 0, 9], [-3, 1, -15], [8, 0, 2], [-6, -1, 6], [2, 0, -2], [-9, 1, -4]];

// seed [7,13] second pick (the first mostly missed the surface): 10 chunks at
// the surface height of their centre column, 4 two chunks lower (caves)
export const S7B_CHUNKS = [[-57, -1, 19], [4, -1, 27], [-60, 0, 33], [-17, -1, -31], [-60, 1, 11], [50, 1, -31], [-19, 0, -30], [-24, 0, -50], [23, 0, 54], [-31, 1, -12], [16, -2, -14], [59, -2, 52], [-27, -1, 48], [50, -3, 50]];

export function sceneSet(set) {
  if (set === 't8') return seedScenes([7, 13], S7B_CHUNKS, 'v', W, 2, 31337);
  if (set === 't1') return tableTerrain();
  if (set === 'b') return tableBuilds();
  if (set === 't7') return seedScenes([7, 13], S7_CHUNKS, 'u');
  if (set === 'n7') return seedScenes([7, 13], S7_CHUNKS, 'm', [6, 5, 5], 1, 999); // small windows for the n study
  if (set === 'n1') return seedScenes([1, 1], [[-1, 1, 1], [-2, 1, 0], [0, 0, 0], [1, 1, 1], [-1, 0, -1], [0, 1, 2]], 'k', [6, 5, 5], 1, 4242);
  throw new Error('set ' + set);
}
