import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { buildScenarios, SEED } from '../../gh/editscenes.mjs';
import { prep, computeCodes, DEFAULTS, CLIP } from '../prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1], [-1, 0, 1], [0, 1, -3], [1, 0, 1]];
const sc = buildScenarios();
const sets = { terrain: CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input), edits: Object.values(sc).flatMap((s) => s.chunks.map((c) => buildGenMeshInput(SEED, c[0], c[1], c[2], s.edits, { forceApron: 10 }).input)) };
for (const [name, inputs] of Object.entries(sets)) {
  const dLog = new Array(10).fill(0);
  let clipped = 0, codesWithClip = 0, codes = 0;
  for (const inp of inputs) { CLIP.n = 0; const r = computeCodes(prep(inp), { ...DEFAULTS, loneRound: true, dLog }); clipped += CLIP.n; codes += r.codes.length / 6; }
  console.log(`${name}: ${inputs.length} chunks, ${codes} codes, clipped searches ${clipped}; owner |ΔL| histogram 0..9+: ${dLog.join(' ')}`);
}
