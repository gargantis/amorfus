// mx-contour: rasterisation-consistent contour reconstruction per surface
// block, in the dominant plane of the smooth normal; hints geometry.
//  CPU (mesh job): for each surface block a fragment can land on, gather a
//  15×15 surface-followed window (R = 7) of the plane image; cracks between
//  differing blocks link into chains (xBR weighted distance decides
//  diagonal saddles, ties pinned); corners where two runs ≥ 3 meet, finger
//  ends and lone blocks keep their corners; each crack's crossing slides
//  only along its dual edge (|τ| ≤ 0.45, so every block centre keeps its
//  material), placed by a TLS line over the maximal digital-straight window
//  (≥ 9 cracks) or else a parabola over ±6 cracks.
//  Code per (block, direction): ≤ 2 boundary passages through the cell, each
//  = entry and exit on the cell edge (6 bits each, 1/16 per edge), an optional
//  interior point (5+5 bits) and the far material (3 bits): 64 bits.
//  GPU (fragment): locate the surface block as mx-xbr2 (1–3 fetches), fetch
//  its code, test ≤ 4 segments (crossing parity from the cell centre).
import { makeApproach, gatherWindow } from '../work/mx/mxlib.mjs';
import { reconstruct, encodeChords, evalChords } from '../work/mx/contour.mjs';
export const name = 'mx-contour';
export const describe = 'Contour reconstruction per surface block (15×15 surface-followed window; cracks slide along dual edges |τ|≤0.45; xBR saddles; corners/finger ends kept; TLS over digital-straight windows else parabola ±6), encoded as ≤2 quantised passages (64 bits) per block; fragment locates its block and tests ≤4 segments; hints geometry.';
const R = 7;
export const OPTS = { est: 'hybrid', hq: 6, cornerRun: 3, tauMax: 0.45, tieBreak: true, longRun: true, capSide: 99 };
const A = makeApproach({
  name, ta: 3, W: 2, cpuTa: 9,
  decide: (nb, c, ctx) => {
    const img = gatherWindow(ctx.cpu, c.a, c.s, c.cu, c.cv, c.L, R, c.L - R + 1, c.L + R - 1);
    return encodeChords(reconstruct(img, 2 * R + 1, OPTS), img[R * (2 * R + 1) + R], true);
  },
  evalc: (code, e, fx, fy) => evalChords(code, e, fx, fy),
});
export const mesh = A.mesh;
export const fragment = A.fragment;
