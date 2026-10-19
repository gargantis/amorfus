// gh-cc8b cost breakdown per edit scenario: crossing pass vs mesher vs the
// production mesher (hints, k = 6), interleaved min of N.
import { buildScenarios, scenarioInputs } from './editscenes.mjs';
import { contourCross6 } from './syn2.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
const N = Number(process.argv[2] ?? 15);
const sc = buildScenarios();
const ins = Object.fromEntries(Object.entries(sc).map(([k, s]) => [k, scenarioInputs(s, 10)]));
const best = {};
const upd = (k, t) => { if (!(k in best) || t < best[k]) best[k] = t; };
for (let r = 0; r < N; r++) for (const [k, list] of Object.entries(ins)) list.forEach((inp, i) => {
  let t0 = performance.now(); const c = contourCross6(inp, cc8b.CFG); upd(`${k}|${i}|cross`, performance.now() - t0);
  t0 = performance.now(); ghMesh({ ...inp, crossT: c?.crossT, params: cc8b.PARAMS }); upd(`${k}|${i}|mesh`, performance.now() - t0);
  t0 = performance.now(); repoMesh({ ...inp, params: {} }); upd(`${k}|${i}|repo`, performance.now() - t0);
  if (r === 0) best[`${k}|${i}|edges`] = c ? c.stats.edges : 0;
});
for (const [k, list] of Object.entries(ins)) {
  const sum = (f) => list.reduce((a, _, i) => a + best[`${k}|${i}|${f}`], 0);
  const mx = (f) => Math.max(...list.map((_, i) => best[`${k}|${i}|${f}`]));
  const ed = sum('edges');
  console.log(`${k.padEnd(9)} edited edges ${String(ed).padStart(6)}  crossings ${sum('cross').toFixed(2)} ms (max ${mx('cross').toFixed(2)})  gh mesher k=0 ${sum('mesh').toFixed(2)} ms  → total ${(sum('cross') + sum('mesh')).toFixed(2)} vs repo k=6 ${sum('repo').toFixed(2)} ms${list.length > 1 ? ` (sums over ${list.length} chunks; max chunk total ${Math.max(...list.map((_, i) => best[`${k}|${i}|cross`] + best[`${k}|${i}|mesh`])).toFixed(2)} vs ${mx('repo').toFixed(2)})` : ''}`);
}
