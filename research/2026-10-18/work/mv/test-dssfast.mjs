import { DSS } from './dss.mjs';
import { FastDSS } from './dssfast.mjs';
let seed = 4242;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
let checks = 0, bad = 0;
for (let t = 0; t < 200000; t++) {
  // a random 4-connected path, biased to be DSS-like
  const n = 2 + Math.floor(rnd() * 30);
  const d1 = DIRS[Math.floor(rnd() * 4)];
  const d2 = DIRS[(DIRS.indexOf(d1) + 1 + 2 * Math.floor(rnd() * 2)) % 4];
  const slope = rnd() * 1.5, off = rnd();
  const pts = [[Math.floor(rnd() * 20) - 10, Math.floor(rnd() * 20) - 10]];
  let u = 0, v = 0;
  for (let i = 0; i < n; i++) {
    let d;
    if (rnd() < 0.1) d = DIRS[Math.floor(rnd() * 4)];
    else { const goV = v + 1 <= slope * (u + 0.5) + off; d = goV ? d2 : d1; if (goV) v++; else u++; }
    const p = pts[pts.length - 1];
    pts.push([p[0] + d[0], p[1] + d[1]]);
  }
  // grow from a random middle step outward, random order of front/back
  const s = Math.floor(rnd() * (pts.length - 1));
  const A = new DSS(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]);
  const B = new FastDSS(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]);
  let lo = s, hi = s + 1, okF = true, okB = true;
  while ((okF && hi + 1 < pts.length) || (okB && lo > 0)) {
    const front = okF && hi + 1 < pts.length && (!okB || lo === 0 || rnd() < 0.5);
    let ra, rb;
    if (front) { ra = A.addFront(...pts[hi + 1]); rb = B.addFront(...pts[hi + 1]); if (ra) hi++; else okF = false; }
    else { ra = A.addBack(...pts[lo - 1]); rb = B.addBack(...pts[lo - 1]); if (ra) lo--; else okB = false; }
    checks++;
    const la = A.centerLine(), lb = B.centerLine();
    if (ra !== rb || la.A !== lb.A || la.B !== lb.B || la.C !== lb.C || A.a !== B.a || A.b !== B.b) {
      bad++;
      if (bad < 5) console.log('mismatch', { ra, rb, la, lb, front, pts: pts.slice(lo, hi + 1) });
      break;
    }
  }
}
console.log(`checks ${checks}, mismatches ${bad}`);
// speed
const P = [];
for (let i = 0; i < 40; i++) P.push([i, Math.floor(i * 0.37)]);
for (const [Name, C] of [['DSS', DSS], ['FastDSS', FastDSS]]) {
  const t0 = performance.now();
  let k = 0;
  for (let r = 0; r < 20000; r++) { const d = new C(P[0][0], P[0][1], P[1][0], P[1][1]); for (let i = 2; i < 40; i++) if (d.addFront(P[i][0], P[i][1])) k++; else break; }
  console.log(Name, (performance.now() - t0).toFixed(1), 'ms', k);
}
