// mesher overheads: gh mesher (narrow / d3) vs repo, k = 0 and 6, same crossT
import { buildScenarios, scenarioInputs } from './editscenes.mjs';
import { contourCross6 } from './syn2.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
const sc = buildScenarios();
const inp = scenarioInputs(sc.mountain, 10)[0];
const c = contourCross6(inp, cc8b.CFG);
const V = {
  'repo k6': () => repoMesh({ ...inp, params: {} }),
  'repo k0': () => repoMesh({ ...inp, params: { k: 0 } }),
  'gh k0 d3 no-crossT': () => ghMesh({ ...inp, params: { k: 0 } }),
  'gh k0 d3 crossT': () => ghMesh({ ...inp, crossT: c.crossT, params: { k: 0 } }),
  'gh k0 narrow crossT': () => ghMesh({ ...inp, crossT: c.crossT, params: { k: 0, clearance: 'narrow' } }),
};
const best = {};
for (let r = 0; r < 21; r++) for (const [k, f] of Object.entries(V)) { const t0 = performance.now(); f(); const t = performance.now() - t0; if (!(k in best) || t < best[k]) best[k] = t; }
for (const [k, t] of Object.entries(best)) console.log(k.padEnd(22), t.toFixed(2), 'ms');
