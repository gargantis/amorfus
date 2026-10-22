// v-table mesh-vs-physics scoring library.
//
// Mesh = the repo's topology: one vertex per mixed lattice corner (shared by
// all materials), one quad per solid/air face pair, each quad split on its
// shorter diagonal (0-2 on a tie), offsets quantised to 1/256 (mesher.ts
// pass 4/5). Physics surface = zero set of a field on the sim grid:
//   'D' the engine's render field (labels re-blurred by renderS = 1.5
//       sub-cells at n 12, volume-corrected; rounds creases ~0.1 block)
//   'L' the labels themselves: solid indicator blurred by 0.75 sub-cell,
//       level 1/2 (removes the sub-cell staircase, rounds creases ~0.03)
// Distances (blocks):
//   m2s  mesh -> sim: area-weighted over 36 uniform points per triangle,
//        to the sim surface (nearest cloud point, tangential offset up to
//        the cloud spacing discounted, i.e. point-to-surfel)
//   s2m  sim -> mesh: area-weighted over the sim surface cloud (crossings of
//        the field on sub-cell edges, weight 1/(|nx|+|ny|+|nz|)), exact
//        point-to-triangle distance
// Both restricted to the evaluation box E (the scene's evalLo..evalHi).
import { meshRegion } from './repo.mjs';

// ---------------- fields ----------------
export function makeField(c, kind) {
  const { NX, NY, NZ, n, ox, oy, oz } = c;
  let F;
  if (kind === 'D') F = c.D;
  else {
    F = new Float32Array(c.label.length);
    for (let i = 0; i < F.length; i++) F[i] = c.label[i] ? 1 : 0;
    blurSep(F, NX, NY, NZ, 0.75);
    for (let i = 0; i < F.length; i++) F[i] -= 0.5;
  }
  const at = (a, b, k) => F[(k * NY + b) * NX + a];
  const sample = (x, y, z) => {
    let gx = (x - ox) * n - 0.5, gy = (y - oy) * n - 0.5, gz = (z - oz) * n - 0.5;
    gx = Math.min(Math.max(gx, 0), NX - 1.000001); gy = Math.min(Math.max(gy, 0), NY - 1.000001); gz = Math.min(Math.max(gz, 0), NZ - 1.000001);
    const i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz);
    const fx = gx - i, fy = gy - j, fz = gz - k;
    const i1 = i + 1, j1 = j + 1, k1 = k + 1;
    const c00 = at(i, j, k) * (1 - fx) + at(i1, j, k) * fx;
    const c10 = at(i, j1, k) * (1 - fx) + at(i1, j1, k) * fx;
    const c01 = at(i, j, k1) * (1 - fx) + at(i1, j, k1) * fx;
    const c11 = at(i, j1, k1) * (1 - fx) + at(i1, j1, k1) * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  };
  const grad = (x, y, z) => {
    const e = 0.25 / n;
    return [(sample(x + e, y, z) - sample(x - e, y, z)) / (2 * e), (sample(x, y + e, z) - sample(x, y - e, z)) / (2 * e), (sample(x, y, z + e) - sample(x, y, z - e)) / (2 * e)];
  };
  return { F, sample, grad, NX, NY, NZ, n, ox, oy, oz, kind };
}

