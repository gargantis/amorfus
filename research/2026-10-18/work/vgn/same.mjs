// vgn: is gn-best byte-identical to the untouched repo mesher in everything
// except the AO byte (6) and the normal bytes (8-11)? And are gn defaults
// byte-identical to the repo bundle? Scenes + 24 real terrain chunks + edits.
//   node work/vgn/same.mjs
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
const inputs = [];
for (const s of ALL_SCENES) inputs.push([s.name, core.buildRegion(s.cell, 10)]);
const SEEDS = [[1, 1], [7, 7]];
const CH = [[-1, 1, 1], [0, 0, -3], [0, 0, 0], [1, 1, 1], [-2, 0, 2], [2, -1, 0]];
for (const seed of SEEDS) for (const c of CH) for (const ap of [3, 10]) inputs.push([`gen${seed}@${c}/a${ap}`, buildGenMeshInput(seed, c[0], c[1], c[2], new Map(), { forceApron: ap }).input]);
let bad = 0, badDefault = 0, n = 0;
for (const [label, inp] of inputs) {
  const r = repoMesh({ ...inp, params: {} });
  const d = gnMesh({ ...inp, params: {} });
  const g = gnMesh({ ...inp, params: PARAMS });
  n++;
  const rb = new Uint8Array(r.vertexData), db = new Uint8Array(d.vertexData), gb = new Uint8Array(g.vertexData);
  // defaults identical?
  if (rb.length !== db.length || rb.some((x, i) => x !== db[i]) || r.indexData.length !== d.indexData.length || r.indexData.some((x, i) => x !== d.indexData[i])) { badDefault++; console.log('DEFAULT DIFF', label); }
  // gn-best: everything except bytes 6, 8..11
  let diff = 0;
  if (rb.length !== gb.length) diff = -1;
  else for (let i = 0; i < rb.length; i++) { const o = i & 15; if (o === 6 || (o >= 8 && o <= 11)) continue; if (rb[i] !== gb[i]) diff++; }
  const idx = r.indexData.length === g.indexData.length && r.indexData.every((x, i) => x === g.indexData[i]);
  const pick = r.pickRecords.length === g.pickRecords.length && r.pickRecords.every((x, i) => x === g.pickRecords[i]);
  const posf = r.positions.length === g.positions.length && r.positions.every((x, i) => x === g.positions[i]);
  if (diff !== 0 || !idx || !pick || !posf) { bad++; console.log('GN DIFF', label, diff, idx, pick, posf); }
}
console.log(`${n} inputs: gn defaults ≠ repo in ${badDefault}; gn-best differs outside AO/normal bytes in ${bad}`);
