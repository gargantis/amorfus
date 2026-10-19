// stack — the integrated candidate (study code, not production code).
//
//   GEOMETRY  gh-cc8b: production hints for generated terrain; synthetic
//             contour crossings for every sign-changing edge touching a
//             shape-edited block (work/gh/syn2.mjs contourCross6, R = 8,
//             cliff/mirror rules, plateau w0 = 1), k = 0, D-3 caps only at
//             narrow openings (work/gh/mesher-gh.mjs). Unedited chunks are
//             byte-identical to the repo mesher.
//   SHADING   production area-weighted normals (gh mesher); AO = gn's box
//             kernel at the vertex's actual position over the partial-volume
//             field (work/stack/ao.mjs), onset curve 'quad' or 'linear'.
//   MATERIALS per quad CLASS (decided on the CPU, carried flat per vertex):
//             GEN   generated block → gm's fields (S, E) as 2×12-bit codes,
//                   fragment applies the v1 thresholds (work/stack/genfield.mjs)
//             EDIT  edited (placed/painted/replaced) non-sharp solid block →
//                   the ZONE METHOD decides (placeholder 'own': its block's
//                   production material)
//             ZGEN  generated block claimed by the zone method (a corner within
//                   zone.reach of an edited surface block) → the zone method
//                   decides; GEN_TOKEN = "show the generated material"
//             SHARP sharp block → its own material (unchanged)
//             Vertices used by quads of different classes are duplicated
//             (same position, normal, AO), so every triangle is single-class
//             and the class can be a flat varying (provoking vertex).
//             Layout 'A' (default): every non-sharp vertex keeps (S, E), so
//             GEN_TOKEN resolves to gm's exact contour anywhere in a zone.
//             Layout 'B': the zone method owns bytes 13–15 in zone vertices;
//             a claimed quad must have one gen class at all 4 corners
//             (uncontested), and GEN_TOKEN resolves to that class.
//   Without generator planes (synthetic scenes) every solid block counts as
//   player data (EDIT), as in gm.
// The plug-in contract is the header of work/stack/zones.mjs (the PLUGIN.md
// planned for it was never written).
import { decodeMesh } from '../../harness/core.mjs';
import { contourCross6 } from '../gh/syn2.mjs';
import { meshRegion as ghMesh } from '../gh/mesher-gh.mjs';
import { CFG as GH_CFG, PARAMS as GH_PARAMS } from '../../approaches/gh-cc8b.mjs';
import { attachGenPlanes } from '../gm/shim.mjs';
import { boxAo } from './ao.mjs';
import { makeGenField, makeEncoders, genRule } from './genfield.mjs';

export const GEN_TOKEN = 0;
/** Quad / vertex classes (study attrs[0]; production: flags bits 3–4). */
export const CLS = { ZGEN: 0, GEN: 1, EDIT: 2, SHARP: 3 };
export const CLS_NAMES = ['ZGEN', 'GEN', 'EDIT', 'SHARP'];
export { GH_CFG, GH_PARAMS };

/** Geometry: gh-cc8b (raw MeshResult with corners). */
export function geometry(region) {
  const c = contourCross6(region, GH_CFG);
  return ghMesh({ ...region, crossT: c?.crossT, params: GH_PARAMS });
}

const quadRing = (tri, q) => [tri[6 * q], tri[6 * q + 1], tri[6 * q + 2], tri[6 * q + 5]];