function blurSep(arr, w, h, d, s) {
  const R = Math.max(1, Math.ceil(3 * s));
  const k = new Float64Array(2 * R + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) { k[i + R] = Math.exp(-(i * i) / (2 * s * s)); sum += k[i + R]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const L = Math.max(w, h, d), line = new Float64Array(L), tmp = new Float64Array(L);
  for (const axis of [0, 1, 2]) {
    const len = axis === 0 ? w : axis === 1 ? h : d;
    const stride = axis === 0 ? 1 : axis === 1 ? w : w * h;
    const nA = axis === 0 ? h : w, nB = axis === 2 ? h : d;
    for (let b = 0; b < nB; b++) for (let a = 0; a < nA; a++) {
      const s0 = axis === 0 ? (b * h + a) * w : axis === 1 ? b * w * h + a : b * w + a;
      for (let i = 0; i < len; i++) line[i] = arr[s0 + i * stride];
      for (let i = 0; i < len; i++) {
        let acc = 0;
        for (let j = i - R; j <= i + R; j++) acc += k[j - i + R] * line[j < 0 ? 0 : j >= len ? len - 1 : j]; // clamp-to-edge, as the engine copy
        tmp[i] = acc;
      }
      for (let i = 0; i < len; i++) arr[s0 + i * stride] = tmp[i];
    }
  }
}

/** Surface cloud of a field inside box [lo, hi] (block coords). */
export function cloudOf(fd, lo, hi) {
  const { F, NX, NY, NZ, n, ox, oy, oz } = fd;
  const P = [], N = [], Wt = [];
  const cx = (i) => ox + (i + 0.5) / n, cy = (j) => oy + (j + 0.5) / n, cz = (k) => oz + (k + 0.5) / n;
  const i0 = Math.max(0, Math.floor((lo[0] - ox) * n - 1)), i1 = Math.min(NX - 1, Math.ceil((hi[0] - ox) * n));
  const j0 = Math.max(0, Math.floor((lo[1] - oy) * n - 1)), j1 = Math.min(NY - 1, Math.ceil((hi[1] - oy) * n));
  const k0 = Math.max(0, Math.floor((lo[2] - oz) * n - 1)), k1 = Math.min(NZ - 1, Math.ceil((hi[2] - oz) * n));
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const f0 = F[(k * NY + j) * NX + i];
    for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const ii = i + di, jj = j + dj, kk = k + dk;
      if (ii > i1 || jj > j1 || kk > k1) continue;
      const f1 = F[(kk * NY + jj) * NX + ii];
      if ((f0 > 0) === (f1 > 0)) continue;
      const t = f0 / (f0 - f1);
      const p = [cx(i) + di * t / n, cy(j) + dj * t / n, cz(k) + dk * t / n];
      if (p[0] < lo[0] || p[1] < lo[1] || p[2] < lo[2] || p[0] > hi[0] || p[1] > hi[1] || p[2] > hi[2]) continue;
      const g = fd.grad(p[0], p[1], p[2]);
      const gl = Math.hypot(g[0], g[1], g[2]) || 1;
      const nn = [-g[0] / gl, -g[1] / gl, -g[2] / gl]; // outward (field > 0 inside)
      P.push(p[0], p[1], p[2]); N.push(nn[0], nn[1], nn[2]);
      Wt.push(1 / (n * n * (Math.abs(nn[0]) + Math.abs(nn[1]) + Math.abs(nn[2]))));
    }
  }
  return { P: Float64Array.from(P), N: Float64Array.from(N), W: Float64Array.from(Wt), count: Wt.length, h: 1 / n };
}

/** Bucket index of a cloud for nearest queries. */
export function indexCloud(cl, lo, hi, bs = 0.25) {
  const o = lo.map((v) => v - 1.5), dims = [0, 1, 2].map((t) => Math.ceil((hi[t] - lo[t] + 3) / bs));
  const nb = dims[0] * dims[1] * dims[2];
  const cnt = new Int32Array(nb + 1);
  const key = (x, y, z) => {
    const a = Math.floor((x - o[0]) / bs), b = Math.floor((y - o[1]) / bs), c = Math.floor((z - o[2]) / bs);
    if (a < 0 || b < 0 || c < 0 || a >= dims[0] || b >= dims[1] || c >= dims[2]) return -1;
    return (c * dims[1] + b) * dims[0] + a;
  };
  const keys = new Int32Array(cl.count);
  for (let p = 0; p < cl.count; p++) { keys[p] = key(cl.P[3 * p], cl.P[3 * p + 1], cl.P[3 * p + 2]); if (keys[p] >= 0) cnt[keys[p] + 1]++; }
  for (let i = 0; i < nb; i++) cnt[i + 1] += cnt[i];
  const items = new Int32Array(cnt[nb]);
  const fill = cnt.slice();
  for (let p = 0; p < cl.count; p++) if (keys[p] >= 0) items[fill[keys[p]]++] = p;
  return { o, dims, bs, start: cnt, items };
}

