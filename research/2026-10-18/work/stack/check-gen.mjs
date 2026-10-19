// Consistency checks on the 16 bench chunks (seed 1,1, NO edits), gm input
// with planes, aprons 3 and 10:
//  1. stack geometry (positions, indices) ≡ production hints;
//  2. stack (S, E) codes ≡ gm-hint's (rule none) and gm-slope's (rule slope),
//     and the fragment shows the same material at every vertex;
//  3. stack AO ≡ gn-best AO (quad) / gn-ao AO (linear) on these chunks;
//  4. apron invariance: stack at apron 3 ≡ stack at apron 10 (all bytes the study keeps).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInputGM } from '../gm/input.mjs';
import { BENCH } from '../gm/terrain-metrics.mjs';
import * as gmHint from '../../approaches/gm-hint.mjs';
import * as gmSlope from '../../approaches/gm-slope.mjs';
import { makeStack } from './stack-core.mjs';
import { ownZone } from './zones.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { PARAMS as AOQ } from '../../approaches/vgn-aoq.mjs';
import { PARAMS as AOL } from '../../approaches/gn-ao.mjs';
const SQ = makeStack({ aoCurve: 'quad', genRule: 'none', zone: ownZone(0) });
const SS = makeStack({ aoCurve: 'linear', genRule: 'slope', zone: ownZone(0) });
let geo = 0, codes = 0, mats = 0, aoBad = 0, apronBad = 0, verts = 0;
const key = (m) => { const parts = []; for (let v = 0; v < m.V; v++) parts.push(`${Math.round(m.pos[v * 3] * 256)},${Math.round(m.pos[v * 3 + 1] * 256)},${Math.round(m.pos[v * 3 + 2] * 256)}|${m.nrm[v * 3].toFixed(6)},${m.nrm[v * 3 + 1].toFixed(6)},${m.nrm[v * 3 + 2].toFixed(6)}|${Math.round(m.ao[v] * 255)}|${m.mat[v]}|${m.flags[v]}|${Array.from(m.attrs.subarray(v * m.attrDim, v * m.attrDim + m.attrDim)).join(',')}`); return parts.join(';') + '#' + Array.from(m.tri).join(','); };
for (const c of BENCH) {
  const keys = {};
  for (const A of [3, 10]) {
    const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: A }).input;
    const h = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
    for (const [S, G, aoP] of [[SQ, gmHint, AOQ], [SS, gmSlope, AOL]]) {
      const s = S.mesh(inp, null, core);
      const g = G.mesh(inp, null, core);
      if (s.V !== h.V || s.T !== h.T) { geo++; continue; }
      for (let i = 0; i < s.pos.length; i++) if (s.pos[i] !== h.pos[i] || s.nrm[i] !== h.nrm[i]) { geo++; break; }
      for (let i = 0; i < s.tri.length; i++) if (s.tri[i] !== h.tri[i]) { geo++; break; }
      const ref = core.decodeMesh(gnMesh({ ...inp, params: aoP }));
      for (let v = 0; v < s.V; v++) {
        verts++;
        if (Math.round(s.ao[v] * 255) !== Math.round(ref.ao[v] * 255)) aoBad++;
        if (s.attrs[v * 3 + 1] !== g.attrs[v * 9 + 1] || s.attrs[v * 3 + 2] !== g.attrs[v * 9 + 2]) codes++;
        const info = { ownMat: s.mat[v], a: v, x: 0, y: 0, z: 0, quad: 0 };
        if (S.fragment(s.attrs.subarray(v * 3, v * 3 + 3), info) !== G.fragment(g.attrs.subarray(v * 9, v * 9 + 9), info)) mats++;
      }
      keys[`${A}|${S === SQ ? 'q' : 's'}`] = key(s);
    }
  }
  if (keys['3|q'] !== keys['10|q']) apronBad++;
  if (keys['3|s'] !== keys['10|s']) apronBad++;
}
console.log(`${BENCH.length} chunks × aprons 3,10 × 2 rules (${verts} vertices): geometry differences vs hints ${geo}; (S,E) code differences vs gm ${codes}; vertex material differences ${mats}; AO bytes vs gn ${aoBad}; apron 3 vs 10 differing chunk meshes ${apronBad}`);
process.exitCode = geo + codes + mats + aoBad + apronBad ? 1 : 0;
