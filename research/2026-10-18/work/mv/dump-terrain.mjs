// Dump the top-surface material map of the two bench view chunks (debug only).
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as core from '../../harness/core.mjs';
const SEED = [1, 1];
for (const c of [[-1, 1, 1], [0, 0, -3]]) {
  const { input } = buildGenMeshInput(SEED, c[0], c[1], c[2], new Map(), { forceApron: 3 });
  const { nx, ny, nz, apron, blocks } = input;
  const rows = [];
  const ch = ['.', 'g', 'd', 'S', 's', 'p', 'b', '7'];
  // per column: list of (y, material) for solid blocks with air above
  let multi = 0;
  for (let z = 0; z < nz; z++) {
    let row = '';
    for (let x = 0; x < nx; x++) {
      let top = -1, cnt = 0;
      for (let y = ny - 2; y >= 0; y--) {
        const i = (y * nz + z) * nx + x, j = ((y + 1) * nz + z) * nx + x;
        if ((blocks[i] & 0xff) !== 0 && (blocks[j] & 0xff) === 0) { cnt++; if (top < 0) top = blocks[i] & 0xff; }
      }
      if (cnt > 1) multi++;
      row += top < 0 ? ' ' : ch[top];
    }
    rows.push(row);
  }
  console.log('chunk', c, 'columns with >1 top surface:', multi);
  console.log(rows.join('\n'));
}