/** Unsigned distance from q to the cloud's surface (surfel), capped. */
export function distToCloud(cl, ix, q, cap = 1) {
  const { o, dims, bs, start, items } = ix;
  const hs = 0.75 * cl.h;
  let best = cap * cap, bp = -1;
  const a0 = Math.floor((q[0] - o[0]) / bs), b0 = Math.floor((q[1] - o[1]) / bs), c0 = Math.floor((q[2] - o[2]) / bs);
  for (let r = 1; r <= Math.ceil(cap / bs) + 1; r++) {
    for (let c = c0 - r; c <= c0 + r; c++) for (let b = b0 - r; b <= b0 + r; b++) for (let a = a0 - r; a <= a0 + r; a++) {
      if (Math.max(Math.abs(a - a0), Math.abs(b - b0), Math.abs(c - c0)) !== r && r > 1) continue;
      if (a < 0 || b < 0 || c < 0 || a >= dims[0] || b >= dims[1] || c >= dims[2]) continue;
      const k = (c * dims[1] + b) * dims[0] + a;
      for (let s = start[k]; s < start[k + 1]; s++) {
        const p = items[s];
        const dx = q[0] - cl.P[3 * p], dy = q[1] - cl.P[3 * p + 1], dz = q[2] - cl.P[3 * p + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) { best = d2; bp = p; }
      }
    }
    if (bp >= 0 && Math.sqrt(best) < (r - 1) * bs) break; // nothing closer outside the searched ring
  }
  if (bp < 0) return cap;
  const dx = q[0] - cl.P[3 * bp], dy = q[1] - cl.P[3 * bp + 1], dz = q[2] - cl.P[3 * bp + 2];
  const dn = dx * cl.N[3 * bp] + dy * cl.N[3 * bp + 1] + dz * cl.N[3 * bp + 2];
  const t2 = Math.max(0, best - dn * dn);
  return Math.sqrt(Math.max(0, best - Math.min(t2, hs * hs)));
}

// ---------------- mesh ----------------
/** Mixed corners with lattice coords in [lo, hi] and the quads between them.
 *  get(x,y,z) -> material (0 air). Corner C touches blocks C-1..C. */
export function topology(get, lo, hi) {
  const corners = new Map(); // key -> {c:[x,y,z], lab8}
  const ck = (x, y, z) => `${x},${y},${z}`;
  for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    const lab8 = [];
    let s = 0;
    for (let b = 0; b < 8; b++) { const v = get(x - 1 + (b & 1), y - 1 + ((b >> 2) & 1), z - 1 + ((b >> 1) & 1)); lab8.push(v); if (v) s++; }
    if (s === 0 || s === 8) continue;
    corners.set(ck(x, y, z), { c: [x, y, z], lab8 });
  }
  const quads = []; // {k:[4 corner keys], ctr:[x,y,z], axis}
  for (let y = lo[1] - 1; y <= hi[1]; y++) for (let z = lo[2] - 1; z <= hi[2]; z++) for (let x = lo[0] - 1; x <= hi[0]; x++) {
    const s0 = get(x, y, z) ? 1 : 0;
    for (let axis = 0; axis < 3; axis++) {
      const x1 = x + (axis === 0), y1 = y + (axis === 1), z1 = z + (axis === 2);
      if ((get(x1, y1, z1) ? 1 : 0) === s0) continue;
      let cs;
      if (axis === 0) cs = [[x1, y, z], [x1, y + 1, z], [x1, y + 1, z + 1], [x1, y, z + 1]];
      else if (axis === 1) cs = [[x, y1, z], [x + 1, y1, z], [x + 1, y1, z + 1], [x, y1, z + 1]];
      else cs = [[x, y, z1], [x + 1, y, z1], [x + 1, y + 1, z1], [x, y + 1, z1]];
      const keys = cs.map((c) => ck(...c));
      if (!keys.every((k) => corners.has(k))) continue;
      const ctr = [0, 1, 2].map((t) => (cs[0][t] + cs[2][t]) / 2);
      quads.push({ k: keys, ctr, axis });
    }
  }
  return { corners, quads };
}

/** Positions (quantised to 1/256) of all corners from an offset map. */
export function positions(topo, off) {
  const pos = new Map();
  for (const [k, { c }] of topo.corners) {
    const o = off.get(k) ?? [0, 0, 0];
    pos.set(k, [c[0] + Math.round(o[0] * 256) / 256, c[1] + Math.round(o[1] * 256) / 256, c[2] + Math.round(o[2] * 256) / 256]);
  }
  return pos;
}

/** Two triangles of a quad on the shorter diagonal (0-2 on a tie). */
export function quadTris(q, pos) {
  const p = q.k.map((k) => pos.get(k));
  const d = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  return d(p[0], p[2]) <= d(p[1], p[3]) ? [[p[0], p[1], p[2]], [p[0], p[2], p[3]]] : [[p[1], p[2], p[3]], [p[1], p[3], p[0]]];
}

