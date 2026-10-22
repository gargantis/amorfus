// v-local: configurations NOT in the shared catalogue (attack b, c).
import { generateRegion } from '../../table/gen.mjs';
import { box, A, B, STONE, GRASS, DIRT } from './common.mjs';

const holes = (set) => (x, y, z) => set.some(([a, c]) => a === x && c === z);

export function terrainWindow(chunk, W = [7, 6, 7], pick = 0) {
  // scan the chunk for windows with many surface corners and >= 2 materials;
  // return the pick-th best (deterministic); blocks shifted to start at 0
  const [cx, cy, cz] = chunk;
  const r = generateRegion([1, 1], cx * 32, cy * 32, cz * 32, 32, 32, 32);
  const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= 32 || y >= 32 || z >= 32 ? 0 : r.blocks[(y * 32 + z) * 32 + x] & 0xff);
  const cands = [];
  for (let y0 = 0; y0 + W[1] <= 32; y0 += 2) for (let z0 = 0; z0 + W[2] <= 32; z0 += 5) for (let x0 = 0; x0 + W[0] <= 32; x0 += 5) {
    let solid = 0; const mats = new Set();
    for (let y = y0; y < y0 + W[1]; y++) for (let z = z0; z < z0 + W[2]; z++) for (let x = x0; x < x0 + W[0]; x++) { const m = get(x, y, z); if (m) { solid++; mats.add(m); } }
    const frac = solid / (W[0] * W[1] * W[2]);
    if (frac < 0.3 || frac > 0.75 || mats.size < 2) continue;
    cands.push({ x0, y0, z0, score: -Math.abs(frac - 0.5) + 0.1 * mats.size });
  }
  cands.sort((a, b) => b.score - a.score || a.x0 - b.x0 || a.y0 - b.y0 || a.z0 - b.z0);
  const c = cands[pick];
  const blocks = [];
  for (let y = 0; y < W[1]; y++) for (let z = 0; z < W[2]; z++) for (let x = 0; x < W[0]; x++) { const m = get(c.x0 + x, c.y0 + y, c.z0 + z); if (m) blocks.push([x, y, z, m]); }
  return { blocks, origin: [cx * 32 + c.x0, cy * 32 + c.y0, cz * 32 + c.z0] };
}

export function newConfigs() {
  const L = [];
  L.push({ name: 'wall8x4x1', n: 16, blocks: box(0, 0, 0, 8, 4, 1, A) });
  L.push({ name: 'wall8x4x1-AB', n: 16, blocks: box(0, 0, 0, 8, 4, 1, A).map(([x, y, z]) => [x, y, z, x < 4 ? A : B]) });
  L.push({ name: 'overhang', n: 12, blocks: [...box(0, 0, 0, 5, 1, 3, STONE), ...box(0, 1, 0, 1, 4, 3, STONE), ...box(0, 4, 0, 5, 5, 3, STONE)] });
  L.push({ name: 'floor8x1x8-holes', n: 12, blocks: box(0, 0, 0, 8, 1, 8, STONE, holes([[2, 2], [5, 2], [2, 5], [5, 5]])) });
  L.push({ name: 'bar1x1x12', n: 16, blocks: box(0, 0, 0, 1, 1, 12, A) });
  L.push({ name: 'slab8x3x6-groove', n: 12, blocks: box(0, 0, 0, 8, 3, 6, STONE, (x, y) => x === 3 && y === 2) });
  L.push({ name: 'grass-terrace', n: 12, blocks: [...box(0, 0, 0, 8, 2, 8, DIRT), ...box(4, 2, 0, 8, 3, 8, DIRT), ...box(0, 2, 0, 4, 3, 8, GRASS), ...box(4, 3, 0, 8, 4, 8, GRASS)] });
  const t1 = terrainWindow([-2, 1, 1], [7, 6, 7], 0), t2 = terrainWindow([0, 0, 0], [7, 6, 7], 0);
  L.push({ name: 'terrain-a', n: 12, blocks: t1.blocks, origin: t1.origin });
  L.push({ name: 'terrain-b', n: 12, blocks: t2.blocks, origin: t2.origin });
  return L;
}

// adversarial thin mixed-material sets for the local lambda (n27 counts
// diagonal same-material neighbours that are not in the block's cluster)
export function newConfigs2() {
  const L = [];
  L.push({ name: 'wall-stripes-AB', n: 16, blocks: box(0, 0, 0, 8, 4, 1, A).map(([x, y, z]) => [x, y, z, x % 2 ? B : A]) });
  L.push({ name: 'floor-checker-AB', n: 12, blocks: box(0, 0, 0, 6, 1, 6, A).map(([x, y, z]) => [x, y, z, (x + z) % 2 ? B : A]) });
  L.push({ name: 'bar-alt-AB', n: 16, blocks: box(0, 0, 0, 1, 1, 10, A).map(([x, y, z]) => [x, y, z, z % 2 ? B : A]) });
  L.push({ name: 'checker3d-4', n: 12, blocks: box(0, 0, 0, 4, 4, 4, A).map(([x, y, z]) => [x, y, z, (x + y + z) % 2 ? B : A]) });
  L.push({ name: 'diag-staircase-A', n: 12, blocks: [0, 1, 2, 3, 4, 5].map((i) => [i, i, 0, A]).concat([0, 1, 2, 3, 4, 5].map((i) => [i, i, 1, A])) });
  L.push({ name: 'lattice-frame', n: 12, blocks: box(0, 0, 0, 5, 5, 5, STONE, (x, y, z) => [x % 4, y % 4, z % 4].filter((v) => v !== 0).length > 1) });
  return L;
}
