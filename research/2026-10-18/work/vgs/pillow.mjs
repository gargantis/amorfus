// Top-surface height of placed 1-high square floors (on binary and natural ground):
// max height above the block top (9.0) and height at the centre; also a 2-high
// floor (2 layers) and a 1-high 3-wide road, along the centre line z = mid.
import { meshWorld, slice } from './viz.mjs';
import { binary, natural, placed, PLANKS } from './phys.mjs';
const out = [];
for (const [gname, g] of [['binary', (y) => binary(y)], ['natural φ0.2', (y) => natural(y, 8.2)]]) {
  for (const n of [2, 3, 4, 6, 8, 12, 16]) {
    const x0 = 16 - (n >> 1), z0 = 16 - (n >> 1);
    const fn = (x, y, z) => (y === 8 && x >= x0 && x < x0 + n && z >= z0 && z < z0 + n ? placed(PLANKS) : g(y));
    const row = [];
    for (const v of ['hints', 'gs-ctx', 'gs-mls']) {
      const segs = slice(meshWorld(fn, v), 2, z0 + n / 2 + 0.01);
      // top surface over the floor interior: highest y of segments with x inside [x0, x0+n]
      let maxY = -Infinity, cY = -Infinity;
      for (const s of segs) {
        for (const [u, y] of [[s[0], s[1]], [s[2], s[3]]]) {
          if (u >= x0 && u <= x0 + n && y > maxY) maxY = y;
        }
        const lo = Math.min(s[0], s[2]), hi = Math.max(s[0], s[2]);
        const c = x0 + n / 2;
        if (lo <= c && hi >= c) { const f = (c - s[0]) / ((s[2] - s[0]) || 1); const y = s[1] + (s[3] - s[1]) * f; if (y > cY) cY = y; }
      }
      row.push(`${v} max ${(maxY - 9).toFixed(3)} ctr ${(cY - 9).toFixed(3)}`);
    }
    console.log(`${gname.padEnd(12)} ${String(n).padStart(2)}×${String(n).padEnd(2)} floor: ${row.join(' | ')}`);
  }
}