/** 3-D summed-area table over a 0/1 mask (Int32, (n+1)³). */
function sat3(mask, nx, ny, nz) {
  const X = nx + 1, Y = ny + 1, Z = nz + 1;
  const S = new Int32Array(X * Y * Z);
  const id = (x, y, z) => (y * Z + z) * X + x;
  for (let y = 1; y < Y; y++) for (let z = 1; z < Z; z++) {
    let row = 0;
    for (let x = 1; x < X; x++) {
      row += mask[((y - 1) * nz + (z - 1)) * nx + (x - 1)];
      S[id(x, y, z)] = row + S[id(x, y, z - 1)] + S[id(x, y - 1, z)] - S[id(x, y - 1, z - 1)];
    }
  }
  return (x0, y0, z0, x1, y1, z1) => { // inclusive cell box, clipped
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (z0 < 0) z0 = 0;
    if (x1 > nx - 1) x1 = nx - 1; if (y1 > ny - 1) y1 = ny - 1; if (z1 > nz - 1) z1 = nz - 1;
    if (x0 > x1 || y0 > y1 || z0 > z1) return 0;
    x1++; y1++; z1++;
    return S[id(x1, y1, z1)] - S[id(x0, y1, z1)] - S[id(x1, y0, z1)] - S[id(x1, y1, z0)]
      + S[id(x0, y0, z1)] + S[id(x0, y1, z0)] + S[id(x1, y0, z0)] - S[id(x0, y0, z0)];
  };
}

/**
 * Material pass. m = decoded mesh (geometry + AO done). Returns ctx; sets
 * m.attrs = [cls, S, E, …zone.dim], m.attrDim, grows vertex arrays for
 * duplicates. Quad order and 6 indices per quad are kept.
 */
