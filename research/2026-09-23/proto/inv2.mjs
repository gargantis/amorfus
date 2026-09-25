import { meshChunk, worldPos, watertight } from './sn.mjs';
function hash(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const G = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
let wt = 0, off = 0, on = 0, full = 0, fullBad = 0;
for (let seed = 0; seed < 20; seed++) {
  const p = 0.2 + 0.03 * seed;
  const W = (x, y, z) => (Math.max(Math.abs(x + .5), Math.abs(y + .5), Math.abs(z + .5)) < 6 && hash(x, y, z, seed) < p ? (hash(x, y, z, seed + 99) < 0.3 ? 2 : 1) : 0);
  const m = meshChunk(W, -8, -8, -8, 16, { k: 6, guard: G, apron: 9, sharpMode: 'axis', edited: (x, y, z) => hash(x, y, z, seed + 7) < 0.5, hAir: null });
  wt += watertight(m);
  for (const q of m.quads) if (q.sharp) { const a = [0, 1, 2].find(i => q.air[i] !== q.solid[i]); const plane = Math.max(q.solid[a], q.air[a]);
    for (const v of q.v) worldPos(m, v)[a] === plane ? on++ : off++; }
}
console.log({ watertightViolations: wt, sharpFaceVertsOnPlane: on, offPlane: off });
