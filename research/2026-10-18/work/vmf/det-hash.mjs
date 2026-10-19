// vmf: hash every stored output of an approach (positions quantised as the
// vertex stores them, normals, AO, flags, material, attrs quantised to the
// 5-bit code, index buffer) for all harness scenes, the adversarial scenes and
// 16 real terrain chunks. Run twice in separate processes and diff.
//   node work/vmf/det-hash.mjs approaches/mf-iso.mjs [apron]
import { createHash } from 'node:crypto';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { ADV_SCENES } from './adv-scenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { loadApproach } from './lib.mjs';
const A = await loadApproach(process.argv[2]);
const apron = Number(process.argv[3] ?? A.apron ?? 10);
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const hashMesh = (m) => {
  const h = createHash('sha256');
  h.update(Buffer.from(Float64Array.from(m.pos).buffer));
  h.update(Buffer.from(Float64Array.from(m.nrm).buffer));
  h.update(Buffer.from(Float64Array.from(m.ao).buffer));
  h.update(Buffer.from(m.flags.buffer, m.flags.byteOffset, m.flags.byteLength));
  h.update(Buffer.from(m.mat.buffer, m.mat.byteOffset, m.mat.byteLength));
  h.update(Buffer.from(Uint32Array.from(m.tri).buffer));
  if (m.attrs) h.update(Buffer.from(Int8Array.from(m.attrs, (v) => Math.round(v * 30)).buffer)); // the 5-bit codes
  if (m.attrs) h.update(Buffer.from(Float64Array.from(m.attrs).buffer));
  return h.digest('hex').slice(0, 16);
};
const out = [];
for (const s of [...ALL_SCENES, ...ADV_SCENES]) out.push(`${s.name} ${hashMesh(A.mesh(core.buildRegion(s.cell, apron), null, core))}`);
for (const c of CH) out.push(`terrain ${c} ${hashMesh(A.mesh(buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input, null, core))}`);
console.log(out.join('\n'));
