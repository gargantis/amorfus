// vgn: largest AO jumps between adjacent vertices under gn-best on the 45
// terrain chunks; is it a residual band (smooth geometry) or a real crease?
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { MESHERS } from './world.mjs';
import { readFileSync } from 'node:fs';
const J = JSON.parse(readFileSync(new URL('./terrain-ao.json', import.meta.url)));
const out = [];
let hist = { g10: 0, g20: 0, g30: 0, p10: 0, p20: 0, p30: 0, edges: 0 };
for (const { seed, c } of J.chunks) {
  const inp = buildGenMeshInput(seed, ...c, new Map(), { forceApron: 3 }).input;
  const G = MESHERS.gn(inp), P = MESHERS.prod(inp);
  const fn = [0, 0, 0, 0];
  for (let t = 0; t < G.T; t++) for (let e = 0; e < 3; e++) {
    const a = G.tri[t * 3 + e], b = G.tri[t * 3 + ((e + 1) % 3)];
    if (a > b) continue;
    hist.edges++;
    const dg = Math.abs(G.ao[a] - G.ao[b]), dp = Math.abs(P.ao[a] - P.ao[b]);
    if (dg > 0.1) hist.g10++; if (dg > 0.2) hist.g20++; if (dg > 0.3) hist.g30++;
    if (dp > 0.1) hist.p10++; if (dp > 0.2) hist.p20++; if (dp > 0.3) hist.p30++;
    if (dg > 0.25) {
      // local geometry: angle between the two vertex normals (crease) and edge length
      const ang = core.angleDeg(G.nrm[a * 3], G.nrm[a * 3 + 1], G.nrm[a * 3 + 2], G.nrm[b * 3], G.nrm[b * 3 + 1], G.nrm[b * 3 + 2]);
      out.push({ seed, c, a: [0, 1, 2].map((k) => +G.pos[a * 3 + k].toFixed(2)), b: [0, 1, 2].map((k) => +G.pos[b * 3 + k].toFixed(2)), aoA: +G.ao[a].toFixed(2), aoB: +G.ao[b].toFixed(2), normalAngle: +ang.toFixed(0) });
    }
  }
}
console.log(`edges ${hist.edges}: AO jump > 0.1: prod ${hist.p10} gn ${hist.g10}; > 0.2: prod ${hist.p20} gn ${hist.g20}; > 0.3: prod ${hist.p30} gn ${hist.g30}`);
out.sort((x, y) => Math.abs(y.aoA - y.aoB) - Math.abs(x.aoA - x.aoB));
for (const o of out.slice(0, 10)) console.log(JSON.stringify(o));
