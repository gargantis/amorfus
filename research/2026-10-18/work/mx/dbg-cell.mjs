import { reconstruct, encodeChords, evalChords, evalSegments } from './contour.mjs';
const c = [16.13, 16.37], r = 2.4;
const plan = (x, z) => (Math.hypot(x + 0.5 - c[0], z + 0.5 - c[1]) < r ? 3 : 1);
const [cx, cz] = [Number(process.argv[2] ?? 18), Number(process.argv[3] ?? 16)];
const R = 7, S = 2 * R + 1;
const img = new Int8Array(S * S);
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) img[j * S + i] = plan(cx - R + i, cz - R + j);
const e = img[R * S + R];
const segs = reconstruct(img, S, { R, cornerRun: 3, est: 'hybrid', hq: 6 });
console.log('e', e, 'segs'); for (const s of segs) console.log(s.map((v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
const code = encodeChords(segs, e, true);
console.log(JSON.stringify(code));
let row = '';
for (let j = 0; j < 8; j++) { row = ''; for (let i = 0; i < 16; i++) { const fx = (i + 0.5) / 16, fy = (j + 0.5) / 8; row += evalSegments(segs, e, fx, fy) === 3 ? '#' : '.'; row += evalChords(code, e, fx, fy) === 3 ? '#' : '.'; } console.log(row); }
