// gh-cc8b on unedited GEN_MESH chunks (aprons 3 and 10) vs the repo mesher: bytes.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { VARIANTS } from './variants.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let diff = 0, n = 0;
for (const c of CH) for (const apron of [3, 10]) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input;
  const a = repoMesh({ ...inp, params: {} }), b = VARIANTS['gh-cc8b'].raw(inp);
  n++;
  const ua = new Uint8Array(a.vertexData), ub = new Uint8Array(b.vertexData);
  let same = ua.length === ub.length && a.indexData.length === b.indexData.length;
  for (let i = 0; same && i < ua.length; i++) if (ua[i] !== ub[i]) same = false;
  for (let i = 0; same && i < a.indexData.length; i++) if (a.indexData[i] !== b.indexData[i]) same = false;
  if (!same) diff++;
}
console.log(`unedited chunks: ${n} meshes, ${diff} differ from the repo mesher`);
