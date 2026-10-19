// §9.3 picking tests quads whose lower block is within Chebyshev distance 1
// of the visited block, "sufficient because every vertex stays inside its
// cell". For refined meshes: does every triangle stay inside the box of its
// parent quad's corner cells ([min corner − ½, max corner + ½] per axis)?
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
for (const n of process.argv.slice(2)) {
  const M = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  let tris = 0, out = 0, worst = 0;
  for (const s of ALL_SCENES) {
    const m = M.mesh(core.buildRegion(s.cell, M.apron ?? 10), null, core);
    for (let t = 0; t < m.T; t++) {
      const q = m.triQuad[t];
      const L = [m.quadLower[q * 3], m.quadLower[q * 3 + 1], m.quadLower[q * 3 + 2]];
      const ax = m.quadAxis[q];
      // face corners: axis coord = lower+1, tangents lower+1 .. lower+2? (corner coords = block coords)
      const lo = [0, 1, 2].map((a) => (a === ax ? L[a] + 1 : L[a] + 1) - 0.5 - (a === ax ? 0 : 1) + 0);
      const hi = [0, 1, 2].map((a) => (a === ax ? L[a] + 1 : L[a] + 2) + 0.5 - (a === ax ? 0 : 1));
      tris++;
      let ex = 0;
      for (let k = 0; k < 3; k++) {
        const v = m.tri[t * 3 + k];
        for (let a = 0; a < 3; a++) { const p = m.pos[v * 3 + a]; ex = Math.max(ex, lo[a] - p, p - hi[a]); }
      }
      if (ex > 1e-9) { out++; worst = Math.max(worst, ex); }
    }
  }
  console.log(`${n}: ${tris} triangles, ${out} leave their parent quad's corner cells (worst by ${worst.toFixed(3)} block)`);
}
