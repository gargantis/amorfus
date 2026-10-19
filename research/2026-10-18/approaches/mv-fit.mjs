// mv-fit: "fit, don't filter". Production 'hints' geometry underneath; on
// the visible surface each material boundary is recognised in the plan
// label map (digital straight segments, deliberate corners and caps,
// max-margin arcs, λ-MST otherwise) and delivered as per-vertex signed
// distances to the fitted curve in the 3 reserved vertex bytes.
import { buildContext, cornerPieces, vertexSlots, encodeSlots, decodeSlots, DEFAULT_PIPE } from '../work/mv/pipeline.mjs';

export const name = 'mv-fit';
export const describe = 'Hints geometry + fitted material boundaries: DSS lines, corners/caps, max-margin arcs; per-vertex (s1,s2,o1,o2,op) in 3 bytes, fragment picks the material.';
export const OPT = { ...DEFAULT_PIPE };
export const apron = OPT.W + 3;

let lastFlat = null;

export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  return annotate(m, region, OPT);
}

export function annotate(m, region, opt) {
  const ctx = buildContext(region, opt);
  const { nx, nz, blocks, apron: ap } = region;
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
    const X = m.corner[v0 * 3] + ap, Y = m.corner[v0 * 3 + 1] + ap, Z = m.corner[v0 * 3 + 2] + ap;
    // only corners on a top face (solid below, air above) carry plan data
    let top = false;
    for (let dz = -1; dz <= 0 && !top; dz++) for (let dx = -1; dx <= 0; dx++) {
      if (solidAt(X + dx, Y - 1, Z + dz) && !solidAt(X + dx, Y, Z + dz)) { top = true; break; }
    }
    let pieces = [];
    const px = m.pos[v0 * 3] + ap, pz = m.pos[v0 * 3 + 2] + ap;
    if (top) pieces = cornerPieces(ctx, X, Y, Z, px, pz);
    for (const v of list) {
      const own = m.mat[v];
      const sl = pieces.length ? vertexSlots(ctx, pieces, own, X, Y, Z, px, pz) : null;
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
  lastFlat = bytes;
  return m;
}

/** Fragment: decode the provoking vertex's flat byte (o1, o2, op), compare
 *  the interpolated signed distances. */
export function fragment(attrs, info) {
  const b0 = lastFlat[info.a * 3];
  const s1 = attrs[0], s2 = attrs[1];
  const op = (b0 >> 6) & 1;
  const own = op ? s1 > 0 && s2 > 0 : s1 > 0 || s2 > 0;
  if (own) return info.ownMat;
  return s1 <= s2 ? b0 & 7 : (b0 >> 3) & 7;
}
