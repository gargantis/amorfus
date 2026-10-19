// mv-quad: "fit, don't filter". Hints geometry underneath. On the surface's
// plan label map (top material per column; boundaries across height steps of
// more than one block are cut) every material boundary is recognised —
// digital straight segments, deliberate corners and caps, max-margin arcs,
// λ-MST elsewhere; checkerboards keep their blocks — and delivered as TWO
// signed distances per vertex (8 bits each, 1/64 block) plus the two other
// material ids, an AND/OR bit and a valid bit: the 3 reserved vertex bytes.
// The two boundary pieces are chosen PER QUAD at its centre, so all four
// vertices of a quad interpolate the same two functions; a second channel is
// used only between deliberate shapes (lines, corners, consistent arcs). A
// vertex whose quads need different values is duplicated (the flat byte is
// matched by rotating each triangle's provoking vertex instead).
import { buildContext, cornerPieces, quadChoice, slotValues } from '../pipe6ref.mjs';
import { encodeSlots, decodeSlots, DEFAULT_PIPE } from '../pipeline.mjs';

export const name = 'mv-quadref';
export const describe = 'Hints geometry + fitted material boundaries (DSS lines, corners/caps, max-margin arcs, λ-MST) as two signed distances per vertex in 3 spare bytes; pieces chosen per quad, vertices duplicated where quads disagree.';
export const PIPE = 'work/mv/pipe6.mjs';
export const OPT = { ...DEFAULT_PIPE, W: 7, maxStep: 1, Hmax: 64, lp4: 1, K: 24, opBlock: 2, walk: 3.5, loopFix: 1, conf: 1, farFix: 1, farS: 2, farW: 0.001, adopt: 1, checker: 2, stepShift: 0.5, fastWalk: 1 };
export const apron = 10;

let CUR = null;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  CUR = annotate(m, region, OPT);
  return CUR;
}

