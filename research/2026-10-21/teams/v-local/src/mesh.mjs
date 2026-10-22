// v-local: a surface-nets mesh from per-corner offsets (one vertex per mixed
// corner, one quad per face-adjacent solid/air pair, triangulated on the
// shorter diagonal), and ray casts against it. Mirrors PLAN 7.2's topology;
// used to measure clearances on the vertex rule's actual surface.
const key = (x, y, z) => `${x},${y},${z}`;

export function buildMesh(blocks, offs) {
  const solid = new Set(blocks.map((b) => key(b[0], b[1], b[2])));
  const V = (x, y, z) => { const o = offs.get(key(x, y, z)) ?? [0, 0, 0]; return [x + o[0], y + o[1], z + o[2]]; };
  const tris = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [bx, by, bz] of blocks) {
    for (const [dx, dy, dz] of dirs) {
      if (solid.has(key(bx + dx, by + dy, bz + dz))) continue;
      // face corners
      const ax = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
      const c0 = [bx, by, bz]; if ((dx || dy || dz) > 0) c0[ax] += 1;
      const u = (ax + 1) % 3, v = (ax + 2) % 3;
      const q = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => { const c = c0.slice(); c[u] += a; c[v] += b; return V(...c); });
      const d02 = dist2(q[0], q[2]), d13 = dist2(q[1], q[3]);
      if (d02 <= d13) { tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]); } else { tris.push([q[0], q[1], q[3]], [q[1], q[2], q[3]]); }
    }
  }
  return tris;
}
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** All ray parameters t where p + t d hits a triangle (Moller-Trumbore). */
export function hits(tris, p, d) {
  const out = [];
  for (const [a, b, c] of tris) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const s = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const uu = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
    if (uu < -1e-9 || uu > 1 + 1e-9) continue;
    const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const vv = f * (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]);
    if (vv < -1e-9 || uu + vv > 1 + 1e-9) continue;
    out.push(f * (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]));
  }
  return out;
}

/** Free interval along axis through p: nearest hits on each side. */
export function meshFree(tris, p, ax) {
  const d = [0, 0, 0]; d[ax] = 1;
  const ts = hits(tris, p, d);
  let up = Infinity, dn = -Infinity;
  for (const t of ts) { if (t > 1e-9 && t < up) up = t; if (t < -1e-9 && t > dn) dn = t; }
  return [p[ax] + dn, p[ax] + up];
}

/** Clearance of a 1x2 passage (hole x in [x0, x0+1], y in [y0, y0+2]) running along z, cut at zs. */
export function meshTunnel(tris, { x0 = 1, y0 = 1, zs = [1.5] } = {}) {
  const per = [];
  for (const z of zs) {
    const xs = []; for (let x = x0 - 0.2; x <= x0 + 1.2 + 1e-9; x += 0.01) xs.push(x);
    const iv = xs.map((x) => meshFree(tris, [x, y0 + 1, z], 1));
    let best = 0;
    for (let s = 0; s + 70 < xs.length; s++) {
      let lo = -Infinity, hi = Infinity;
      for (let t = s; t <= s + 70; t++) { lo = Math.max(lo, iv[t][0]); hi = Math.min(hi, iv[t][1]); }
      best = Math.max(best, hi - lo);
    }
    const w = meshFree(tris, [x0 + 0.5, y0 + 1, z], 0), h = meshFree(tris, [x0 + 0.5, y0 + 1, z], 1);
    per.push({ z, clearH70: +best.toFixed(4), widthMid: +(w[1] - w[0]).toFixed(4), heightMid: +(h[1] - h[0]).toFixed(4) });
  }
  return { clearH70: Math.min(...per.map((q) => q.clearH70)), widthMid: Math.min(...per.map((q) => q.widthMid)), heightMid: Math.min(...per.map((q) => q.heightMid)), per };
}

/** Solid extent along axis through p (between the hits bracketing p). */
export function meshSolidExtent(tris, p, ax) { const r = meshFree(tris, p, ax); return +(r[1] - r[0]).toFixed(4); }
