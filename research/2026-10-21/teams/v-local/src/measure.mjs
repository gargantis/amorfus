// v-local measures on a field F(x, y, z) (> 0 solid).
const r4 = (v) => (v == null ? v : +v.toFixed(4));

/** Free interval along axis `ax` through p (F <= 0 at p), searched to +-maxT. */
export function freeRun(F, p, ax, maxT = 3, h = 0.005) {
  if (F(...p) > 0) return null;
  const q = p.slice();
  let up = 0, dn = 0;
  for (up = h; up <= maxT; up += h) { q[ax] = p[ax] + up; if (F(...q) > 0) break; }
  for (dn = h; dn <= maxT; dn += h) { q[ax] = p[ax] - dn; if (F(...q) > 0) break; }
  return [p[ax] - dn, p[ax] + up];
}

/** Solid run along axis through p (F > 0 at p). */
export function solidRun(F, p, ax, maxT = 3, h = 0.002) {
  if (!(F(...p) > 0)) return 0;
  const q = p.slice();
  let up = 0, dn = 0;
  for (up = h; up <= maxT; up += h) { q[ax] = p[ax] + up; if (!(F(...q) > 0)) break; }
  for (dn = h; dn <= maxT; dn += h) { q[ax] = p[ax] - dn; if (!(F(...q) > 0)) break; }
  return r4(up + dn - h);
}

/** Clearance of a 1x2 tunnel whose hole is x in [x0, x0+1], y in [y0, y0+2],
 *  running along z; at cuts zs. clearH70 = the largest clear height of a
 *  0.70-wide vertical window (min over cuts); width at mid-height; height at
 *  mid-width. */
export function tunnelClear(F, { x0 = 1, y0 = 1, zs = [0.75, 1.5, 2.25], axis = 'z' } = {}) {
  const P = (u, y, z) => (axis === 'z' ? [u, y, z] : [z, y, u]); // u = across-tunnel coordinate
  const G = (a, b, c) => F(...P(a, b, c));
  const per = [];
  for (const z of zs) {
    const xs = [];
    for (let x = x0 - 0.2; x <= x0 + 1.2 + 1e-9; x += 0.01) xs.push(x);
    const iv = xs.map((x) => freeRun((a, b, c) => G(a, b, c), [x, y0 + 1, z], 1, 3));
    let bestH = 0;
    const W = 70;
    for (let s = 0; s + W < xs.length; s++) {
      let lo = -Infinity, hi = Infinity, ok = true;
      for (let t = s; t <= s + W; t++) { if (!iv[t]) { ok = false; break; } lo = Math.max(lo, iv[t][0]); hi = Math.min(hi, iv[t][1]); }
      if (ok) bestH = Math.max(bestH, hi - lo);
    }
    const wRun = freeRun((a, b, c) => G(a, b, c), [x0 + 0.5, y0 + 1, z], 0, 3);
    const hRun = freeRun((a, b, c) => G(a, b, c), [x0 + 0.5, y0 + 1, z], 1, 3);
    per.push({ z, clearH70: r4(bestH), widthMid: wRun ? r4(wRun[1] - wRun[0]) : 0, heightMid: hRun ? r4(hRun[1] - hRun[0]) : 0 });
  }
  return { clearH70: Math.min(...per.map((q) => q.clearH70)), widthMid: Math.min(...per.map((q) => q.widthMid)), heightMid: Math.min(...per.map((q) => q.heightMid)), per };
}

/** Top surface height above (x, z), ray down from yTop. */
export function topY(F, x, z, yTop, yBot = -2, h = 0.002) {
  if (F(x, yTop, z) > 0) return null;
  for (let y = yTop - h; y >= yBot; y -= h) if (F(x, y, z) > 0) {
    let a = y, b = y + h;
    for (let i = 0; i < 30; i++) { const m = 0.5 * (a + b); if (F(x, m, z) > 0) a = m; else b = m; }
    return 0.5 * (a + b);
  }
  return null;
}
