// Union of two adjacent chunks: count open edges (1 incident triangle) near
// the shared plane — a crack or T-junction shows up as open edges there.
import * as core from '../../harness/core.mjs';
import { BASE } from '../../harness/scenes.mjs';
const AIR = 0, STONE = 3, GRASS = 1, DIRT = 2;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
const ground = (x, y, z) => { const d = BASE - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: BASE - 1 - y === 0 ? GRASS : DIRT, rho: clampRho(d) }; };
const C = [32.3, BASE, 15.7];
const world = (x, y, z) => (y >= BASE && Math.hypot(x + 0.5 - C[0], y + 0.5 - C[1], z + 0.5 - C[2]) < 6.4 ? { v: STONE, edited: true } : ground(x, y, z));
for (const n of process.argv.slice(2)) {
  const M = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  const ap = M.apron ?? 10;
  const parts = [[M.mesh(core.buildRegion(world, ap), null, core), 0], [M.mesh(core.buildRegion((x, y, z) => world(x + 32, y, z), ap), null, core), 32]];
  const edges = new Map();
  const k = (m, v, off) => `${Math.round((m.pos[v * 3] + off) * 256)},${Math.round(m.pos[v * 3 + 1] * 256)},${Math.round(m.pos[v * 3 + 2] * 256)}`;
  for (const [m, off] of parts) {
    for (let t = 0; t < m.T; t++) for (let e = 0; e < 3; e++) {
      const a = k(m, m.tri[t * 3 + e], off), b = k(m, m.tri[t * 3 + ((e + 1) % 3)], off);
      if (a === b) continue;
      const key = a < b ? a + '|' + b : b + '|' + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let open = 0, openNear = 0;
  for (const [key, cnt] of edges) {
    if (cnt % 2 === 0) continue;
    open++;
    const xs = key.split('|').map((s) => Number(s.split(',')[0]) / 256);
    const zs = key.split('|').map((s) => Number(s.split(',')[2]) / 256);
    // ignore the outer region limits (x near 0 or 64, z near 0 or 32)
    if (xs.some((x) => Math.abs(x - 32) < 0.75) && zs.every((z) => z > 0.75 && z < 31.25)) openNear++;
  }
  console.log(`${n}: ${edges.size} edges, odd-count edges ${open}, of which at the x=32 seam ${openNear}`);
}
