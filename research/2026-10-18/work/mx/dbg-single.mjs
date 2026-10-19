import { reconstruct, encodeChords, evalChords, evalSegments } from './contour.mjs';
const plan = (x, z) => (x === 16 && z === 16 ? 3 : 1);
const R = 7, S = 2 * R + 1;
for (const [cx, cz] of [[16, 16], [17, 16], [16, 15]]) {
  const img = new Int8Array(S * S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) img[j * S + i] = plan(cx - R + i, cz - R + j);
  const e = img[R * S + R];
  const o = { est: 'hybrid', hq: 6, cornerRun: 3, tauMax: 0.45, tieBreak: 'majority', longRun: true, capSide: 99, loneSquare: false, debug: [] };
  const segs = reconstruct(img, S, o);
  console.log('cell', cx, cz, 'e', e, 'segs', segs.map((s) => s.map((v) => +v.toFixed(2))), 'taus', o.debug.map((d) => d.tau.toFixed(2)).join(' '));
}
