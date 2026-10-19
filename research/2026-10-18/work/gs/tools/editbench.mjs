// Cost on EDITED chunks (bench.mjs has no edits, so it cannot see this
// approach). Warm, interleaved, min and median of N runs per variant.
//   node work/gs/tools/editbench.mjs '<label>' '<json>' [...]
import { meshRegion } from '../mesher-gs.mjs';
import { meshRegion as libMesh } from '../../../lib/mesher.mjs';
import * as core from '../../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../../harness/scenes.mjs';
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
const hash = (x, z) => { let h = Math.imul(x * 374761393 + z * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 8) / 16777216; };
const ground = (x, y, z) => { const top = 6.3 + 0.15 * Math.sin(x * 0.21) * Math.cos(z * 0.17); const d = top - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
// dense build: a built heightfield 1–8 high over the whole region (smoothed random), all edited
const hf = (x, z) => { let s = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) s += hash((x >> 2) + a, (z >> 2) + b); return Math.floor(s * 8 / 9); };
const dense = (x, y, z) => (y >= 6 && y < 6 + hf(x, z) ? { v: STONE, edited: true } : ground(x, y, z));
const scenes = [
  ['dense build (whole chunk edited surface)', dense],
  ['ramp-1:4', GEOMETRY_SCENES.find((s) => s.name === 'ramp-1:4').cell],
  ['mound-r6.4', GEOMETRY_SCENES.find((s) => s.name === 'mound-r6.4').cell],
];
const args = process.argv.slice(2);
const sets = [];
for (let i = 0; i < args.length; i += 2) sets.push([args[i], JSON.parse(args[i + 1])]);
const N = Number(process.env.N ?? 7);
for (const [label, cell] of scenes) {
  const region = core.buildRegion(cell, 10);
  const times = sets.map(() => []);
  let Rn = sets.map(() => 0);
  for (let it = 0; it < N + 2; it++) {
    for (let k = 0; k < sets.length; k++) {
      const t0 = performance.now();
      const m = meshRegion({ ...region, params: sets[k][1] });
      const t = performance.now() - t0;
      if (it >= 2) times[k].push(t);
      Rn[k] = m.stats?.R ?? 0;
    }
  }
  const lib = [];
  for (let it = 0; it < N; it++) { const t0 = performance.now(); libMesh({ ...region, params: {} }); lib.push(performance.now() - t0); }
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  console.log(`${label}: ` + sets.map(([l], k) => `${l} min ${Math.min(...times[k]).toFixed(1)} / med ${med(times[k]).toFixed(1)} ms (R ${Rn[k]})`).join(' | ') + ` | lib(hints) min ${Math.min(...lib).toFixed(1)} ms`);
}
