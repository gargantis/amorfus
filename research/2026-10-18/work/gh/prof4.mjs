import { buildScenarios, scenarioInputs } from './editscenes.mjs';
import { contourCross6 } from './syn2.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
const sc = buildScenarios();
for (const k of ['mountain', 'town', 'single']) {
  const inp = scenarioInputs(sc[k], 10)[0];
  let best = 1e9, st;
  for (let r = 0; r < 15; r++) { const t0 = performance.now(); const c = contourCross6(inp, cc8b.CFG); const t = performance.now() - t0; if (t < best) best = t; st = c.stats; }
  // cost of just the solid array + edit scan
  let best0 = 1e9;
  for (let r = 0; r < 15; r++) { const t0 = performance.now(); const s = new Uint8Array(inp.blocks.length); for (let i = 0; i < s.length; i++) s[i] = (inp.blocks[i] & 0xff) !== 0 ? 1 : 0; let f = -1; for (let i = 0; i < s.length; i++) if (inp.shapeEdited[i]) { f = i; break; } const t = performance.now() - t0; if (t < best0) best0 = t; }
  console.log(k, 'cross', best.toFixed(2), 'ms; solid+scan', best0.toFixed(2), 'ms;', JSON.stringify(st));
}
