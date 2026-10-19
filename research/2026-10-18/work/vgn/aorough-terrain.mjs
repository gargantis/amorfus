// vgn: reproduce the AO-roughness claim on the two bench chunks (all
// vertices; the harness metric: AO minus the mean of mesh neighbours, rms),
// production vs gn-best, at aprons 10 (bench) and 3 (production unedited).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { MESHERS } from './world.mjs';
const qkey = (pos, v) => `${Math.round(pos[v * 3] * 256)},${Math.round(pos[v * 3 + 1] * 256)},${Math.round(pos[v * 3 + 2] * 256)}`;
function rough(m) {
  const byKey = new Map(), nb = new Map();
  for (let v = 0; v < m.V; v++) { const k = qkey(m.pos, v); if (!byKey.has(k)) byKey.set(k, m.ao[v]); }
  for (let t = 0; t < m.T; t++) for (let e = 0; e < 3; e++) {
    const ka = qkey(m.pos, m.tri[t * 3 + e]), kb = qkey(m.pos, m.tri[t * 3 + ((e + 1) % 3)]);
    if (!nb.has(ka)) nb.set(ka, new Set()); if (!nb.has(kb)) nb.set(kb, new Set());
    nb.get(ka).add(kb); nb.get(kb).add(ka);
  }
  let s2 = 0, n = 0;
  for (const [k, set] of nb) { const a = byKey.get(k); let s = 0, c = 0; for (const o of set) { s += byKey.get(o); c++; } if (c) { s2 += (a - s / c) ** 2; n++; } }
  return Math.sqrt(s2 / n);
}
for (const [label, c] of [['mountain', [-1, 1, 1]], ['beach', [0, 0, -3]]]) for (const ap of [10, 3]) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: ap }).input;
  console.log(`${label} apron ${ap}: AO roughness prod ${rough(MESHERS.prod(inp)).toFixed(3)} → gn-best ${rough(MESHERS.gn(inp)).toFixed(3)}`);
}
