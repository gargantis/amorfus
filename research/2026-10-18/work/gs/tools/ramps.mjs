// Built ramps 1:n for n = 1..10 (same construction as scenes.mjs rampScene):
// shading-normal rms/max in the same window.
//   node work/gs/tools/ramps.mjs '<label>' '<json>' [...]
import * as core from '../../../harness/core.mjs';
import { geometryMetrics } from '../../../harness/metrics.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, BASE = 6;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
const ground = (x, y, z) => { const d = BASE - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; const depth = BASE - 1 - y; return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) }; };
function ramp(n) {
  const L = Math.min(24, 12 * n);
  const h = (x) => BASE + Math.min(L, Math.max(0, x - 4)) / n;
  const t = Math.atan(1 / n);
  return {
    cell: (x, y, z) => (y >= BASE && x >= 4 && z >= 4 && z < 28 && y + 0.5 < h(x + 0.5) ? { v: STONE, edited: true } : ground(x, y, z)),
    ideal: { sdf: (p) => (p[1] - h(p[0])) * Math.cos(t), normal: () => [-Math.sin(t), Math.cos(t), 0], inWindow: (p) => p[0] > 6.5 && p[0] < 4 + L - 2.5 && p[2] > 8 && p[2] < 24 && p[1] > BASE + 0.4 },
  };
}
const args = process.argv.slice(2);
const ns = [1, 2, 3, 4, 5, 6, 8, 10];
console.log('variant'.padEnd(10) + ns.map((n) => `1:${n}`.padEnd(12)).join(''));
for (let i = 0; i < args.length; i += 2) {
  const params = JSON.parse(args[i + 1]);
  const row = ns.map((n) => {
    const s = ramp(n);
    const g = geometryMetrics(core.decodeMesh(meshRegion({ ...core.buildRegion(s.cell, 10), params })), s);
    return `${g.shadingNormal.rms.toFixed(1)}/${g.shadingNormal.max.toFixed(1)}`.padEnd(12);
  });
  console.log(args[i].padEnd(10) + row.join(''));
}
