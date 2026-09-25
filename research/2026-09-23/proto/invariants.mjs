import { meshChunk, worldPos, watertight } from './sn.mjs';
function hash(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const G = [0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5];
let bad = 0, nonManifoldEdges = 0, quads = 0, cubeMismatch = 0, pinnedMove = 0;
for (let seed = 0; seed < 20; seed++) {
  const p = 0.2 + 0.03 * seed;
  // random blocks inside [-6,6)^3, air outside -> closed surface; ~10% sharp
  const W = (x, y, z) => (Math.max(Math.abs(x + .5), Math.abs(y + .5), Math.abs(z + .5)) < 6 && hash(x, y, z, seed) < p ? (hash(x, y, z, seed + 99) < 0.1 ? 2 : 1) : 0);
  const m = meshChunk(W, -8, -8, -8, 16, { k: 6, guard: G, apron: 9 });
  bad += watertight(m); quads += m.quads.length;
  // non-manifold edges: undirected edge used by >2 quads
  const cnt = new Map();
  for (const q of m.quads) for (let i = 0; i < 4; i++) { const a = q.v[i], b = q.v[(i + 1) % 4]; const k = a < b ? a + ',' + b : b + ',' + a; cnt.set(k, (cnt.get(k) || 0) + 1); }
  for (const n of cnt.values()) if (n > 2) nonManifoldEdges++;
  // sharp faces must be exact unit squares at integer corners
  for (const q of m.quads) if (q.sharp) for (const v of q.v) { const p = worldPos(m, v); if (p.some(c => c !== Math.round(c))) pinnedMove++; }
  // k=0 reproduces the culled cube mesh exactly: every vertex at its integer corner
  const m0 = meshChunk(W, -8, -8, -8, 16, { k: 0, apron: 2 });
  for (let v = 0; v < m0.V; v++) { const p = worldPos(m0, v); if (p.some(c => c !== Math.round(c))) cubeMismatch++; }
  // all-sharp world with k=6 also reproduces cubes
  const Ws = (x, y, z) => (W(x, y, z) ? 2 : 0);
  const ms = meshChunk(Ws, -8, -8, -8, 16, { k: 6, guard: G, apron: 9 });
  for (let v = 0; v < ms.V; v++) { const p = worldPos(ms, v); if (p.some(c => c !== Math.round(c))) cubeMismatch++; }
}
console.log({ quads, watertightViolations: bad, nonManifoldEdges, sharpFaceVerticesMoved: pinnedMove, cubeMismatch });
