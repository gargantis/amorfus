// Displayed area per material on the 16 bench chunks (triangles sampled on
// a barycentric grid), vs the block-face areas (hints: a quad shows its own
// block). Ideal: the same split. Reports per-material ratio displayed/faces.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const NAMES = ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'r7'];
const G = 8; // samples per triangle edge
for (const f of process.argv.slice(2)) {
  const A = await import(pathToFileURL(resolve(f)).href);
  const area = new Float64Array(8), faceArea = new Float64Array(8);
  const fn = [0, 0, 0, 0];
  for (const c of CH) {
    const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: A.apron ?? 10 }).input;
    const m = A.mesh(inp, null, core);
    const dim = m.attrDim ?? 0, tmp = new Float64Array(Math.max(1, dim));
    const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
    for (let t = 0; t < m.T; t++) {
      core.faceNormal(m, t, fn);
      const ar = fn[3];
      if (ar <= 0) continue;
      const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
      faceArea[m.mat[a]] += ar;
      if (!A.fragment) { area[m.mat[a]] += ar; continue; }
      let n = 0;
      const local = new Float64Array(8);
      for (let i = 0; i < G; i++) for (let j = 0; j < G - i; j++) {
        const w1 = (i + 1 / 3) / G, w2 = (j + 1 / 3) / G, w0 = 1 - w1 - w2;
        for (let d = 0; d < dim; d++) tmp[d] = w0 * m.attrs[a * dim + d] + w1 * m.attrs[b * dim + d] + w2 * m.attrs[cc * dim + d];
        info.t = t; info.a = a; info.b = b; info.c = cc; info.ownMat = m.mat[a];
        info.x = w0 * m.pos[a * 3] + w1 * m.pos[b * 3] + w2 * m.pos[cc * 3];
        info.y = w0 * m.pos[a * 3 + 1] + w1 * m.pos[b * 3 + 1] + w2 * m.pos[cc * 3 + 1];
        info.z = w0 * m.pos[a * 3 + 2] + w1 * m.pos[b * 3 + 2] + w2 * m.pos[cc * 3 + 2];
        local[A.fragment(tmp, info, null)] += 1; n++;
      }
      for (let k = 0; k < 8; k++) area[k] += (ar * local[k]) / n;
    }
  }
  const tot = area.reduce((x, y) => x + y, 0);
  const parts = [];
  for (let k = 1; k < 8; k++) if (faceArea[k] > 0) parts.push(`${NAMES[k]} ${(100 * area[k] / tot).toFixed(2)}% (×${(area[k] / faceArea[k]).toFixed(2)})`);
  console.log(`${A.name}: ${parts.join(', ')}`);
}