export function annotate(m, region, opt) {
  const ctx = buildContext(region, opt);
  const { nz, nx, blocks, apron: ap } = region;
  const solidAt = (x, y, z) => (blocks[(y * nz + z) * nx + x] & 0xff) !== 0;
  const isTop = (X, Y, Z) => {
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) if (solidAt(X + dx, Y - 1, Z + dz) && !solidAt(X + dx, Y, Z + dz)) return true;
    return false;
  };
  const V0 = m.V;
  // growable per-vertex arrays (duplicates appended)
  let cap = Math.ceil(V0 * 1.5) + 16;
  let pos = new Float64Array(cap * 3), nrm = new Float64Array(cap * 3), ao = new Float64Array(cap), mat = new Uint8Array(cap), flags = new Uint8Array(cap), corner = new Int32Array(cap * 3), bytes = new Uint8Array(cap * 3), has = new Uint8Array(cap);
  pos.set(m.pos); nrm.set(m.nrm); ao.set(m.ao); mat.set(m.mat); flags.set(m.flags); corner.set(m.corner);
  let V = V0;
  const grow = () => {
    cap *= 2;
    const g = (a, k) => { const b = new a.constructor(cap * k); b.set(a); return b; };
    pos = g(pos, 3); nrm = g(nrm, 3); ao = g(ao, 1); mat = g(mat, 1); flags = g(flags, 1); corner = g(corner, 3); bytes = g(bytes, 3); has = g(has, 1);
  };
  const dupOf = new Map(); // `${v},${b0},${b1},${b2}` → vertex
  const tri = m.tri;
  let dups = 0;
  // pass 1: per-quad choices
  const quadIds = [], quadBytes = [];
  for (let q = 0; q < m.quadCount; q++) {
    const t0 = q * 2;
    const ids = [];
    for (let k = 0; k < 6; k++) { const v = tri[t0 * 3 + k]; if (!ids.includes(v)) ids.push(v); }
    const own = m.mat[ids[0]];
    let choice = null, rX = 0, rY = 0, rZ = 0;
    if (!(m.flags[ids[0]] & 1)) {
      let best = ids[0];
      for (const v of ids) if (m.corner[v * 3 + 1] > m.corner[best * 3 + 1]) best = v;
      rX = m.corner[best * 3] + ap; rY = m.corner[best * 3 + 1] + ap; rZ = m.corner[best * 3 + 2] + ap;
      if (isTop(rX, rY, rZ)) {
        let cx = 0, cz = 0;
        for (const v of ids) { cx += m.pos[v * 3]; cz += m.pos[v * 3 + 2]; }
        cx = cx / ids.length - (rX - ap); cz = cz / ids.length - (rZ - ap);
        const pieces = cornerPieces(ctx, rX, rY, rZ, cx, cz);
        if (pieces.length) choice = quadChoice(ctx, pieces, own, rX, rY, rZ, cx, cz);
      }
    }
    quadIds.push(ids);
    if (choice) {
      const bs = [];
      for (const v of ids) bs.push(encodeSlots(slotValues(ctx, choice, m.pos[v * 3] - (rX - ap), m.pos[v * 3 + 2] - (rZ - ap)), own, opt.quant));
      quadBytes.push(bs);
    } else quadBytes.push(null);
  }
  const s8 = (b) => (b > 127 ? b - 256 : b);
  const quadB0 = new Int16Array(m.quadCount).fill(-1);
  const copyVertex = (v, e) => {
    if (V >= cap) grow();
    const w = V++;
    dups++;
    for (let a = 0; a < 3; a++) { pos[w * 3 + a] = pos[v * 3 + a]; nrm[w * 3 + a] = nrm[v * 3 + a]; corner[w * 3 + a] = corner[v * 3 + a]; }
    ao[w] = ao[v]; mat[w] = mat[v]; flags[w] = flags[v];
    bytes[w * 3] = e[0]; bytes[w * 3 + 1] = e[1]; bytes[w * 3 + 2] = e[2]; has[w] = 1;
    return w;
  };
  // the interpolated values must agree per vertex (b1, b2); the flat byte b0
  // (other ids, op) only matters on each triangle's provoking vertex
  const valKey = (v, e1, e2) => v * 65536 + e1 * 256 + e2;
  const assign = (q, ids, bs) => {
    const remap = new Map();
    ids.forEach((v, i) => {
      const b = bs ? bs[i] : null;
      if (!has[v]) {
        has[v] = 1;
        const e = b ?? encodeSlots(null, mat[v], opt.quant);
        bytes[v * 3] = e[0]; bytes[v * 3 + 1] = e[1]; bytes[v * 3 + 2] = e[2];
        return;
      }
      if (!b) {
        // a quad without a boundary can use any vertex whose two values are
        // both on its own side: every triangle then shows its own material
        if (opt.adopt && s8(bytes[v * 3 + 1]) > 0 && s8(bytes[v * 3 + 2]) > 0) return;
      }
      const e = b ?? encodeSlots(null, mat[v], opt.quant);
      if (bytes[v * 3 + 1] === e[1] && bytes[v * 3 + 2] === e[2]) return; // same values
      const key = valKey(v, e[1], e[2]);
      let w = dupOf.get(key);
      if (w === undefined) { w = copyVertex(v, e); dupOf.set(key, w); }
      remap.set(v, w);
    });
    if (remap.size) { const t0 = q * 2; for (let k = 0; k < 6; k++) { const v = tri[t0 * 3 + k]; const w = remap.get(v); if (w !== undefined) tri[t0 * 3 + k] = w; } }
  };
  // pass 2: quads with a boundary claim their vertices first, then the rest
  for (let q = 0; q < m.quadCount; q++) if (quadBytes[q]) { assign(q, quadIds[q], quadBytes[q]); quadB0[q] = quadBytes[q][0][0]; }
  for (let q = 0; q < m.quadCount; q++) if (!quadBytes[q]) assign(q, quadIds[q], null);
  // pass 3: every triangle of a boundary quad provokes from a vertex that
  // carries the quad's flat byte (rotating the triangle keeps its winding);
  // if none does, one vertex is copied with it
  let rot = 0;
  for (let q = 0; q < m.quadCount; q++) {
    const b0 = quadB0[q];
    if (b0 < 0) continue;
    for (let t = q * 2; t < q * 2 + 2; t++) {
      let k = 0;
      while (k < 3 && bytes[tri[t * 3 + k] * 3] !== b0) k++;
      if (k === 3) {
        const v = tri[t * 3];
        const key = 0x40000000 + v * 512 + b0;
        let w = dupOf.get(key);
        if (w === undefined) { w = copyVertex(v, [b0, bytes[v * 3 + 1], bytes[v * 3 + 2]]); dupOf.set(key, w); }
        tri[t * 3] = w;
        k = 0;
      }
      if (k) {
        const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
        if (k === 1) { tri[t * 3] = b; tri[t * 3 + 1] = c; tri[t * 3 + 2] = a; } else { tri[t * 3] = c; tri[t * 3 + 1] = a; tri[t * 3 + 2] = b; }
        rot++;
      }
    }
  }
  const attrs = new Float64Array(V * 2);
  for (let v = 0; v < V; v++) {
    if (!has[v]) { const b = encodeSlots(null, mat[v], opt.quant); bytes[v * 3] = b[0]; bytes[v * 3 + 1] = b[1]; bytes[v * 3 + 2] = b[2]; }
    const d = decodeSlots(bytes[v * 3], bytes[v * 3 + 1], bytes[v * 3 + 2], opt.quant);
    attrs[v * 2] = d.s1; attrs[v * 2 + 1] = d.s2;
  }
  m.V = V;
  m.pos = pos.subarray(0, V * 3); m.nrm = nrm.subarray(0, V * 3); m.ao = ao.subarray(0, V); m.mat = mat.subarray(0, V); m.flags = flags.subarray(0, V); m.corner = corner.subarray(0, V * 3);
  m.attrs = attrs; m.attrDim = 2;
  m.slotBytes = bytes.subarray(0, V * 3);
  m.fitStats = { ...ctx.stats, dups, V0, rot };
  return m;
}

/** Fragment: the provoking vertex's flat byte (o1, o2, op); interpolated s1, s2. */
export function fragment(attrs, info) {
  const b0 = CUR.slotBytes[info.a * 3];
  const s1 = attrs[0], s2 = attrs[1];
  const op = (b0 >> 6) & 1;
  const own = op ? s1 > 0 && s2 > 0 : s1 > 0 || s2 > 0;
  if (own) return info.ownMat;
  return s1 <= s2 ? b0 & 7 : (b0 >> 3) & 7;
}
