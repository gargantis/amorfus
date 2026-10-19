// Per-chunk dirt displayed/face area ratio for one module.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const A = await import(pathToFileURL(resolve(process.argv[2])).href);
const K = Number(process.argv[3] ?? 2);
const G = 6, fn = [0, 0, 0, 0];
for (const c of CH) {
  const m = A.mesh(buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: A.apron ?? 10 }).input, null, core);
  const dim = m.attrDim, tmp = new Float64Array(dim);
  const info = { t: 0, a: 0, b: 0, c: 0, quad: 0, w: [0, 0, 0], x: 0, y: 0, z: 0, ownMat: 0 };
  let face = 0, disp = 0;
  for (let t = 0; t < m.T; t++) {
    core.faceNormal(m, t, fn);
    const ar = fn[3]; if (ar <= 0) continue;
    const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
    if (m.mat[a] === K) face += ar;
    let n = 0, k = 0;
    for (let i = 0; i < G; i++) for (let j = 0; j < G - i; j++) {
      const w1 = (i + 1 / 3) / G, w2 = (j + 1 / 3) / G, w0 = 1 - w1 - w2;
      for (let d = 0; d < dim; d++) tmp[d] = w0 * m.attrs[a * dim + d] + w1 * m.attrs[b * dim + d] + w2 * m.attrs[cc * dim + d];
      info.a = a; info.ownMat = m.mat[a];
      if (A.fragment(tmp, info, null) === K) k++; n++;
    }
    disp += ar * k / n;
  }
  console.log(c.join(','), `face ${face.toFixed(0)} displayed ${disp.toFixed(0)} ×${(disp / Math.max(1, face)).toFixed(2)}`);
}
