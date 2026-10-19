// vmf: per bench chunk, the surface-material mix (top-down) and where
// grass/dirt/sand boundaries concentrate, to aim close-up cameras.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 6 }).input;
  const n = inp.nx, ap = inp.apron;
  const top = new Int32Array(32 * 32).fill(-1), mat = new Uint8Array(32 * 32);
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) for (let y = 31; y >= 0; y--) {
    const i = ((y + ap) * n + z + ap) * n + x + ap;
    const up = (((y + 1) + ap) * n + z + ap) * n + x + ap;
    if ((inp.blocks[i] & 0xff) !== 0 && (inp.blocks[up] & 0xff) === 0) { top[z * 32 + x] = y; mat[z * 32 + x] = inp.blocks[i] & 0xff; break; }
  }
  const cnt = [0, 0, 0, 0, 0, 0, 0, 0];
  let bx = 0, bz = 0, bn = 0, ymin = 99, ymax = -1;
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    const m = mat[z * 32 + x]; cnt[m]++;
    if (top[z * 32 + x] >= 0) { ymin = Math.min(ymin, top[z * 32 + x]); ymax = Math.max(ymax, top[z * 32 + x]); }
    if (x < 31 && z < 31 && m && (mat[z * 32 + x + 1] !== m || mat[(z + 1) * 32 + x] !== m)) { bx += x; bz += z; bn++; }
  }
  console.log(`${c}: surface y ${ymin}..${ymax}, top mats grass ${cnt[1]} dirt ${cnt[2]} stone ${cnt[3]} sand ${cnt[4]} none ${cnt[0]}; ${bn} boundary cells, centroid ${bn ? (bx / bn).toFixed(1) : '-'},${bn ? (bz / bn).toFixed(1) : '-'}`);
}
