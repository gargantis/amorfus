import { DSS, bruteDSS } from './dss.mjs';
let seed = 777;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function randomPath() {
  const n = 2 + Math.floor(rnd() * 30);
  const pts = [0, 0];
  const d1 = DIRS[Math.floor(rnd() * 4)];
  const d2 = DIRS[(DIRS.indexOf(d1) + 1 + 2 * Math.floor(rnd() * 2)) % 4];
  const p = rnd();
  let mode = rnd();
  for (let i = 0; i < n; i++) {
    let d;
    if (mode < 0.6) {
      // digital line-ish with occasional noise
      const slope = p * 2;
      const cnt = pts.length / 2;
      d = rnd() < 0.08 ? (rnd() < 0.5 ? d1 : d2) : null;
      if (!d) {
        // follow line z = slope * x in local (d1, d2) frame
        let u = 0, v = 0;
        for (let k = 1; k < cnt; k++) { const dx = pts[k * 2] - pts[k * 2 - 2], dz = pts[k * 2 + 1] - pts[k * 2 - 1]; if (dx === d1[0] && dz === d1[1]) u++; else v++; }
        d = (v + 1) <= slope * (u + 0.5) + 0.3 ? d2 : d1;
      }
    } else d = rnd() < p ? d2 : d1;
    if (rnd() < 0.02) d = DIRS[Math.floor(rnd() * 4)];
    pts.push(pts[pts.length - 2] + d[0], pts[pts.length - 1] + d[1]);
  }
  return pts;
}
let checked = 0, bad = 0, fails = 0, lens = 0;
for (let t = 0; t < 30000; t++) {
  const pts = randomPath();
  const n = pts.length / 2;
  const s = Math.floor(rnd() * (n - 1));
  const d = new DSS(pts[s * 2], pts[s * 2 + 1], pts[s * 2 + 2], pts[s * 2 + 3]);
  let lo = s, hi = s + 1;
  const order = rnd() < 0.5;
  const goFront = () => { while (hi < n - 1) { if (!d.addFront(pts[hi * 2 + 2], pts[hi * 2 + 3])) { fails++; if (bruteDSS(pts.slice(lo * 2, hi * 2 + 4))) { bad++; console.log('false front fail', JSON.stringify(pts.slice(lo * 2, hi * 2 + 4))); } break; } hi++; } };
  const goBack = () => { while (lo > 0) { if (!d.addBack(pts[lo * 2 - 2], pts[lo * 2 - 1])) { fails++; if (bruteDSS(pts.slice(lo * 2 - 2, hi * 2 + 2))) { bad++; console.log('false back fail', JSON.stringify(pts.slice(lo * 2 - 2, hi * 2 + 2))); } break; } lo--; } };
  if (order) { goFront(); goBack(); } else { goBack(); goFront(); }
  const sub = pts.slice(lo * 2, hi * 2 + 2);
  const br = bruteDSS(sub);
  checked++; lens += hi - lo;
  if (!br) { bad++; console.log('accepted non-DSS', JSON.stringify(sub)); continue; }
  const sx = d.sx || 1, sz = d.sz || 1;
  let rlo = Infinity, rhi = -Infinity;
  for (let i = 0; i < sub.length / 2; i++) { const r = d.a * sx * sub[i * 2] - d.b * sz * sub[i * 2 + 1]; rlo = Math.min(rlo, r); rhi = Math.max(rhi, r); }
  if (rlo < d.mu || rhi > d.mu + d.a + d.b - 1) { bad++; console.log('strip violated'); }
  if (d.a + d.b !== br.a + br.b) { bad++; console.log('not minimal', JSON.stringify(sub), [d.a, d.b], br); }
  if (d.length !== hi - lo) { bad++; console.log('length mismatch'); }
}
console.log({ checked, fails, bad, meanLen: (lens / checked).toFixed(1) });
