// vmf: real terrain, plan view (topmost up-facing surface): dirt and sand
// 4-connected parts and area per chunk, hints vs mf-iso — do continuous
// dirt bands break into dashes, do patches merge?
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { loadApproach, planRaster, matStats } from './lib.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1]];
const apps = [await loadApproach('approaches/hints.mjs'), await loadApproach('approaches/mf-iso.mjs')];
const tot = apps.map(() => ({ parts: 0, area: 0, small: 0 }));
console.log('| chunk | hints dirt parts / area | mf-iso dirt parts / area | mf-iso parts < 0.25 block² |');
for (const c of CH) {
  const row = [];
  apps.forEach((A, k) => {
    const input = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: A.apron ?? 10 }).input;
    const m = A.mesh(input, null, core);
    const img = planRaster(m, { S: 16, fragment: A.fragment ? (a, i) => A.fragment(a, i, null) : null });
    const st = matStats(img, [0, 0, 32, 32]);
    tot[k].parts += st.parts[2]; tot[k].area += st.area[2];
    // tiny parts: count components with area < 0.25 block²
    const W = img.W, seen = new Uint8Array(img.mat.length);
    let small = 0;
    for (let i = 0; i < img.mat.length; i++) {
      if (seen[i] || img.mat[i] !== 2) continue;
      let n = 0; const st2 = [i]; seen[i] = 1;
      while (st2.length) { const q = st2.pop(); n++; const x = q % W, y = (q - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= img.H) continue; const j = ny * W + nx; if (!seen[j] && img.mat[j] === 2) { seen[j] = 1; st2.push(j); } } }
      const a = n / (16 * 16);
      if (a >= 0.01 && a < 0.25) small++;
    }
    tot[k].small += small;
    row.push(k === 0 ? `${st.parts[2]} / ${st.area[2].toFixed(1)}` : `${st.parts[2]} / ${st.area[2].toFixed(1)} | ${small}`);
  });
  console.log(`| ${c} | ${row.join(' | ')} |`);
}
console.log(`| total | ${tot[0].parts} / ${tot[0].area.toFixed(1)} | ${tot[1].parts} / ${tot[1].area.toFixed(1)} | ${tot[1].small} |`);