const inBox = (p, lo, hi) => p[0] >= lo[0] && p[1] >= lo[1] && p[2] >= lo[2] && p[0] <= hi[0] && p[1] <= hi[1] && p[2] <= hi[2];

// exact point-triangle distance (Ericson, Real-Time Collision Detection 5.1.5)
export function ptTri(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const dd = (q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  if (d1 <= 0 && d2 <= 0) return dd(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dd(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return dd([a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]); }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dd(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return dd([a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return dd([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return dd([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

// 36 centroids of a 6x6 barycentric subdivision (uniform area weights)
const BARY = (() => {
  const K = 6, out = [];
  for (let i = 0; i < K; i++) for (let j = 0; j < K - i; j++) {
    out.push([(i + 1 / 3) / K, (j + 1 / 3) / K]);
    if (i + j < K - 1) out.push([(i + 2 / 3) / K, (j + 2 / 3) / K]);
  }
  return out;
})();
const triArea = (t) => {
  const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], v = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
  return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
};

/** Mesh->sim contribution of one quad: [sum d*area, sum area, sum signed d*area, list of d (for p95)] */
export function quadM2S(q, pos, cl, ix, fd) {
  let sd = 0, sa = 0, ss = 0;
  const ds = [];
  for (const t of quadTris(q, pos)) {
    const A = triArea(t) / BARY.length;
    for (const [u, v] of BARY) {
      const x = [0, 1, 2].map((k) => t[0][k] + u * (t[1][k] - t[0][k]) + v * (t[2][k] - t[0][k]));
      const d = distToCloud(cl, ix, x);
      const inside = fd.sample(x[0], x[1], x[2]) > 0;
      sd += d * A; sa += A; ss += (inside ? -d : d) * A; ds.push(d);
    }
  }
  return { sd, sa, ss, ds };
}

/** Triangle buckets (1-block, keyed by the quad's lattice centre). */
export function bucketQuads(quads) {
  const m = new Map();
  quads.forEach((q, i) => { const k = q.ctr.map((v) => Math.floor(v)).join(','); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
  return m;
}
export function candQuads(bq, p) {
  const out = [];
  const a = Math.floor(p[0]), b = Math.floor(p[1]), c = Math.floor(p[2]);
  for (let z = c - 1; z <= c + 1; z++) for (let y = b - 1; y <= b + 1; y++) for (let x = a - 1; x <= a + 1; x++) {
    const l = bq.get(`${x},${y},${z}`); if (l) for (const i of l) out.push(i);
  }
  return out;
}

const pctl = (a, q) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/** Full score of one placement. lo/hi = evaluation box E. */
export function scoreMesh(topo, pos, cl, ix, fd, lo, hi, opts = {}) {
  const { quads } = topo;
  let sd = 0, sa = 0, ss = 0;
  const m2sAll = [];
  quads.forEach((q) => {
    if (!inBox(q.ctr, lo, hi)) return;
    const r = quadM2S(q, pos, cl, ix, fd);
    sd += r.sd; sa += r.sa; ss += r.ss; for (const d of r.ds) m2sAll.push(d);
  });
  const tris = quads.map((q) => quadTris(q, pos));
  const bq = bucketQuads(quads);
  let s2 = 0, sw = 0;
  const s2mAll = [];
  const sc = opts.sCloud ?? cl; // sim points: only inside E; the m2s cloud may reach beyond E
  for (let p = 0; p < sc.count; p++) {
    const x = [sc.P[3 * p], sc.P[3 * p + 1], sc.P[3 * p + 2]];
    let best = 1;
    for (const qi of candQuads(bq, x)) for (const t of tris[qi]) { const d = ptTri(x, t[0], t[1], t[2]); if (d < best) best = d; }
    s2 += best * sc.W[p]; sw += sc.W[p]; s2mAll.push(best);
  }
  const m2s = sd / Math.max(1e-12, sa), s2m = s2 / Math.max(1e-12, sw);
  return { m2s: +m2s.toFixed(4), s2m: +s2m.toFixed(4), sym: +((m2s + s2m) / 2).toFixed(4), bias: +(ss / Math.max(1e-12, sa)).toFixed(4),
    m2sP95: +(pctl(m2sAll, 0.95) ?? NaN).toFixed(4), s2mP95: +(pctl(s2mAll, 0.95) ?? NaN).toFixed(4), meshArea: +sa.toFixed(3), simArea: +sw.toFixed(3) };
}

// ---------------- vertex placements ----------------
/** On-surface vertex: mean of field zero crossings on the 12 cell edges
 *  (block centre to block centre), Newton-projected onto the zero set,
 *  clamped to the cell (team table's vsn recipe, own implementation). */
export function onSurface(fd, C) {
  const OCT = [];
  for (let b = 0; b < 8; b++) OCT.push([b & 1, (b >> 2) & 1, (b >> 1) & 1]);
  const at = (d) => [C[0] + d[0], C[1] + d[1], C[2] + d[2]];
  const f = (d) => { const p = at(d); return fd.sample(p[0], p[1], p[2]); };
  const pts = [];
  for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) {
    const b = a ^ bit; if (b < a) continue;
    const pa = OCT[a].map((v) => v - 0.5), pb = OCT[b].map((v) => v - 0.5);
    let prev = f(pa) > 0, prevT = 0;
    for (let s = 1; s <= 32; s++) {
      const t = s / 32, q = pa.map((v, i) => v + (pb[i] - v) * t), sg = f(q) > 0;
      if (sg !== prev) {
        let lo = prevT, hi = t;
        for (let it = 0; it < 20; it++) { const m = 0.5 * (lo + hi); if ((f(pa.map((v, i) => v + (pb[i] - v) * m)) > 0) === prev) lo = m; else hi = m; }
        const tm = 0.5 * (lo + hi); pts.push(pa.map((v, i) => v + (pb[i] - v) * tm)); prev = sg;
      }
      prevT = t;
    }
  }
  if (!pts.length) return null;
  let v = [0, 1, 2].map((i) => pts.reduce((s, q) => s + q[i], 0) / pts.length);
  for (let it = 0; it < 10; it++) {
    const p = at(v), d = fd.sample(p[0], p[1], p[2]), g = fd.grad(p[0], p[1], p[2]);
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (g2 < 1e-10) break;
    let s = d / g2; const L = Math.abs(s) * Math.sqrt(g2); if (L > 0.2) s *= 0.2 / L;
    v = [v[0] - s * g[0], v[1] - s * g[1], v[2] - s * g[2]];
    if (Math.abs(d) < 1e-5) break;
  }
  return v.map((x) => Math.max(-0.5, Math.min(0.5, x)));
}

/** Offsets from the repo mesher (rule 'bevel' or 'hints') for every corner
 *  of a box. get/hint = world getters; se = shape-edited flag for solids. */
export function mesherOffsets(get, hint, lo, hi, rule, se = 0) {
  const AP = 3;
  const x0 = lo[0] - AP, y0 = lo[1] - AP, z0 = lo[2] - AP;
  const nx = hi[0] - lo[0] + 1 + 2 * AP, ny = hi[1] - lo[1] + 1 + 2 * AP, nz = hi[2] - lo[2] + 1 + 2 * AP;
  const total = nx * ny * nz;
  const blocks = new Uint16Array(total), rho = new Float32Array(total), shapeEdited = new Uint8Array(total);
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = y * nx * nz + z * nx + x, m = get(x0 + x, y0 + y, z0 + z);
    blocks[i] = m;
    rho[i] = hint ? hint(x0 + x, y0 + y, z0 + z) / 127 : (m ? 1 : -1);
    shapeEdited[i] = m && se ? 1 : 0;
  }
  const input = { nx, ny, nz, apron: AP, blocks, rho, shapeEdited };
  const res = meshRegion({ ...input, params: { rule } });
  const zero = meshRegion({ ...input, params: { rule, forceZeroOffsets: true } });
  if (zero.vertexCount !== res.vertexCount) throw new Error('vertex order differs');
  const map = new Map();
  for (let v = 0; v < res.vertexCount; v++) {
    const c = [0, 1, 2].map((t) => Math.round(zero.positions[v * 3 + t]));
    const w = [c[0] + x0 + AP, c[1] + y0 + AP, c[2] + z0 + AP];
    const key = w.join(',');
    if (!map.has(key)) map.set(key, [0, 1, 2].map((t) => res.positions[v * 3 + t] - c[t]));
  }
  return map;
}
