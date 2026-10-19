import { DSS, bruteDSS } from './dss.mjs';
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function randomPath() {
  const n = 1 + Math.floor(rnd() * 24);
  const kind = rnd();
  const pts = [Math.floor(rnd() * 10) - 5, Math.floor(rnd() * 10) - 5];
  if (kind < 0.5) {
    // a true digital line with random slope/offset, in a random quadrant
    const h = DIRS[Math.floor(rnd() * 2) * 2], v = DIRS[1 + Math.floor(rnd() * 2) * 2];
    const slope = rnd() * 3, off = rnd();
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      // step vertical if the line is above the next corner
      const goV = (z + 1) <= slope * (x + 0.5) + off - 0.5 + 0.5;
      const d = goV ? v : h;
      if (goV) z++; else x++;
      pts.push(pts[pts.length - 2] + d[0], pts[pts.length - 1] + d[1]);
    }
  } else {
    const d1 = DIRS[Math.floor(rnd() * 4)];
    const d2 = rnd() < 0.15 ? DIRS[Math.floor(rnd() * 4)] : DIRS[(DIRS.indexOf(d1) + 1 + 2 * Math.floor(rnd() * 2)) % 4];
    for (let i = 0; i < n; i++) {
      const d = rnd() < 0.3 ? d2 : d1;
      pts.push(pts[pts.length - 2] + d[0], pts[pts.length - 1] + d[1]);
    }
  }
  return pts;
}
let checked = 0, bad = 0, dssCount = 0;
for (let t = 0; t < 40000; t++) {
  const pts = randomPath();
  const n = pts.length / 2;
  // build by a random mix of front/back additions from a random start step
  const s = Math.floor(rnd() * (n - 1));
  const d = new DSS(pts[s * 2], pts[s * 2 + 1], pts[s * 2 + 2], pts[s * 2 + 3]);
  let lo = s, hi = s + 1, ok = true;
  while (ok && (lo > 0 || hi < n - 1)) {
    if (hi < n - 1 && (lo === 0 || rnd() < 0.5)) { hi++; ok = d.addFront(pts[hi * 2], pts[hi * 2 + 1]); if (!ok) hi--; }
    else { lo--; ok = d.addBack(pts[lo * 2], pts[lo * 2 + 1]); if (!ok) lo++; }
  }
  // the recognised part [lo, hi] must be a DSS with minimal a+b; if it
  // stopped early, adding the failing point must not be a DSS.
  const sub = pts.slice(lo * 2, hi * 2 + 2);
  const br = bruteDSS(sub);
  checked++;
  if (!br) { bad++; console.log('recognised non-DSS', JSON.stringify(sub)); continue; }
  dssCount++;
  // check strip with recogniser's a, b, mu in its frame
  const sx = d.sx || 1, sz = d.sz || 1;
  let rlo = Infinity, rhi = -Infinity;
  for (let i = 0; i < sub.length / 2; i++) { const r = d.a * sx * sub[i * 2] - d.b * sz * sub[i * 2 + 1]; rlo = Math.min(rlo, r); rhi = Math.max(rhi, r); }
  if (rlo < d.mu || rhi > d.mu + d.a + d.b - 1) { bad++; console.log('strip violated', JSON.stringify(sub), d.a, d.b, d.mu, rlo, rhi); }
  if (d.a + d.b !== br.a + br.b) { bad++; console.log('not minimal', JSON.stringify(sub), [d.a, d.b], br); }
  if (!ok) {
    // which side failed? test both possible extensions
    const ext1 = hi < n - 1 ? pts.slice(lo * 2, hi * 2 + 4) : null;
    const ext2 = lo > 0 ? pts.slice(lo * 2 - 2, hi * 2 + 2) : null;
    // at least one of them was attempted and must be non-DSS; we only know
    // the loop stopped on a failure, so check that the failing one is non-DSS
    const f1 = ext1 ? bruteDSS(ext1) : 'na', f2 = ext2 ? bruteDSS(ext2) : 'na';
    if (f1 !== null && f2 !== null) { bad++; console.log('stopped but both extensions are DSS', JSON.stringify(sub)); }
  }
}
console.log({ checked, dssCount, bad });
