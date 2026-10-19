// contourCross6 ≡ contourCross5 (crossT bytes) on every scene, the gh worlds,
// and the edit-bench inputs.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { WORLDS } from './worlds.mjs';
import { contourCross5, contourCross6 } from './syn2.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
let bad = 0, edges = 0, n = 0;
const cmp = (r, label) => {
  for (const cfg of [cc8b.CFG, { ...cc8b.CFG, cliffY: false }, { R: 8 }, { R: 5, mirror: true, cliffH: true }]) {
    const a = contourCross5(r, cfg), b = contourCross6(r, cfg);
    if (!a && !b) continue;
    n++;
    edges += b.stats.edges;
    let d = 0;
    for (let i = 0; i < a.crossT.length; i++) if (a.crossT[i] !== b.crossT[i]) d++;
    if (d) { bad += d; console.log('DIFF', label, JSON.stringify(cfg), d); }
  }
};
for (const s of ALL_SCENES) cmp(core.buildRegion(s.cell, 10), s.name);
for (const [k, w] of Object.entries(WORLDS)) cmp(core.buildRegion(w.cell, 10), k);
console.log(`${n} crossing sets, ${edges} edges, ${bad} differing entries`);
// edit-bench inputs (generated terrain + edits)
import { buildScenarios, scenarioInputs } from './editscenes.mjs';
{
  const sc = buildScenarios();
  bad = 0; edges = 0; n = 0;
  for (const [k, s] of Object.entries(sc)) scenarioInputs(s, 10).forEach((inp, i) => cmp(inp, `${k}#${i}`));
  console.log(`edit scenes: ${n} crossing sets, ${edges} edges, ${bad} differing entries`);
}
