import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { prep, computeCodes, DEFAULTS } from '../prod.mjs';
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
for (const c of CHUNKS) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const P = prep(inp);
  const missLog = [];
  const { stats } = computeCodes(P, { ...DEFAULTS, missLog });
  const kinds = {};
  for (const m of missLog) {
    const k = `d${m.d} ${m.want[0] === m.got[0] && m.want[1] !== m.got[1] ? 'nbMat' : m.want[0] !== m.got[0] ? 'ownMat' : 'other'} dL=${m.ownerLvlNb - m.owner[2]}`;
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  console.log(`chunk ${c}: coded ${stats.coded} miss ${stats.crackMiss} fallback ${stats.tauFallback}`, JSON.stringify(kinds));
}