export function materialPass(m, region, { genRule: ruleName = 'none', zone }) {
  const hasPlanes = !!region.gmS;
  const { nx, ny, nz, apron, blocks } = region;
  const SY = nx * nz, SZ = nx;
  const Q = m.quadCount, tri = m.tri, V0 = m.V;
  const layout = zone.layout ?? 'A';
  const reach = zone.reach ?? 0;
  const solid = (i) => (blocks[i] & 0xff) !== 0;
  const sharpB = (i) => (blocks[i] & 256) !== 0;
  const editedAt = hasPlanes ? (i) => region.gmEd[i] === 1 : (i) => solid(i);
  const enc = makeEncoders();
  const gen = hasPlanes ? makeGenField(region, ruleName) : null;

  // per-vertex gen codes (quantised S, E) and gen class, for all non-sharp vertices
  const g2 = new Float64Array(2);
  const vS0 = new Float64Array(V0), vE0 = new Float64Array(V0), vC0 = new Uint8Array(V0);
  if (gen) for (let v = 0; v < V0; v++) {
    if (m.flags[v] & 1) continue;
    gen(m.pos[v * 3] + apron, m.pos[v * 3 + 1] + apron, m.pos[v * 3 + 2] + apron, g2);
    vS0[v] = enc.encS(g2[0]); vE0[v] = enc.encE(g2[1]); vC0[v] = genRule(vS0[v], vE0[v]);
  }

  // quad classes
  const qCls = new Uint8Array(Q), qCell = new Int32Array(Q);
  let anyEd = false;
  for (let q = 0; q < Q; q++) {
    const ax = m.quadAxis[q], sl = m.quadSolidLower[q];
    const sx = m.quadLower[q * 3] + apron + (!sl && ax === 0 ? 1 : 0);
    const sy = m.quadLower[q * 3 + 1] + apron + (!sl && ax === 1 ? 1 : 0);
    const sz = m.quadLower[q * 3 + 2] + apron + (!sl && ax === 2 ? 1 : 0);
    const i = (sy * nz + sz) * nx + sx;
    qCell[q] = i;
    if (m.flags[tri[6 * q]] & 1) qCls[q] = CLS.SHARP;
    else if (editedAt(i)) { qCls[q] = CLS.EDIT; anyEd = true; } else qCls[q] = CLS.GEN;
  }

  // zone claim: GEN quads with a corner within `reach` of an edited, non-sharp, solid SURFACE block
  let claimed = 0, contestedSkipped = 0, contestedEdit = 0;
  if (reach > 0 && anyEd && hasPlanes) {
    const N = nx * ny * nz;
    const surfEd = new Uint8Array(N);
    for (let y = 1; y < ny - 1; y++) for (let z = 1; z < nz - 1; z++) {
      let i = (y * nz + z) * nx + 1;
      for (let x = 1; x < nx - 1; x++, i++) {
        if (!editedAt(i) || !solid(i) || sharpB(i)) continue;
        if (!solid(i - 1) || !solid(i + 1) || !solid(i - SY) || !solid(i + SY) || !solid(i - SZ) || !solid(i + SZ)) surfEd[i] = 1;
      }
    }
    const box = sat3(surfEd, nx, ny, nz);
    const inZoneMemo = new Map();
    const inZone = (v) => {
      const cx = m.corner[v * 3] + apron, cy = m.corner[v * 3 + 1] + apron, cz = m.corner[v * 3 + 2] + apron;
      const k = (cy * 64 + cz) * 64 + cx;
      let r = inZoneMemo.get(k);
      if (r === undefined) { r = box(cx - reach, cy - reach, cz - reach, cx + reach - 1, cy + reach - 1, cz + reach - 1) > 0; inZoneMemo.set(k, r); }
      return r;
    };
    for (let q = 0; q < Q; q++) {
      if (qCls[q] !== CLS.GEN) continue;
      const ring = quadRing(tri, q);
      if (!ring.some(inZone)) continue;
      if (layout === 'B') {
        const c0 = vC0[ring[0]];
        if (vC0[ring[1]] !== c0 || vC0[ring[2]] !== c0 || vC0[ring[3]] !== c0) { contestedSkipped++; continue; }
      }
      qCls[q] = CLS.ZGEN; claimed++;
    }
  }
  if (layout === 'B') for (let q = 0; q < Q; q++) {
    if (qCls[q] !== CLS.EDIT) continue;
    const ring = quadRing(tri, q), c0 = vC0[ring[0]];
    if (vC0[ring[1]] !== c0 || vC0[ring[2]] !== c0 || vC0[ring[3]] !== c0) contestedEdit++;
  }

  // duplicate vertices used by quads of different classes
  const use = new Uint8Array(V0);
  for (let q = 0; q < Q; q++) { const b = 1 << qCls[q]; for (let e = 0; e < 6; e++) use[tri[6 * q + e]] |= b; }
  // first class (lowest bit) keeps the original vertex; others get copies
  const copyOf = new Int32Array(V0 * 4).fill(-1);
  let V = V0;
  for (let v = 0; v < V0; v++) {
    const u = use[v];
    if (u === 0 || (u & (u - 1)) === 0) continue;
    let first = true;
    for (let c = 0; c < 4; c++) if (u & (1 << c)) { if (first) { first = false; copyOf[v * 4 + c] = v; } else copyOf[v * 4 + c] = V++; }
  }
  if (V > V0) {
    const grow = (a, k) => { const b = new a.constructor(V * k); b.set(a); return b; };
    const pos = grow(m.pos, 3), nrm = grow(m.nrm, 3), mat = grow(m.mat, 1), flags = grow(m.flags, 1), ao = grow(m.ao, 1), corner = grow(m.corner, 3);
    for (let v = 0; v < V0; v++) for (let c = 0; c < 4; c++) {
      const d = copyOf[v * 4 + c];
      if (d < 0 || d === v) continue;
      for (let a = 0; a < 3; a++) { pos[d * 3 + a] = m.pos[v * 3 + a]; nrm[d * 3 + a] = m.nrm[v * 3 + a]; corner[d * 3 + a] = m.corner[v * 3 + a]; }
      mat[d] = m.mat[v]; flags[d] = m.flags[v]; ao[d] = m.ao[v];
    }
    for (let q = 0; q < Q; q++) {
      const c = qCls[q];
      for (let e = 0; e < 6; e++) { const v = tri[6 * q + e]; const d = copyOf[v * 4 + c]; if (d >= 0) tri[6 * q + e] = d; }
    }
    Object.assign(m, { pos, nrm, mat, flags, ao, corner });
  }
  m.V = V;
  const src = new Int32Array(V); // original vertex of each (copy) vertex
  for (let v = 0; v < V0; v++) src[v] = v;
  for (let v = 0; v < V0; v++) for (let c = 0; c < 4; c++) { const d = copyOf[v * 4 + c]; if (d >= V0) src[d] = v; }
  const vCls = new Uint8Array(V);
  for (let q = 0; q < Q; q++) for (let e = 0; e < 6; e++) vCls[tri[6 * q + e]] = qCls[q];
  const vS = new Float64Array(V), vE = new Float64Array(V), vGc = new Uint8Array(V);
  for (let v = 0; v < V; v++) { const s = src[v]; vS[v] = vS0[s]; vE[v] = vE0[s]; vGc[v] = vC0[s]; }
  // production layout: flags bit 3 = GEN, bit 4 = EDIT (ZGEN = neither, SHARP = bit 0)
  for (let v = 0; v < V; v++) {
    if (vCls[v] === CLS.GEN) m.flags[v] |= 8;
    else if (vCls[v] === CLS.EDIT) m.flags[v] |= 16;
  }

  const zdim = zone.dim ?? 0, DIM = 3 + zdim;
  const attrs = new Float64Array(V * DIM);
  for (let v = 0; v < V; v++) { attrs[v * DIM] = vCls[v]; attrs[v * DIM + 1] = vS[v]; attrs[v * DIM + 2] = vE[v]; }
  m.attrs = attrs; m.attrDim = DIM;

  const ctx = {
    region, mesh: m, hasPlanes, layout, reach, apron,
    qCls, qCell, vCls, vS, vE, vGc, src, editedAt, quadRing: (q) => quadRing(m.tri, q),
    zone, zoneData: null, attrOffset: 3,
    stats: { quads: Q, gen: 0, zgen: 0, edit: 0, sharp: 0, claimed, contestedSkipped, contestedEdit, verticesIn: V0, duplicated: V - V0 },
  };
  for (let q = 0; q < Q; q++) { const c = qCls[q]; if (c === CLS.GEN) ctx.stats.gen++; else if (c === CLS.ZGEN) ctx.stats.zgen++; else if (c === CLS.EDIT) ctx.stats.edit++; else ctx.stats.sharp++; }
  if (zone.build) ctx.zoneData = zone.build(ctx) ?? null;
  return ctx;
}

