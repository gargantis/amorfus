// A/B: round-1 gh mesher bundle vs the narrow-bits bundle vs repo, interleaved min-of-N
import * as core from '../../harness/core.mjs';
import { meshRegion as r1 } from './mesher-gh-r1.mjs';
import { meshRegion as r2 } from './mesher-gh.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { contourCross6 } from './syn2.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
import { buildScenarios, scenarioInputs } from './editscenes.mjs';
const BASE = 6;
const ground = (x, y, z) => (y < BASE ? { v: 3, rho: Math.max(-1, Math.min(1, (BASE - y - 0.5) / 4)) } : { v: 0, rho: Math.max(-1, Math.min(1, (BASE - y - 0.5) / 4)) });
const hash = (x, y, z) => { let h = Math.imul(x * 374761393 + y * 668265263 + z * 2147483647, 1274126177) >>> 0; h ^= h >>> 13; return (Math.imul(h, 1274126177) >>> 8) / 16777216; };
const sc = buildScenarios();
const inputs = {
  rubble: core.buildRegion((x, y, z) => (y >= BASE && y < BASE + 8 && hash(x, y, z) < 0.3 ? { v: 3, edited: true } : ground(x, y, z)), 10),
  platform: core.buildRegion((x, y, z) => (y >= BASE && y < BASE + 3 ? { v: 3, edited: true } : ground(x, y, z)), 10),
  mountain: scenarioInputs(sc.mountain, 10)[0],
  town: scenarioInputs(sc.town, 10)[0],
  single: scenarioInputs(sc.single, 10)[0],
};
const cross = Object.fromEntries(Object.entries(inputs).map(([k, r]) => [k, contourCross6(r, cc8b.CFG)?.crossT]));
const best = {};
const N = Number(process.argv[2] ?? 15);
for (let i = 0; i < N; i++) for (const [k, r] of Object.entries(inputs)) {
  for (const [lab, f] of [['r1', () => r1({ ...r, crossT: cross[k], params: cc8b.PARAMS })], ['bits', () => r2({ ...r, crossT: cross[k], params: cc8b.PARAMS })], ['repo k6', () => repo({ ...r, params: {} })]]) {
    const t0 = performance.now(); f(); const t = performance.now() - t0;
    const key = `${k}|${lab}`; if (!(key in best) || t < best[key]) best[key] = t;
  }
}
for (const k of Object.keys(inputs)) console.log(k.padEnd(9), ['r1', 'bits', 'repo k6'].map((l) => `${l} ${best[`${k}|${l}`].toFixed(2)}`).join('  '));
