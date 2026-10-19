// CPU cost of the per-chunk code pass and a two-chunk seam test, on real
// generated terrain (seed 1,1), GEN_MESH input with apron 10.
//  cost: for every quad, 5 sample points (corners pulled 15 % in, centre)
//   with interpolated smooth normals → the (surface block, direction) keys a
//   fragment can query; per key the 5×5 early-out, then the contour code
//   (reconstruct + encode), timed. Reports keys, codes, overflow, ms.
//  seam: points on chunk A's quads within 1.5 blocks of the A|B face are
//   evaluated from A's data and from B's data (B-local coords); any
//   difference is a visible seam.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildVolume, makeCtx, shade, gatherWindow, xbrDecide, xbrEval, dominant, UV, findSurface } from './mxlib.mjs';
import { reconstruct, encodeChords, evalChords } from './contour.mjs';

const SEED = [1, 1];
const CHUNKS = [
  [-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2],
  [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1],
];
const R = 7;
const OPTS = { est: 'hybrid', hq: 6, cornerRun: 3, tauMax: 0.45 };
const input = (c) => buildGenMeshInput(SEED, c[0], c[1], c[2], new Map(), { forceApron: 10 }).input;

function samples(m) {
  const out = [];
  const { pos, nrm, tri } = m;
  for (let q = 0; q < m.quadCount; q++) {
    const vs = [tri[q * 6], tri[q * 6 + 1], tri[q * 6 + 2], tri[q * 6 + 5]];
    const uniq = [...new Set(vs)];
    const c = [0, 0, 0], n = [0, 0, 0];
    for (const v of uniq) for (let a = 0; a < 3; a++) { c[a] += pos[v * 3 + a] / uniq.length; n[a] += nrm[v * 3 + a] / uniq.length; }
    out.push({ p: c, n, a: uniq[0], q });
    for (const v of uniq) {
      const p = [0, 0, 0], nn = [0, 0, 0];
      for (let a = 0; a < 3; a++) { p[a] = 0.85 * pos[v * 3 + a] + 0.15 * c[a]; nn[a] = 0.85 * nrm[v * 3 + a] + 0.15 * n[a]; }
      out.push({ p, n: nn, a: v, q });
    }
  }
  return out;
}

function contourCtx(region) {
  const ctx = makeCtx(buildVolume(region, 3), { W: 2 });
  ctx.cpu = makeCtx(buildVolume(region, 9), { W: 2 });
  return ctx;
}
const decideContour = (nb, c, ctx) => {
  const img = gatherWindow(ctx.cpu, c.a, c.s, c.cu, c.cv, c.L, R, c.L - R + 1, c.L + R - 1);
  return encodeChords(reconstruct(img, 2 * R + 1, OPTS), img[R * (2 * R + 1) + R], true);
};
const decideXbr = (nb) => xbrDecide(nb, { corner: 'C' });

