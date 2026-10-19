// mv-v4: same boundary model as mv-fit (DSS lines, corners/caps, max-margin
// arcs, λ-MST; two signed distances per vertex), restructured: each label
// map's chains are extracted once and pointel windows are index ranges on
// them; all fits are relative to the pointel / corner (world-anchored).
import { buildContext, cornerPieces, vertexSlots } from '../work/mv/pipe4.mjs';
import { encodeSlots, decodeSlots, DEFAULT_PIPE } from '../work/mv/pipeline.mjs';

export const name = 'mv-v4';
export const describe = 'Hints geometry + fitted material boundaries (v2 pipeline: chains once per label map, windowed index ranges); per-vertex (s1,s2,o1,o2,op) in 3 bytes.';
export const OPT = { ...DEFAULT_PIPE, W: 7, maxStep: 1, Hmax: 64, lp4: 1, K: 24, opBlock: 2 };
export const apron = 10;
export const apronFor = (o) => o.W + 3;

export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  CUR = annotate(m, region, OPT);
  return CUR;
}

export function annotate(m, region, opt) {
  const ctx = buildContext(region, opt);
  const { nz, nx, blocks, apron: ap } = region;
  const V = m.V;
  const bytes = new Uint8Array(V * 3);
  const attrs = new Float64Array(V * 2);
  const solidAt = (x, y, z) => (blocks[(y * nz + z) * nx + x] & 0xff) !== 0;
  const byCorner = new Map();
  for (let v = 0; v < V; v++) {
    const key = (m.corner[v * 3] + 64) * 65536 + (m.corner[v * 3 + 1] + 64) * 256 + (m.corner[v * 3 + 2] + 64);
    let list = byCorner.get(key);
    if (!list) { list = []; byCorner.set(key, list); }
    list.push(v);
  }
  for (const list of byCorner.values()) {
    const v0 = list[0];
    const cx = m.corner[v0 * 3], cy = m.corner[v0 * 3 + 1], cz = m.corner[v0 * 3 + 2];
    const X = cx + ap, Y = cy + ap, Z = cz + ap;
    let top = false;
    for (let dz = -1; dz <= 0 && !top; dz++) for (let dx = -1; dx <= 0; dx++) {
      if (solidAt(X + dx, Y - 1, Z + dz) && !solidAt(X + dx, Y, Z + dz)) { top = true; break; }
    }
    // vertex offset from its lattice corner (exact: positions are k/256)
    const ox = m.pos[v0 * 3] - cx, oz = m.pos[v0 * 3 + 2] - cz;
    const pieces = top ? cornerPieces(ctx, X, Y, Z, ox, oz) : [];
    for (const v of list) {
      const own = m.mat[v];
      const sl = pieces.length ? vertexSlots(ctx, pieces, own, X, Y, Z, ox, oz) : null;
      const b = encodeSlots(sl, own, opt.quant);
      bytes[v * 3] = b[0]; bytes[v * 3 + 1] = b[1]; bytes[v * 3 + 2] = b[2];
      const d = decodeSlots(b[0], b[1], b[2], opt.quant);
      attrs[v * 2] = d.s1; attrs[v * 2 + 1] = d.s2;
    }
  }
  m.attrs = attrs;
  m.attrDim = 2;
  m.slotBytes = bytes;
  m.fitStats = ctx.stats;
  return m;
}

/** Fragment: the provoking vertex's flat byte (o1, o2, op) and the
 *  interpolated signed distances. Per-mesh bytes travel with the mesh. */
export function fragment(attrs, info) {
  const b0 = CUR.slotBytes[info.a * 3];
  const s1 = attrs[0], s2 = attrs[1];
  const op = (b0 >> 6) & 1;
  const own = op ? s1 > 0 && s2 > 0 : s1 > 0 || s2 > 0;
  if (own) return info.ownMat;
  return s1 <= s2 ? b0 & 7 : (b0 >> 3) & 7;
}
let CUR = null;
