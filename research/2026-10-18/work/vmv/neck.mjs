// vmv: copy of work/vmf/neck.mjs, output to out/vmv-adv and work/vmv.
// vmf: width of the 1:1 diagonal line along its whole length (no skip) after
// ONE adjacent stone paint, mf-iso vs hints. Prints the width profile minimum
// and where; the neck next to the added block is the artefact.
import * as core from '../../harness/core.mjs';
import { flatGround } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster } from '../vmf/lib.mjs';
const { GRASS, STONE } = core;
const S = 64;
for (const f of process.argv.slice(2)) {
  const A = await loadApproach(f);
  for (const [px, pz] of [[null, null], [15, 16], [16, 15], [15, 17], [15, 14]]) {
    const plan = (x, z) => (x === px && z === pz ? STONE : x >= 4 && x < 28 && z === x ? STONE : GRASS);
    const region = core.buildRegion(flatGround(plan), A.apron ?? 10);
    const img = planRaster(A.mesh(region, null, core), { x0: 6, z0: 6, w: 20, h: 20, S, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const at = (x, z) => img.mat[Math.floor((z - 6) * S) * img.W + Math.floor((x - 6) * S)];
    let mn = Infinity, where = 0;
    const prof = [];
    for (let t = 10; t <= 21; t += 0.02) {
      // longest stone run through the centre line point, perpendicular
      let c = 0;
      for (let s = -2.5; s <= 2.5; s += 1 / (2 * S)) { const x = t + 0.5 + s * Math.SQRT1_2, z = t + 0.5 - s * Math.SQRT1_2; if (at(x, z) === STONE) c++; }
      const w = c / (2 * S);
      prof.push(w);
      if (w < mn) { mn = w; where = t; }
    }
    console.log(`${A.name} paint ${px},${pz}: min width ${mn.toFixed(3)} at t=${where.toFixed(2)} (unpainted line ≈ ${px === null ? mn.toFixed(3) : '—'})`);
  }
}
