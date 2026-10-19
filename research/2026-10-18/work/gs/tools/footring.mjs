// terrace-disc: plan deviation of the stone riser's bottom ring (the
// stone|grass seam seen from above) from the ideal circle r = 6.3, sampled
// along the ring's mesh edges (8 samples per edge).
//   node work/gs/tools/footring.mjs '<label>' '<json>' [...]
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const s = ALL_SCENES.find((x) => x.name === 'terrace-disc');
const C = [16.2, 15.9], R = 6.3;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const mesh = core.decodeMesh(meshRegion({ ...core.buildRegion(s.cell, 10), params: JSON.parse(args[i + 1]) }));
  const ds = [];
  for (let t = 0; t < mesh.T; t++) {
    if (mesh.mat[mesh.tri[t * 3]] !== 3) continue; // stone triangles
    const q = mesh.triQuad[t];
    if (mesh.quadAxis[q] === 1) continue; // risers only (x/z faces)
    for (let e = 0; e < 3; e++) {
      const a = mesh.tri[t * 3 + e], b = mesh.tri[t * 3 + (e + 1) % 3];
      if (mesh.corner[a * 3 + 1] !== 6 || mesh.corner[b * 3 + 1] !== 6) continue; // bottom edge of the riser
      for (let k = 0; k < 8; k++) {
        const f = (k + 0.5) / 8;
        const x = mesh.pos[a * 3] + f * (mesh.pos[b * 3] - mesh.pos[a * 3]);
        const z = mesh.pos[a * 3 + 2] + f * (mesh.pos[b * 3 + 2] - mesh.pos[a * 3 + 2]);
        ds.push(Math.hypot(x - C[0], z - C[1]) - R);
      }
    }
  }
  const st = core.stats(ds);
  console.log(`${args[i].padEnd(12)} foot ring: std ${st.std.toFixed(3)} maxDev ${st.maxDev.toFixed(3)} mean ${st.mean.toFixed(3)} (n ${st.n})`);
}
