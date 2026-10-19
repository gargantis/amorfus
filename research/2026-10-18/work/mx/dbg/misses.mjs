import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { prep, computeCodes, DEFAULTS } from '../prod.mjs';
const CHUNKS = [[-1, 1, 2], [-2, 1, 0], [0, 1, 2]];
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const P = prep(inp);
  const missLog = [];
  const { stats } = computeCodes(P, { ...DEFAULTS, missLog });
  const byD = {};
  for (const m of missLog) byD[m.d] = (byD[m.d] ?? 0) + 1;
  const inBox = missLog.filter((m) => m.owner[0] >= -1 && m.owner[0] <= 32 && m.owner[1] >= -1 && m.owner[1] <= 32).length;
  console.log(`chunk ${c}: miss ${stats.crackMiss}, fallback ${stats.tauFallback}, by direction ${JSON.stringify(byD)}, owner in-plane inside box ${inBox}`);
  for (const m of missLog.slice(0, 6)) console.log('  ', JSON.stringify(m));
}
