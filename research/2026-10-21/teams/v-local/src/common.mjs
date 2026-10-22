// v-local helpers: build fast's one-step models and vertex rule on arbitrary
// block lists (read-only use of teams/fast/src), sample fields, scenes.
import { readFileSync } from 'node:fs';
import { buildModel, fracVolumes } from '../../fast/src/model.mjs';
import { MODELS } from '../../fast/src/models.mjs';
import { makeRule, bubbleVertices } from '../../fast/src/vrule.mjs';
import { sampleGrid } from '../../../lib/mbo.mjs';

export const L20 = JSON.parse(readFileSync(new URL('../../fast/res/fitlam-g20.json', import.meta.url), 'utf8')).best;
export { MODELS, buildModel, fracVolumes, makeRule, bubbleVertices, sampleGrid };

export function model(blocks, id, n = 12, extra = {}) {
  const spec = MODELS[id];
  if (!spec) throw new Error(`no model ${id}`);
  return buildModel(blocks, { n, margin: extra.margin ?? 1.0 }, { ...spec, ...extra });
}

export const Dat = (m, x, y, z) => sampleGrid(m, m.D, x, y, z);

/** Euclidean distance from a point to the nearest block (unit cube) of a list. */
export function distToBlocks(p, blocks) {
  let best = Infinity;
  for (const b of blocks) {
    const dx = Math.max(b[0] - p[0], 0, p[0] - (b[0] + 1));
    const dy = Math.max(b[1] - p[1], 0, p[1] - (b[1] + 1));
    const dz = Math.max(b[2] - p[2], 0, p[2] - (b[2] + 1));
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}

/** Region (index y*SY + z*SZ + x, SZ = NR, SY = NR*NR) with blocks shifted by OFF. */
export function regionOf(blocks, NR = 38, OFF = 12) {
  const reg = new Uint16Array(NR * NR * NR);
  for (const [x, y, z, m] of blocks) {
    const X = x + OFF, Y = y + OFF, Z = z + OFF;
    if (X < 0 || Y < 0 || Z < 0 || X >= NR || Y >= NR || Z >= NR) throw new Error(`block ${x},${y},${z} outside region`);
    reg[Y * NR * NR + Z * NR + X] = m;
  }
  return reg;
}

/** Vertex offsets of every mixed corner, keyed by WORLD corner 'x,y,z'. */
export function vertexMap(blocks, rule, { NR = 38, AP = 3, OFF = 12 } = {}) {
  const reg = regionOf(blocks, NR, OFF);
  const r = bubbleVertices(reg, NR, NR, NR, AP, rule, NR - 2 * AP);
  const m = new Map();
  for (let v = 0; v < r.count; v++) {
    const w = [r.corner[v * 3] - OFF, r.corner[v * 3 + 1] - OFF, r.corner[v * 3 + 2] - OFF];
    m.set(w.join(','), [r.off[v * 3], r.off[v * 3 + 1], r.off[v * 3 + 2]]);
  }
  return m;
}

export const rules = {
  'bub-b1-newton4': () => makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 } }),
  'bub-b1-newton16': () => makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, iters: 16 }),
  'bub-b1-line': () => makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, solver: 'line' }),
  'bub-b1-line40': () => makeRule({ kernel: 'b1', sigma: 0.2, lambda: { local: L20 }, solver: 'line', bisect: 40 }),
};

export const r4 = (v) => (v == null ? v : +v.toFixed(4));

// ---- scenes ----
export const A = 6, B = 7, STONE = 3, GRASS = 1, DIRT = 2;
export function box(x0, y0, z0, x1, y1, z1, m, skip = () => false) {
  const out = [];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) if (!skip(x, y, z)) out.push([x, y, z, m]);
  return out;
}
// look's WIDE host: 6x4x3 stone, 1x2 tunnel at x = 1, y = 1..2, along z
export const wideHost = () => box(0, 0, 0, 6, 4, 3, STONE, (x, y) => x === 1 && (y === 1 || y === 2));
export const bar = (x0, m = STONE) => [0, 1, 2, 3].map((i) => [x0 + i, 0, 0, m]);
