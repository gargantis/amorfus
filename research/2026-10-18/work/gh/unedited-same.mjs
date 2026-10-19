import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import * as cc8ao from '../../approaches/gh-cc8-ao.mjs';
import * as cc8 from '../../approaches/gh-cc8.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { contourCross4 } from './syn.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 1, 0]];
let diffNonAo = 0, diffAo = 0, verts = 0, diffIdx = 0;
for (const c of CH) for (const apron of [3, 10]) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input;
  const a = repoMesh({ ...inp, params: {} });
  const r = contourCross4(inp, { R: 8, w0: 1 });
  const b = ghMesh({ ...inp, crossT: r?.crossT, params: { k: 0, clearance: 'narrow', aoMode: 'position' } });
  const b0 = ghMesh({ ...inp, crossT: r?.crossT, params: { k: 0, clearance: 'narrow' } });
  const ua = new Uint8Array(a.vertexData), ub = new Uint8Array(b.vertexData), ub0 = new Uint8Array(b0.vertexData);
  if (ua.length !== ub.length) { console.log('length differs', c); continue; }
  for (let v = 0; v < a.vertexCount; v++) {
    verts++;
    for (let k = 0; k < 16; k++) {
      if (k === 6) { if (ua[v * 16 + 6] !== ub[v * 16 + 6]) diffAo++; continue; }
      if (ua[v * 16 + k] !== ub[v * 16 + k]) { diffNonAo++; break; }
    }
  }
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub0[i]) { diffIdx++; break; }
  for (let i = 0; i < a.indexData.length; i++) if (a.indexData[i] !== b.indexData[i]) { diffIdx++; break; }
}
console.log(`unedited: ${verts} vertices; non-AO bytes differing: ${diffNonAo}; AO byte differing: ${diffAo}; gh-cc8 (corner AO) or index buffers differing in ${diffIdx} meshes`);