/** Fragment for one mesh's ctx: a = interpolated attrs, info from the renderer. */
export function stackFragment(a, info, ctx) {
  const c = a[0];
  if (c > 2.5) return info.ownMat; // SHARP
  if (c > 0.5 && c < 1.5) return genRule(a[1], a[2]); // GEN
  const r = ctx.zone.fragment(a, info, ctx);
  if (r !== GEN_TOKEN) return r;
  if (!ctx.hasPlanes) return info.ownMat;
  return ctx.layout === 'B' ? ctx.vGc[info.a] : genRule(a[1], a[2]);
}

/** Collision/picking copy of what is rendered (§9.3), MeshResult-shaped. */
export function collisionResult(m, raw) {
  return { positions: Float32Array.from(m.pos), indexData: m.tri, pickRecords: raw.pickRecords, pickOffsets: raw.pickOffsets, vertexCount: m.V, quadCount: m.quadCount };
}

/**
 * Build an approach module's functions. opts: { aoCurve, genRule, zone }.
 * mesh() reads only the region (planes are region fields; harness inputs
 * without planes get them from work/gm/shim.mjs for the 16 bench chunks).
 */
export function makeStack({ aoCurve = 'quad', genRule: ruleName = 'none', zone }) {
  let CUR = null;
  function mesh(region0, scene, core) {
    const region = attachGenPlanes(region0);
    const raw = geometry(region);
    const m = decodeMesh(raw);
    boxAo(m, region, aoCurve, m.ao);
    const ctx = materialPass(m, region, { genRule: ruleName, zone });
    m.result = collisionResult(m, raw);
    m.stack = ctx.stats;
    m.ctx = ctx;
    m.fragment = (a, info) => stackFragment(a, info, ctx);
    CUR = ctx;
    return m;
  }
  // module-level fragment = the last meshed chunk's ctx (harness tools render
  // each mesh right after meshing it); mesh.fragment is bound per mesh
  function fragment(a, info) { return stackFragment(a, info, CUR); }
  return { mesh, fragment };
}
