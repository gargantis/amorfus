// Checksum of all codes over the 16 bench chunks + 3 edit chunks + all scenes:
// any change in output shows up here (used to verify pure optimisations).
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildScenarios, SEED } from '../gh/editscenes.mjs';
import { prep, computeCodes, DEFAULTS } from './prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const sc = buildScenarios();
const inputs = [...CH.map((c) => buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input), ...['mountain', 'town', 'single'].map((s) => buildGenMeshInput(SEED, ...sc[s].chunks[0], sc[s].edits, { forceApron: 10 }).input), ...ALL_SCENES.filter((s) => s.kind === 'material').map((s) => core.buildRegion(s.cell, 10))];
let h = 0x811c9dc5, n = 0;
for (const inp of inputs) { const { codes } = computeCodes(prep(inp), { ...DEFAULTS, loneRound: true }); for (const v of codes) h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; n += codes.length / 6; }
console.log(`codes ${n}, checksum ${h.toString(16)}`);
