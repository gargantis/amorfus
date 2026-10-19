// Jaggedness metrics. All distances are in blocks, angles in degrees.
//
// Material boundaries (plan view, S samples per block): every pair of
// 4-adjacent samples whose materials form the measured pair gives one
// boundary point; its signed distance to the ideal curve is collected.
//   mean   — offset of the whole boundary (area bias, not jaggedness)
//   std    — JAGGEDNESS: spread of the boundary about its own mean offset
//   maxDev — worst single excursion from that mean
// A raw block staircase scores std ≈ 0.1–0.3; a perfect curve scores ≈ 0.
// Surfaces: vertex distance to the ideal surface (std/maxDev again),
// shading-normal error (what smooth or flat shading shows), face-normal
// error, crease (dihedral angle between neighbouring triangles: visible
// facets), and for terraces/towers the plan outline at mid-height.
import { stats, faceNormal, angleDeg, vertexIsFlat } from './core.mjs';

const DEG = Math.PI / 180;

export function boundaryPoints(img, A, B) {
  const { W, H, S, x0, z0, mat } = img;
  const pts = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W - 1; i++) {
      const m1 = mat[j * W + i], m2 = mat[j * W + i + 1];
      if ((m1 === A && m2 === B) || (m1 === B && m2 === A)) pts.push([x0 + (i + 1) / S, z0 + (j + 0.5) / S]);
    }
  }
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W; i++) {
      const m1 = mat[j * W + i], m2 = mat[(j + 1) * W + i];
      if ((m1 === A && m2 === B) || (m1 === B && m2 === A)) pts.push([x0 + (i + 0.5) / S, z0 + (j + 1) / S]);
    }
  }
  return pts;
}

export function idealDistance(ideal, p) {
  switch (ideal.kind) {
    case 'line': {
      return (p[0] - ideal.p0[0]) * -Math.sin(ideal.theta) + (p[1] - ideal.p0[1]) * Math.cos(ideal.theta);
    }
    case 'band': {
      const d = (p[0] - ideal.p0[0]) * -Math.sin(ideal.theta) + (p[1] - ideal.p0[1]) * Math.cos(ideal.theta);
      return Math.abs(d) - ideal.hw;
    }
    case 'disc':
      return Math.hypot(p[0] - ideal.c[0], p[1] - ideal.c[1]) - ideal.r;
    case 'rect': {
      const cx = (ideal.lo[0] + ideal.hi[0]) / 2, cz = (ideal.lo[1] + ideal.hi[1]) / 2;
      const hx = (ideal.hi[0] - ideal.lo[0]) / 2, hz = (ideal.hi[1] - ideal.lo[1]) / 2;
      const qx = Math.abs(p[0] - cx) - hx, qz = Math.abs(p[1] - cz) - hz;
      return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    }
    default:
      throw new Error(`unknown ideal ${ideal.kind}`);
  }
}

function inIdealWindow(ideal, p) {
  if (ideal.window) {
    const [a, b, c, d] = ideal.window;
    if (p[0] < a || p[0] > c || p[1] < b || p[1] > d) return false;
  }
  if (ideal.ray) {
    const { c, dir, min } = ideal.ray;
    if ((p[0] - c[0]) * Math.cos(dir) + (p[1] - c[1]) * Math.sin(dir) < min) return false;
  }
  return true;
}

function sampleAt(img, x, z) {
  const i = Math.floor((x - img.x0) * img.S), j = Math.floor((z - img.z0) * img.S);
  if (i < 0 || j < 0 || i >= img.W || j >= img.H) return 0;
  return img.mat[j * img.W + i];
}

