// Map the label terraces on the top and bottom faces of the 14x2x5 slab
// (FID-0.15, n = 12): sub-cell layers above y = 2 / below y = 0, per cell column.
import { runSim } from './lib/loc.mjs';
import { writeFileSync } from 'node:fs';
const A = 6;
const [regName, addX] = [process.argv[2] ?? 'FID-0.15', process.argv[3]];
const slab = []; for (let x = 0; x < 14; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 5; z++) slab.push([x, y, z, A]);
const blocks = addX !== undefined ? slab.concat([[+addX, 2, 2, A]]) : slab;
const sim = runSim(blocks, regName, { n: 12, bbox: [0, 0, 0, 13, 2, 4] });
const { NX, NY, NZ, n, ox, oy, oz, label } = sim;
const j2 = Math.round((2 - oy) * n), j0 = Math.round((0 - oy) * n);
const rows = [], rowsB = [];
const top = [], bot = [];
for (let k = 0; k < NZ; k += 3) {
  let s = '', sb = '';
  for (let i = 0; i < NX; i += 3) {
    // layers of solid at/above y = 2 (j >= j2) and missing/extra below y = 0
    let up = 0; for (let j = j2; j < NY; j++) if (label[(k * NY + j) * NX + i]) up++;
    let dn = 0; for (let j = 0; j < j0; j++) if (label[(k * NY + j) * NX + i]) dn++;
    // is the column solid just below y = 2 (inside top face)?
    const inTop = label[(k * NY + j2 - 1) * NX + i] ? 1 : 0;
    const inBot = label[(k * NY + j0) * NX + i] ? 1 : 0;
    s += !inTop ? '.' : up > 9 ? '#' : String(up);
    sb += !inBot ? '.' : dn > 9 ? '#' : String(dn);
  }
  rows.push(s); rowsB.push(sb);
}
console.log(`${regName} add@${addX ?? '-'}: steps ${sim.steps} conv ${sim.converged} lamRun ${sim.phases[1].lamRun}`);
console.log('top face: sub-cell layers above y=2 (x right, z down, every 3rd cell = 1/4 block)');
console.log(rows.join('\n'));
console.log('bottom face: layers below y=0');
console.log(rowsB.join('\n'));
