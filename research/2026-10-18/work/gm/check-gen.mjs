// Byte-identity of the extended generator's original outputs (blocks,
// hints → rho) against the production builder in lib/gen-mesh.mjs, over the
// 16 bench chunks and their neighbours at aprons 3 and 10, plus a check that
// the material rule recomputed from the f64 fields reproduces every block.
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { v1Material } from './gen-gm.mjs';

const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const extra = [[5, 0, 5], [-7, 1, 3], [2, -1, 2], [3, 2, -4], [-10, 0, 9]];
let bad = 0, cells = 0, ruleBad = 0, solid = 0;
for (const apron of [3, 10]) {
  for (const c of [...CH, ...extra]) {
    const a = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron }).input;
    const g = buildGenMeshInputGM([1, 1], c[0], c[1], c[2], new Map(), { forceApron: apron });
    const b = g.input;
    for (let i = 0; i < a.blocks.length; i++) {
      cells++;
      if (a.blocks[i] !== b.blocks[i] || a.rho[i] !== b.rho[i] || a.shapeEdited[i] !== b.shapeEdited[i]) bad++;
    }
    // material rule from the fields
    const n = b.nx;
    for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = (y * n + z) * n + x;
      if (b.blocks[i] === 0) continue;
      solid++;
      const m = v1Material(2 - g.gen.H[z * n + x], g.gen.D[i]);
      if (g.gen.D[i] < 64 && m !== (b.blocks[i] & 0xff)) ruleBad++;
    }
  }
}
console.log(`generator copy: ${cells} cells compared with lib/gen-mesh.mjs, ${bad} differ (blocks, rho, shapeEdited)`);
console.log(`material rule from (S, D) f64 fields: ${solid} solid cells, ${ruleBad} disagree with the generated block`);
process.exitCode = bad + ruleBad > 0 ? 1 : 0;