const mode = process.argv[2] ?? 'cost';
if (mode === 'cost') {
  let tot = { keys: 0, codes: 0, overflow: 0, ms: 0, msVol: 0, frags: 0, fetch: 0, passes: [0, 0, 0] };
  for (const c of CHUNKS) {
    const reg = input(c);
    const m = core.decodeMesh(core.meshRegion(reg));
    const t0 = performance.now();
    const ctx = contourCtx(reg);
    const t1 = performance.now();
    const S = samples(m);
    let codes = 0, overflow = 0;
    const info = { a: 0, x: 0, y: 0, z: 0, ownMat: 0 };
    const tc0 = performance.now();
    for (const s of S) {
      info.a = s.a; info.x = s.p[0]; info.y = s.p[1]; info.z = s.p[2]; info.ownMat = m.mat[s.a];
      shade(ctx, s.n, info, { flags: m.flags }, decideContour, (code, e) => e);
    }
    const tc1 = performance.now();
    for (const ent of ctx.cache.values()) {
      if (ent.early) continue;
      codes++;
      if (ent.code.overflow) overflow++;
      tot.passes[Math.min(2, ent.code.chords.length)]++;
    }
    tot.keys += ctx.cache.size; tot.codes += codes; tot.overflow += overflow; tot.ms += tc1 - tc0; tot.msVol += t1 - t0;
    tot.frags += ctx.stats.frags; tot.fetch += ctx.stats.fetchEarly;
    console.log(`chunk ${c.join(',')}: quads ${m.quadCount}, keys ${ctx.cache.size}, boundary codes ${codes} (overflow ${overflow}), code pass ${(tc1 - tc0).toFixed(1)} ms, volumes ${(t1 - t0).toFixed(1)} ms`);
  }
  const n = CHUNKS.length;
  console.log(`mean per chunk: keys ${(tot.keys / n).toFixed(0)}, boundary codes ${(tot.codes / n).toFixed(0)} (overflow ${(tot.overflow / n).toFixed(1)}), passes 0/1/2: ${tot.passes.map((v) => (v / n).toFixed(0)).join('/')}, code pass ${(tot.ms / n).toFixed(1)} ms (JS, per-block windows), volumes ${(tot.msVol / n).toFixed(1)} ms`);
} else {
  // seam test over chunk pairs sharing a face
  const pairs = [[[-1, 1, 1], [0, 1, 1]], [[-1, 1, 1], [-1, 1, 2]], [[0, 0, -3], [0, 0, -2]], [[0, 0, 0], [1, 0, 0]], [[-2, 1, 1], [-2, 1, 2]], [[0, 0, 0], [0, 1, 0]]];
  for (const [A, B] of pairs) {
    const ra = input(A), rb = input(B);
    const ma = core.decodeMesh(core.meshRegion(ra));
    const axis = [0, 1, 2].find((k) => A[k] !== B[k]);
    const off = [0, 0, 0];
    off[axis] = (B[axis] - A[axis]) * 32; // A-local = B-local + off
    const res = {};
    for (const [label, mk, dec, ev] of [['xbr2', (r) => makeCtx(buildVolume(r, 3), { W: 2 }), decideXbr, xbrEval], ['contour', contourCtx, decideContour, (code, e, fx, fy) => evalChords(code, e, fx, fy)]]) {
      const ca = mk(ra), cb = mk(rb);
      let n = 0, diff = 0;
      const info = { a: 0, x: 0, y: 0, z: 0, ownMat: 0 };
      // dense samples on A's quads near the shared face
      const { pos, nrm, tri } = ma;
      for (let t = 0; t < ma.T; t++) {
        const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
        const ctr = (pos[a * 3 + axis] + pos[b * 3 + axis] + pos[c * 3 + axis]) / 3;
        const border = B[axis] > A[axis] ? 32 : 0;
        if (Math.abs(ctr - border) > 1.0) continue;
        for (let i = 1; i < 8; i++) for (let j = 1; j < 8 - i; j++) {
          const w0 = i / 8, w1 = j / 8, w2 = 1 - w0 - w1;
          const p = [0, 0, 0], nn = [0, 0, 0];
          for (let k = 0; k < 3; k++) { p[k] = w0 * pos[a * 3 + k] + w1 * pos[b * 3 + k] + w2 * pos[c * 3 + k]; nn[k] = w0 * nrm[a * 3 + k] + w1 * nrm[b * 3 + k] + w2 * nrm[c * 3 + k]; }
          if (Math.abs(p[axis] - (B[axis] > A[axis] ? 32 : 0)) > 0.6) continue;
          info.a = a; info.ownMat = ma.mat[a];
          info.x = p[0]; info.y = p[1]; info.z = p[2];
          const mA = shade(ca, nn, info, { flags: ma.flags }, dec, ev);
          info.x = p[0] - off[0]; info.y = p[1] - off[1]; info.z = p[2] - off[2];
          const mB = shade(cb, nn, info, { flags: ma.flags }, dec, ev);
          n++;
          if (mA !== mB) diff++;
        }
      }
      res[label] = `${diff}/${n} differ, oob reads A ${ca.oob} B ${cb.oob}${ca.cpu ? `, CPU-window oob A ${ca.cpu.oob} B ${cb.cpu.oob}` : ''}`;
    }
    console.log(`${A.join(',')} | ${B.join(',')}: xbr2 ${res.xbr2}; contour ${res.contour}`);
  }
}