export function materialMetrics(img, scene) {
  const out = { boundaries: [] };
  for (const ideal of scene.ideals ?? []) {
    const pts = boundaryPoints(img, ideal.pair[0], ideal.pair[1]).filter((p) => inIdealWindow(ideal, p));
    if (ideal.kind === 'band') {
      // the two edges of a band are separate boundaries: score each about
      // its own mean, report the worse one (and both means)
      const sides = [[], []];
      for (const p of pts) {
        const d = (p[0] - ideal.p0[0]) * -Math.sin(ideal.theta) + (p[1] - ideal.p0[1]) * Math.cos(ideal.theta);
        sides[d >= 0 ? 0 : 1].push(Math.abs(d) - ideal.hw);
      }
      const a = stats(sides[0]), b = stats(sides[1]);
      const worse = (a.std ?? 0) >= (b.std ?? 0) ? a : b;
      out.boundaries.push({ label: ideal.label, ...worse, n: (a.n ?? 0) + (b.n ?? 0), sideMeans: [a.mean ?? null, b.mean ?? null] });
      continue;
    }
    const s = stats(pts.map((p) => idealDistance(ideal, p)));
    out.boundaries.push({ label: ideal.label, ...s });
  }
  // area and connectivity of the feature material inside the window
  const [wx0, wz0, wx1, wz1] = scene.window;
  const { W, S, mat } = img;
  let samples = 0;
  const i0 = Math.round((wx0 - img.x0) * S), i1 = Math.round((wx1 - img.x0) * S);
  const j0 = Math.round((wz0 - img.z0) * S), j1 = Math.round((wz1 - img.z0) * S);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (mat[j * W + i] === scene.feature) samples++;
  let cells = 0;
  for (let z = wz0; z < wz1; z++) for (let x = wx0; x < wx1; x++) if (scene.plan(x, z) === scene.feature) cells++;
  out.area = { rendered: samples / (S * S), cells, ratio: cells > 0 ? samples / (S * S) / cells : null };
  // 4-connected components of the feature (specks under 1% of a block ignored)
  const seen = new Uint8Array(mat.length);
  let comps = 0, specks = 0;
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const k = j * W + i;
      if (seen[k] || mat[k] !== scene.feature) continue;
      let size = 0;
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const q = stack.pop();
        size++;
        const qi = q % W, qj = (q - qi) / W;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = qi + di, nj = qj + dj;
          if (ni < i0 || nj < j0 || ni >= i1 || nj >= j1) continue;
          const nk = nj * W + ni;
          if (!seen[nk] && mat[nk] === scene.feature) { seen[nk] = 1; stack.push(nk); }
        }
      }
      if (size >= 0.01 * S * S) comps++; else specks++;
    }
  }
  out.components = comps;
  out.specks = specks;
  // band width profile across thin lines: pinches show as min ≈ 0
  if (scene.band) {
    const { p0, theta, hw, xRange } = scene.band;
    const dir = [Math.cos(theta), Math.sin(theta)], n = [-Math.sin(theta), Math.cos(theta)];
    const widths = [];
    const step = 1 / (4 * S);
    for (let x = xRange[0]; x <= xRange[1]; x += 0.02) {
      const t = (x - p0[0]) / dir[0];
      const q = [p0[0] + t * dir[0], p0[1] + t * dir[1]];
      let count = 0;
      for (let s = -1.6; s <= 1.6; s += step) if (sampleAt(img, q[0] + s * n[0], q[1] + s * n[1]) === scene.feature) count++;
      widths.push(count * step);
    }
    const ws = stats(widths);
    out.width = { ideal: 2 * hw, min: Math.min(...widths), mean: ws.mean, max: Math.max(...widths), std: ws.std };
  }
  return out;
}

// ------------------------------------------------------------ geometry
const qkey = (pos, v) => `${Math.round(pos[v * 3] * 256)},${Math.round(pos[v * 3 + 1] * 256)},${Math.round(pos[v * 3 + 2] * 256)}`;

