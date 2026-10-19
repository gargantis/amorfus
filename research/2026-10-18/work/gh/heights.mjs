import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const C = [-1, 1, 1];
const inp = buildGenMeshInput([1, 1], C[0], C[1], C[2], new Map(), { forceApron: 10 }).input;
const n = inp.nx, A = 10;
for (let z = 0; z < 32; z += 2) {
  let row = '';
  for (let x = 0; x < 32; x += 2) {
    let t = -99;
    for (let y = n - 1; y >= 0; y--) if ((inp.blocks[(y * n + (z + A)) * n + (x + A)] & 0xff) !== 0) { t = y - A + C[1] * 32; break; }
    row += String(t).padStart(4);
  }
  console.log(String(z).padStart(2), row);
}
