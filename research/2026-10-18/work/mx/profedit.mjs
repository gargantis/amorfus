import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildScenarios, SEED } from '../gh/editscenes.mjs';
import { prep, computeCodes, DEFAULTS } from './prod.mjs';
const scen = buildScenarios();
const N = Number(process.argv[2] ?? 5);
for (const s of ['mountain', 'town', 'single']) {
  const inp = buildGenMeshInput(SEED, ...scen[s].chunks[0], scen[s].edits, { forceApron: 10 }).input;
  let best = Infinity, st = null;
  for (let r = 0; r < N; r++) { const t0 = performance.now(); const P = prep(inp); const res = computeCodes(P, { ...DEFAULTS, loneRound: true }); const t = performance.now() - t0; if (t < best) best = t; st = res.stats; }
  console.log(s, best.toFixed(2), 'ms', JSON.stringify({ surface: st.surface, windows: st.windows, coded: st.coded, ownerWindows: st.ownerWindows, highWindows: st.highWindows, crackFits: st.crackFits, crackMiss: st.crackMiss, highMiss: st.highMiss, tauFallback: st.tauFallback, passes: st.passes, overflow: st.overflow, lone: st.lone }));
}
