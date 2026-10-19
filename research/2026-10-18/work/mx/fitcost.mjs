// Per-fit cost and the redundancy of per-block windows: how many crack fits
// a per-chunk pass would need (unique boundary cracks of each direction's
// surface image touching a queried block) vs what the windows did.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildVolume, makeCtx, shade, gatherWindow, UV, findSurface } from './mxlib.mjs';
import { reconstruct, encodeChords, STATS } from './contour.mjs';
const SEED = [1, 1];
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-3, 1, 0], [0, 0, -3], [0, 0, 0], [1, 1, 1]];
const R = 7, OPTS = { est: 'hybrid', hq: 6, cornerRun: 3, tauMax: 0.45 };
let fitsTot = 0, uniqTot = 0, msTot = 0;
for (const c of CHUNKS) {
  const reg = buildGenMeshInput(SEED, c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;
  const m = core.decodeMesh(core.meshRegion(reg));
  const ctx = makeCtx(buildVolume(reg, 3), { W: 2 });
  ctx.cpu = makeCtx(buildVolume(reg, 9), { W: 2 });
  const uniq = new Set();
  const f0 = STATS.fits;
  const t0 = performance.now();
  const dec = (nb, cc, cx) => {
    const img = gatherWindow(cx.cpu, cc.a, cc.s, cc.cu, cc.cv, cc.L, R, cc.L - R, cc.L + R);
    // unique cracks a per-chunk pass needs: the 4 cell edges of this block that are cracks
    const S = 2 * R + 1, e = img[R * S + R];
    const nbrs = [[0, -1, 'h', 0], [0, 1, 'h', 1], [-1, 0, 'v', 0], [1, 0, 'v', 1]];
    for (const [dx, dy, k, o] of nbrs) {
      const m2 = img[(R + dy) * S + R + dx];
      if (m2 !== e && m2 !== 15) uniq.add(`${cc.a},${cc.s},${k},${cc.cu + (k === 'v' ? o : 0)},${cc.cv + (k === 'h' ? o : 0)},${cc.L}`);
    }
    return encodeChords(reconstruct(img, S, OPTS), e, true);
  };
  const info = { a: 0, x: 0, y: 0, z: 0, ownMat: 0 };
  for (let q = 0; q < m.quadCount; q++) {
    const vs = [m.tri[q * 6], m.tri[q * 6 + 1], m.tri[q * 6 + 2], m.tri[q * 6 + 5]];
    for (const v of vs) {
      info.a = v; info.x = m.pos[v * 3] * 0.9 + 0.1 * m.pos[vs[0] * 3]; info.y = m.pos[v * 3 + 1]; info.z = m.pos[v * 3 + 2] * 0.9 + 0.1 * m.pos[vs[0] * 3 + 2];
      info.ownMat = m.mat[v];
      shade(ctx, [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], info, { flags: m.flags }, dec, (code, e) => e);
    }
  }
  const ms = performance.now() - t0;
  const fits = STATS.fits - f0;
  fitsTot += fits; uniqTot += uniq.size; msTot += ms;
  console.log(`chunk ${c}: window fits ${fits}, unique boundary cracks needed ${uniq.size}, ratio ${(fits / Math.max(1, uniq.size)).toFixed(0)}, ${ms.toFixed(0)} ms`);
}
console.log(`total: fits ${fitsTot}, unique ${uniqTot}, ${msTot.toFixed(0)} ms → ${(msTot / fitsTot * 1000).toFixed(2)} µs per fit (incl. window gather + chain extraction); per-chunk pass estimate ${(msTot / fitsTot * uniqTot / CHUNKS.length).toFixed(1)} ms/chunk at this per-fit cost`);
