// vgn: print the neighbourhood of a vertex: blocks (# solid, . air), the
// gn partial volume, production's binary 4×4×4 count and gn's box F.
//   node work/vgn/probe.mjs <seed a,b> <cx,cy,cz> <x,y,z chunk-local position>
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
const [sd, cs, ps] = process.argv.slice(2);
const seed = sd.split(',').map(Number), c = cs.split(',').map(Number), p = ps.split(',').map(Number);
const inp = buildGenMeshInput(seed, c[0], c[1], c[2], new Map(), { forceApron: 3 }).input;
const P = core.decodeMesh(repoMesh({ ...inp, params: {} }));
const G = core.decodeMesh(gnMesh({ ...inp, params: PARAMS }));
const corners = gnMesh({ ...inp, params: {} }).corners;
let best = -1, bd = 1e9;
for (let v = 0; v < P.V; v++) { const d = Math.hypot(P.pos[v * 3] - p[0], P.pos[v * 3 + 1] - p[1], P.pos[v * 3 + 2] - p[2]); if (d < bd) { bd = d; best = v; } }
const v = best;
const cx = corners[v * 3], cy = corners[v * 3 + 1], cz = corners[v * 3 + 2];
console.log(`vertex ${v} at ${[0, 1, 2].map((a) => P.pos[v * 3 + a].toFixed(3))} corner ${cx},${cy},${cz}; AO prod ${P.ao[v].toFixed(3)} gn ${G.ao[v].toFixed(3)}; normal ${[0, 1, 2].map((a) => P.nrm[v * 3 + a].toFixed(2))}`);
const n = inp.nx, A = inp.apron;
const at = (x, y, z) => ((y + A) * n + (z + A)) * n + (x + A);
let cnt = 0;
for (let y = cy + 2; y >= cy - 3; y--) {
  const rows = [];
  for (let z = cz - 3; z <= cz + 2; z++) {
    let s = '';
    for (let x = cx - 3; x <= cx + 2; x++) {
      const i = at(x, y, z);
      const solid = (inp.blocks[i] & 0xff) !== 0;
      const pv = Math.min(1, Math.max(0, 0.5 + 4 * inp.rho[i]));
      s += (solid ? '#' : '.') + pv.toFixed(1).replace('0.', '.').replace('1.0', '1 ') + ' ';
      if (x >= cx - 2 && x < cx + 2 && z >= cz - 2 && z < cz + 2 && y >= cy - 2 && y < cy + 2) cnt += solid ? 1 : 0;
    }
    rows.push(s);
  }
  console.log(`y=${y}${y >= cy - 2 && y < cy + 2 ? ' (in prod window)' : ''}\n  ` + rows.join('\n  '));
}
console.log(`prod binary window count ${cnt}/64 = ${(cnt / 64).toFixed(3)}`);
