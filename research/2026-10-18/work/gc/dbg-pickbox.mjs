import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
const M = await import(new URL(`../../approaches/${process.argv[2]}.mjs`, import.meta.url).href);
const perScene = [];
for (const s of ALL_SCENES) {
  const m = M.mesh(core.buildRegion(s.cell, M.apron ?? 10), null, core);
  let out = 0; const ex = [];
  for (let t = 0; t < m.T; t++) {
    const q = m.triQuad[t];
    const L = [m.quadLower[q * 3], m.quadLower[q * 3 + 1], m.quadLower[q * 3 + 2]];
    const ax = m.quadAxis[q];
    const lo = [0, 1, 2].map((a) => (a === ax ? L[a] + 0.5 : L[a] - 0.5));
    const hi = [0, 1, 2].map((a) => (a === ax ? L[a] + 1.5 : L[a] + 1.5));
    for (let k = 0; k < 3; k++) {
      const v = m.tri[t * 3 + k];
      for (let a = 0; a < 3; a++) {
        const p = m.pos[v * 3 + a];
        const e = Math.max(lo[a] - p, p - hi[a]);
        if (e > 1e-9) { out++; if (ex.length < 3) ex.push(`axis${a}${a === ax ? '(normal)' : '(tangent)'} by ${e.toFixed(3)} at ${[0, 1, 2].map((b) => m.pos[v * 3 + b].toFixed(3)).join(',')} quad lower ${L.join(',')} ax ${ax}`); }
      }
    }
  }
  if (out) perScene.push(`${s.name}: ${out}\n    ${ex.join('\n    ')}`);
}
console.log(perScene.join('\n'));
