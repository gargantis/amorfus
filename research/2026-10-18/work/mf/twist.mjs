// Twist (diagonal-midpoint separation) of quads whose diagonal the field wants flipped.
import * as core from '../../harness/core.mjs';
import { build } from './field.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
const A = build({ name: 'x', kernel: { type: 'gauss', sigma: 1.2 }, guard: { type: 'support', tau: 0.55 }, bits: null, flipTwist: 1e9 });
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const tw = [];
let quads = 0, bq = 0;
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const base = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const m = A.mesh(inp, null, core);
  quads += m.quadCount; bq += m.mfStats.boundaryQuads;
  for (let q = 0; q < m.quadCount; q++) {
    const a = base.tri.subarray(6 * q, 6 * q + 6), b = m.tri.subarray(6 * q, 6 * q + 6);
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
    const ring = [a[0], a[1], a[2], a[5]];
    let t = 0;
    for (let k = 0; k < 3; k++) { const d = 0.5 * (base.pos[ring[0] * 3 + k] + base.pos[ring[2] * 3 + k]) - 0.5 * (base.pos[ring[1] * 3 + k] + base.pos[ring[3] * 3 + k]); t += d * d; }
    tw.push(Math.sqrt(t));
  }
}
tw.sort((x, y) => x - y);
const pct = (p) => tw[Math.min(tw.length - 1, Math.floor(p * tw.length))].toFixed(3);
console.log(`quads ${quads}, boundary quads ${bq} (${(100 * bq / quads).toFixed(1)}%), flips wanted ${tw.length} (${(100 * tw.length / quads).toFixed(1)}% of quads)`);
console.log(`twist p25 ${pct(0.25)} p50 ${pct(0.5)} p75 ${pct(0.75)} p90 ${pct(0.9)} p99 ${pct(0.99)} max ${tw[tw.length - 1].toFixed(3)}`);
for (const lim of [0.03, 0.05, 0.1, 0.15, 0.2, 0.3]) console.log(`  ≤ ${lim}: ${(100 * tw.filter((t) => t <= lim).length / tw.length).toFixed(0)}%`);
