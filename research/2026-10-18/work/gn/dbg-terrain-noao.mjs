// Render the hints mesh of the two bench chunks with AO forced to 1, and
// with flat (face) normals forced, to separate AO banding from normal banding.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { renderShaded } from '../../harness/raster.mjs';
import { writePng } from '../../harness/png.mjs';
const VIEWS = {
  'terrain-mountain': { chunk: [-1, 1, 1], eye: [44, 40, 44], target: [14, 14, 14] },
  'terrain-beach': { chunk: [0, 0, -3], eye: [40, 34, 42], target: [15, 18, 15] },
};
for (const [label, v] of Object.entries(VIEWS)) {
  const inp = buildGenMeshInput([1, 1], ...v.chunk, new Map(), { forceApron: 3 }).input;
  const mesh = core.decodeMesh(core.meshRegion(inp));
  let lo = 1; for (const a of mesh.ao) lo = Math.min(lo, a);
  console.log(label, 'V', mesh.V, 'T', mesh.T, 'min AO', lo.toFixed(3));
  mesh.ao.fill(1);
  const img = renderShaded(mesh, { width: 560, height: 380, eye: v.eye, target: v.target });
  writePng(`work/gn/${label}-hints-noao.png`, img.width, img.height, img.rgb);
}