export function geometryMetrics(mesh, scene, { flatShading = false } = {}) {
  const g = scene.ideal;
  const out = {};
  const { pos, nrm, tri, T, V } = mesh;
  const fn = [0, 0, 0, 0];
  if (g.sdf) {
    const ds = [];
    const used = new Uint8Array(V);
    const shade = [], face = [], faceW = [];
    const inW = (x, y, z) => g.inWindow([x, y, z]);
    const triIn = new Uint8Array(T);
    for (let t = 0; t < T; t++) {
      const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
      const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3;
      const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
      const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
      if (!inW(cx, cy, cz)) continue;
      faceNormal(mesh, t, fn);
      if (fn[3] < 1e-9) continue;
      triIn[t] = 1;
      const ni = g.normal([cx, cy, cz]);
      face.push(angleDeg(fn[0], fn[1], fn[2], ni[0], ni[1], ni[2]));
      faceW.push(fn[3]);
      for (const v of [a, b, c]) {
        const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
        const nv = g.normal(p);
        const flat = flatShading || vertexIsFlat(mesh, v);
        const sn = flat ? fn : [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
        shade.push(angleDeg(sn[0], sn[1], sn[2], nv[0], nv[1], nv[2]));
        if (!used[v]) { used[v] = 1; ds.push(g.sdf(p)); }
      }
    }
    out.position = stats(ds);
    const fs = stats(face);
    let wsum = 0, w2 = 0;
    for (let i = 0; i < face.length; i++) { wsum += faceW[i]; w2 += faceW[i] * face[i] * face[i]; }
    out.faceNormal = { n: face.length, rms: Math.sqrt(w2 / (wsum || 1)), max: fs.maxAbs ?? 0 };
    const ss = stats(shade);
    out.shadingNormal = { rms: ss.rms ?? 0, max: ss.maxAbs ?? 0 };
    // creases between neighbouring in-window triangles (position-keyed, so
    // material and sharp vertex splits do not hide an edge)
    const edges = new Map();
    for (let t = 0; t < T; t++) {
      if (!triIn[t]) continue;
      for (let e = 0; e < 3; e++) {
        const ka = qkey(pos, tri[t * 3 + e]), kb = qkey(pos, tri[t * 3 + ((e + 1) % 3)]);
        const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const list = edges.get(k);
        if (list) list.push(t); else edges.set(k, [t]);
      }
    }
    const creases = [];
    const f2 = [0, 0, 0, 0];
    for (const list of edges.values()) {
      if (list.length !== 2) continue;
      faceNormal(mesh, list[0], fn);
      faceNormal(mesh, list[1], f2);
      creases.push(angleDeg(fn[0], fn[1], fn[2], f2[0], f2[1], f2[2]));
    }
    const cs = stats(creases);
    out.crease = { rms: cs.rms ?? 0, max: cs.maxAbs ?? 0, n: cs.n };
    // AO roughness: how far each in-window vertex's AO sits from the mean of
    // its mesh neighbours. A smooth surface should have smooth AO; per-vertex
    // AO counted from blocks puts block-shaped bands on smooth ground.
    const byKey = new Map();
    for (let v = 0; v < V; v++) {
      if (!used[v]) continue;
      const k = qkey(pos, v);
      if (!byKey.has(k)) byKey.set(k, mesh.ao[v]);
    }
    const nb = new Map();
    for (let t = 0; t < T; t++) {
      if (!triIn[t]) continue;
      for (let e = 0; e < 3; e++) {
        const ka = qkey(pos, tri[t * 3 + e]), kb = qkey(pos, tri[t * 3 + ((e + 1) % 3)]);
        if (!nb.has(ka)) nb.set(ka, new Set());
        if (!nb.has(kb)) nb.set(kb, new Set());
        nb.get(ka).add(kb);
        nb.get(kb).add(ka);
      }
    }
    const rough = [];
    for (const [k, set] of nb) {
      const a = byKey.get(k);
      if (a === undefined) continue;
      let s = 0, c = 0;
      for (const o of set) { const b = byKey.get(o); if (b !== undefined) { s += b; c++; } }
      if (c > 0) rough.push(a - s / c);
    }
    const rs = stats(rough);
    out.aoRough = { rms: rs.rms ?? 0, max: rs.maxAbs ?? 0 };
  }
  if (g.outline) out.outline = outlineStats(mesh, g.outline);
  return out;
}

/** Plan outline where the mesh crosses the plane y = o.y, measured against
 *  the ideal plan curve (line or disc). */
export function outlineStats(mesh, o) {
  const { pos, tri, T } = mesh;
  const ds = [];
  const ideal = o.kind === 'line' ? { kind: 'line', p0: o.p0, theta: o.theta } : { kind: 'disc', c: o.c, r: o.r };
  for (let t = 0; t < T; t++) {
    const vs = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]];
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = vs[e], b = vs[(e + 1) % 3];
      const ya = pos[a * 3 + 1] - o.y, yb = pos[b * 3 + 1] - o.y;
      if ((ya < 0 && yb >= 0) || (ya >= 0 && yb < 0)) {
        const s = ya / (ya - yb);
        pts.push([pos[a * 3] + s * (pos[b * 3] - pos[a * 3]), pos[a * 3 + 2] + s * (pos[b * 3 + 2] - pos[a * 3 + 2])]);
      }
    }
    if (pts.length !== 2) continue;
    for (const f of [0, 0.25, 0.5, 0.75]) {
      const p = [pts[0][0] + f * (pts[1][0] - pts[0][0]), pts[0][1] + f * (pts[1][1] - pts[0][1])];
      const [a, b, c, d] = o.window;
      if (p[0] < a || p[0] > c || p[1] < b || p[1] > d) continue;
      ds.push(idealDistance(ideal, p));
    }
  }
  return stats(ds);
}

