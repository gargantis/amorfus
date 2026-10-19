// Pick sufficiency as §9.3 needs it: every point of a quad's triangles must
// lie in a block within Chebyshev distance 1 of the quad's lower block, i.e.
// inside [L−1, L+2) per axis. Reports violations and the minimum margin.
import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
for (const n of process.argv.slice(2)) {
  const M = await import(new URL(`../../approaches/${n}.mjs`, import.meta.url).href);
  let bad = 0, margin = Infinity, tris = 0;
  for (const s of ALL_SCENES) {
    const m = M.mesh(core.buildRegion(s.cell, M.apron ?? 10), null, core);
    for (let t = 0; t < m.T; t++) {
      const q = m.triQuad[t];
      tris++;
      for (let k = 0; k < 3; k++) {
        const v = m.tri[t * 3 + k];
        for (let a = 0; a < 3; a++) {
          const L = m.quadLower[q * 3 + a], p = m.pos[v * 3 + a];
          const mg = Math.min(p - (L - 1), L + 2 - p);
          if (mg <= 0) bad++;
          margin = Math.min(margin, mg);
        }
      }
    }
  }
  console.log(`${n}: ${tris} triangles, ${bad} vertex coords outside the Chebyshev-1 pick box; min margin ${margin.toFixed(3)} block`);
}
