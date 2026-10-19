// Sizes of connected groups of 2-material saddle points (axis-adjacent
// lattice points both saddles) in the per-direction surface images: real
// terrain (16 bench chunks, coded box) vs the checker scene.
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { prep, makeWindow, fillWindow, U, DIRS, UVA } from '../prod.mjs';
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
function groups(region, label) {
  const P = prep(region);
  const sizes = new Map();
  // heightfield-ish +y image from each column's top exposed block (good enough for statistics)
  const d = 2, [a] = DIRS[d], [ua, va] = UVA[a];
  const img = new Int8Array(40 * 40).fill(U);
  for (let v = -4; v < 36; v++) for (let u = -4; u < 36; u++) {
    for (let L = 40; L >= -8; L--) {
      const i = P.off + u * P.stride[ua] + v * P.stride[va] + L * P.stride[a];
      if (P.cm[i] !== 0) { img[(v + 4) * 40 + (u + 4)] = P.cm[i] & 8 ? U : P.cm[i] & 7; break; }
    }
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= 40 || y >= 40 ? U : img[y * 40 + x]);
  const sad = (x, y) => { const p = at(x - 1, y - 1), q = at(x, y - 1), r = at(x - 1, y), t = at(x, y); return p === t && q === r && p !== q && p !== U && q !== U; };
  const seen = new Uint8Array(41 * 41);
  const hist = new Map();
  for (let y = 1; y < 40; y++) for (let x = 1; x < 40; x++) {
    if (seen[y * 41 + x] || !sad(x, y)) continue;
    let n = 0; const st = [[x, y]]; seen[y * 41 + x] = 1;
    while (st.length) { const [px, py] = st.pop(); n++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + dx, qy = py + dy; if (qx < 1 || qy < 1 || qx > 39 || qy > 39 || seen[qy * 41 + qx] || !sad(qx, qy)) continue; seen[qy * 41 + qx] = 1; st.push([qx, qy]); } }
    hist.set(n, (hist.get(n) ?? 0) + 1);
  }
  return hist;
}
const tot = new Map();
for (const c of CH) for (const [k, v] of groups(buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input)) tot.set(k, (tot.get(k) ?? 0) + v);
console.log('terrain +y: group size → count', [...tot.entries()].sort((p, q) => p[0] - q[0]).map(([k, v]) => `${k}:${v}`).join(' '));
const sc = ALL_SCENES.find((s) => s.name === 'checker');
console.log('checker scene:', [...groups(core.buildRegion(sc.cell, 10)).entries()].map(([k, v]) => `${k}:${v}`).join(' '));
