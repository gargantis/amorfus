// Warm-cache cost of the per-quad walks vs the fits (pipe6).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const M = await import(pathToFileURL(resolve(process.argv[2])).href);
const P = await import(pathToFileURL(resolve('work/mv/pipe6.mjs')).href);
const CH = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
let tCold = 0, tWarm = 0, calls = 0, nonEmpty = 0, rej = 0;
for (const c of CH) {
  const inp = buildGenMeshInput([1, 1], ...c, new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion({ ...inp, params: {} }));
  const ap = inp.apron;
  const args = [];
  for (let q = 0; q < m.quadCount; q++) {
    const ids = [];
    for (let k = 0; k < 6; k++) { const v = m.tri[q * 6 + k]; if (!ids.includes(v)) ids.push(v); }
    let best = ids[0];
    for (const v of ids) if (m.corner[v * 3 + 1] > m.corner[best * 3 + 1]) best = v;
    const rX = m.corner[best * 3] + ap, rY = m.corner[best * 3 + 1] + ap, rZ = m.corner[best * 3 + 2] + ap;
    let cx = 0, cz = 0;
    for (const v of ids) { cx += m.pos[v * 3]; cz += m.pos[v * 3 + 2]; }
    args.push([rX, rY, rZ, cx / ids.length - (rX - ap), cz / ids.length - (rZ - ap)]);
  }
  let best = Infinity, bestC = Infinity;
  for (let r = 0; r < 3; r++) {
    const ctx = P.buildContext(inp, M.OPT);
    let t0 = performance.now();
    for (const a of args) P.cornerPieces(ctx, ...a);
    const t1 = performance.now();
    let ne = 0;
    for (const a of args) { const p = P.cornerPieces(ctx, ...a); if (p.length) ne++; }
    const t2 = performance.now();
    bestC = Math.min(bestC, t1 - t0); best = Math.min(best, t2 - t1);
    if (r === 0) { calls += args.length; nonEmpty += ne; }
  }
  tCold += bestC; tWarm += best;
}
const n = CH.length;
console.log(`per chunk: quads ${(calls / n).toFixed(0)} (with pieces ${(nonEmpty / n).toFixed(0)}), cold walks+fits ${(tCold / n).toFixed(2)} ms, warm walks ${(tWarm / n).toFixed(2)} ms`);
