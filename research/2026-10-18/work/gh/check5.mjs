import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { contourCross4 } from './syn.mjs';
import { contourCross5 } from './syn2.mjs';
let bad = 0, edges = 0;
for (const s of ALL_SCENES) {
  const r = core.buildRegion(s.cell, 10);
  const a = contourCross4(r, { R: 8, w0: 1 }), b = contourCross5(r, { R: 8, w0: 1 });
  if (!a && !b) continue;
  edges += b.stats.edges;
  for (let i = 0; i < a.crossT.length; i++) if (a.crossT[i] !== b.crossT[i]) bad++;
}
console.log('edges', edges, 'differing crossT entries', bad);