// ------------------------------------------------------------ constraints
function verticalHits(mesh, x, z) {
  const { pos, tri, T } = mesh;
  const ys = [];
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const w0 = ((bx - x) * (cz - z) - (bz - z) * (cx - x)) / area;
    const w1 = ((cx - x) * (az - z) - (cz - z) * (ax - x)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    ys.push({ y: w0 * pos[a * 3 + 1] + w1 * pos[b * 3 + 1] + w2 * pos[c * 3 + 1], up: area < 0 });
  }
  return ys;
}

export function constraintMetrics(mesh, scene, BASE) {
  const P = [];
  for (let v = 0; v < mesh.V; v++) P.push([mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]]);
  const ext = (ps, a) => (ps.length ? Math.max(...ps.map((p) => p[a])) - Math.min(...ps.map((p) => p[a])) : 0);
  switch (scene.check) {
    case 'floating': {
      const e = [0, 1, 2].map((a) => ext(P, a));
      return { extents: e, value: Math.min(...e), pass: Math.min(...e) >= 0.4 - 1 / 128 };
    }
    case 'pillar': {
      const mid = P.filter((p) => Math.abs(p[1] - (BASE + 3)) < 0.6 && Math.abs(p[0] - 16.5) < 1.2 && Math.abs(p[2] - 16.5) < 1.2);
      const w = Math.min(ext(mid, 0), ext(mid, 2));
      return { value: w, pass: w >= 0.4 - 1 / 128 };
    }
    case 'tunnel': {
      const wall = P.filter((p) => p[2] > 14 && p[2] < 18 && p[1] > 7.4 && p[1] < 10.6 && Math.abs(p[0] - 16.5) < 1.2);
      const w = ext(wall, 0), h = ext(wall, 1);
      return { width: w, height: h, value: Math.min(w / 0.7, h / 1.9), pass: w >= 0.7 - 1 / 128 && h >= 1.9 - 1 / 128 };
    }
    case 'roof': {
      let minGap = Infinity;
      for (let x = 11.25; x <= 20.75; x += 0.5) {
        for (let z = 11.25; z <= 20.75; z += 0.5) {
          const hits = verticalHits(mesh, x, z);
          const floor = Math.max(...hits.filter((h) => h.up && h.y < BASE + 1).map((h) => h.y));
          const roof = Math.min(...hits.filter((h) => !h.up && h.y > BASE + 1).map((h) => h.y));
          if (Number.isFinite(floor) && Number.isFinite(roof)) minGap = Math.min(minGap, roof - floor);
        }
      }
      return { value: minGap, pass: minGap >= 1.9 - 1 / 128 };
    }
    case 'sharp': {
      let bad = 0, n = 0;
      for (let v = 0; v < mesh.V; v++) {
        if ((mesh.flags[v] & 1) === 0) continue;
        n++;
        const p = P[v];
        if (!(Number.isInteger(p[0]) || Number.isInteger(p[1]) || Number.isInteger(p[2]))) bad++;
      }
      return { sharpVertices: n, offPlane: bad, value: bad, pass: n > 0 && bad === 0 };
    }
    default:
      return {};
  }
}
