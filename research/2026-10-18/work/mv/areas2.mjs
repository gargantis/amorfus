// Displayed vs face area per material, split by triangle slope (|n_y| bands).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const NAMES = ['air', 'grass', 'dirt', 'stone', 'sand'];
const G = 8;
const BANDS = [[0.9, 1.01, 'flat'], [0.6, 0.9, 'slope'], [-1.01, 0.6, 'steep']];
for (const f of process.argv.slice(2)) {
  const A = await import(pathToFileURL(resolve(f)).href);
  const area = BANDS.map(() => new Float64Array(8)), face = BANDS.map(() => new Float64Array(8));
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
      const bi = BANDS.findIndex(([lo, hi]) => fn[1] >= lo && fn[1] < hi);
      const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
      face[bi][m.mat[a]] += ar;
      if (!A.fragment) { area[bi][m.mat[a]] += ar; continue; }
      let n = 0;
      const local = new Float64Array(8);
      for (let i = 0; i < G; i++) for (let j = 0; j < G - i; j++) {
        const w1 = (i + 1 / 3) / G, w2 = (j + 1 / 3) / G, w0 = 1 - w1 - w2;
        for (let d = 0; d < dim; d++) tmp[d] = w0 * m.attrs[a * dim + d] + w1 * m.attrs[b * dim + d] + w2 * m.attrs[cc * dim + d];
        info.t = t; info.a = a; info.b = b; info.c = cc; info.ownMat = m.mat[a];
        local[A.fragment(tmp, info, null)] += 1; n++;
      }
      for (let k = 0; k < 8; k++) area[bi][k] += (ar * local[k]) / n;
    }
  }
  console.log(A.name, BANDS.map(([, , lab], bi) => `${lab}: ` + [1, 2, 4].map((k) => `${NAMES[k]} ${face[bi][k].toFixed(0)}→×${(area[bi][k] / Math.max(1e-9, face[bi][k])).toFixed(2)}`).join(' ')).join(' | '));
}
