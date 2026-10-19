// mv-quad3: as mv-quad, but THREE signed distances per vertex (8 bits each,
// 24 bits = the 3 reserved bytes) plus the flat data in the other spare bits
// (byte 12 bits 3–7 and flags bits 2–7 = 11 bits): o1, o2 (3 bits each), a
// 1-bit selector for the third slot's other material (o1 or o2) and a 3-bit
// combining form (AND3, OR3, (a∧b)∨c, (a∨b)∧c with c = slot 1/2/3) and a
// valid bit = 11 bits. Up to three boundary pieces per quad, so band ends,
// T-junctions and crowded stripes need not drop a piece.
import { buildContext, cornerPieces, quadChoice3, slotValues3, evalForm } from '../work/mv/pipe6.mjs';
import { DEFAULT_PIPE } from '../work/mv/pipeline.mjs';

export const name = 'mv-quad3';
export const describe = 'mv-quad with three signed distances per vertex (24 bits) + o1,o2,sel3,form,valid in the other 11 spare bits; up to three fitted pieces per quad.';
export const PIPE = 'work/mv/pipe6.mjs';
export const OPT = { ...DEFAULT_PIPE, W: 7, maxStep: 1, Hmax: 64, lp4: 1, K: 24, opBlock: 2, walk: 3.5, loopFix: 1, conf: 1, farFix: 1, farS: 2, farW: 0.001, adopt: 1, checker: 2, stepShift: 0.5, fastWalk: 1 };
export const apron = 10;
const FORM_CODE = new Map([[0, 0], [3, 1], [6, 2], [7, 3], [8, 4], [9, 5], [10, 6], [11, 7]]);

let CUR = null;
export function mesh(region, scene, core) {
  const m = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  CUR = annotate(m, region, OPT);
  return CUR;
}

/** Encode → [flat, q1, q2, q3]; flat (11 bits) = oa | ob << 3 | sel2 << 6 |
 *  sel3 << 7 | code << 8: slot 1's other material is oa, slot 2's and 3's are
 *  oa or ob by their selector bit; oa === own marks "no boundary". */
function encode(sv, own, opt) {
  const Q = opt.quant, M = opt.qmax ?? 127;
  if (!sv) return [own | (own << 3), M, M, M];
  const q = (v) => Math.max(-M, Math.min(M, Math.round(v * Q)));
  const [o1, o2, o3] = sv.others;
  const s = sv.s.slice();
  const oa = o1;
  let ob = o2 !== oa ? o2 : o3 !== oa ? o3 : oa;
  let sel2 = o2 === oa ? 0 : 1, sel3 = o3 === oa ? 0 : 1;
  if (sel3 && o3 !== ob) { s[2] = s[0]; sel3 = 0; } // a fourth material: drop the third piece
  return [oa | (ob << 3) | (sel2 << 6) | (sel3 << 7) | (FORM_CODE.get(sv.form) << 8), q(s[0]), q(s[1]), q(s[2])];
}
const FORM_OF = [0, 3, 6, 7, 8, 9, 10, 11];

export function annotate(m, region, opt) {
  const ctx = buildContext(region, opt);
  const { nz, nx, blocks, apron: ap } = region;
  const solidAt = (x, y, z) => (blocks[(y * nz + z) * nx + x] & 0xff) !== 0;
  const isTop = (X, Y, Z) => {
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) if (solidAt(X + dx, Y - 1, Z + dz) && !solidAt(X + dx, Y, Z + dz)) return true;
    return false;
  };
  const V0 = m.V;
  let cap = Math.ceil(V0 * 1.5) + 16;
  let pos = new Float64Array(cap * 3), nrm = new Float64Array(cap * 3), ao = new Float64Array(cap), mat = new Uint8Array(cap), flags = new Uint8Array(cap), corner = new Int32Array(cap * 3), data = new Int16Array(cap * 4), has = new Uint8Array(cap);
  pos.set(m.pos); nrm.set(m.nrm); ao.set(m.ao); mat.set(m.mat); flags.set(m.flags); corner.set(m.corner);
  let V = V0;
  const grow = () => {
    cap *= 2;
    const g = (a, k) => { const b = new a.constructor(cap * k); b.set(a); return b; };
    pos = g(pos, 3); nrm = g(nrm, 3); ao = g(ao, 1); mat = g(mat, 1); flags = g(flags, 1); corner = g(corner, 3); data = g(data, 4); has = g(has, 1);
  };
  const tri = m.tri;
  let dups = 0;
  const quadIds = [], quadData = [];
  for (let q = 0; q < m.quadCount; q++) {
    const ids = [];
    for (let k = 0; k < 6; k++) { const v = tri[q * 6 + k]; if (!ids.includes(v)) ids.push(v); }
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
        if (pieces.length) choice = quadChoice3(ctx, pieces, own, rX, rY, rZ, cx, cz);
      }
    }
    quadIds.push(ids);
    quadData.push(choice ? ids.map((v) => encode(slotValues3(ctx, choice, m.pos[v * 3] - (rX - ap), m.pos[v * 3 + 2] - (rZ - ap)), own, opt)) : null);
  }
  const copyVertex = (v, e) => {
    if (V >= cap) grow();
    const w = V++;
    dups++;
    for (let a = 0; a < 3; a++) { pos[w * 3 + a] = pos[v * 3 + a]; nrm[w * 3 + a] = nrm[v * 3 + a]; corner[w * 3 + a] = corner[v * 3 + a]; }
    ao[w] = ao[v]; mat[w] = mat[v]; flags[w] = flags[v];
    for (let k = 0; k < 4; k++) data[w * 4 + k] = e[k];
    has[w] = 1;
    return w;
  };
  const dupOf = new Map();
  const vkey = (v, e) => `${v},${e[1]},${e[2]},${e[3]}`;
  const assign = (q, ids, es) => {
    const remap = new Map();
    ids.forEach((v, i) => {
      const e = es ? es[i] : encode(null, mat[v], opt);
      if (!has[v]) { has[v] = 1; for (let k = 0; k < 4; k++) data[v * 4 + k] = e[k]; return; }
      if (!es && opt.adopt && data[v * 4 + 1] > 0 && data[v * 4 + 2] > 0 && data[v * 4 + 3] > 0) return;
      if (data[v * 4 + 1] === e[1] && data[v * 4 + 2] === e[2] && data[v * 4 + 3] === e[3]) return;
      const key = vkey(v, e);
      let w = dupOf.get(key);
      if (w === undefined) { w = copyVertex(v, e); dupOf.set(key, w); }
      remap.set(v, w);
    });
    if (remap.size) for (let k = 0; k < 6; k++) { const v = tri[q * 6 + k]; const w = remap.get(v); if (w !== undefined) tri[q * 6 + k] = w; }
  };
  for (let q = 0; q < m.quadCount; q++) if (quadData[q]) assign(q, quadIds[q], quadData[q]);
  for (let q = 0; q < m.quadCount; q++) if (!quadData[q]) assign(q, quadIds[q], null);
  // provoking vertex carries the quad's flat data
  for (let q = 0; q < m.quadCount; q++) {
    if (!quadData[q]) continue;
    const f0 = quadData[q][0][0];
    for (let t = q * 2; t < q * 2 + 2; t++) {
      let k = 0;
      while (k < 3 && data[tri[t * 3 + k] * 4] !== f0) k++;
      if (k === 3) {
        const v = tri[t * 3];
        const key = `f${v},${f0}`;
        let w = dupOf.get(key);
        if (w === undefined) { w = copyVertex(v, [f0, data[v * 4 + 1], data[v * 4 + 2], data[v * 4 + 3]]); dupOf.set(key, w); }
        tri[t * 3] = w; k = 0;
      }
      if (k) {
        const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
        if (k === 1) { tri[t * 3] = b; tri[t * 3 + 1] = c; tri[t * 3 + 2] = a; } else { tri[t * 3] = c; tri[t * 3 + 1] = a; tri[t * 3 + 2] = b; }
      }
    }
  }
  const attrs = new Float64Array(V * 3);
  for (let v = 0; v < V; v++) {
    if (!has[v]) { const e = encode(null, mat[v], opt); for (let k = 0; k < 4; k++) data[v * 4 + k] = e[k]; }
    for (let k = 0; k < 3; k++) attrs[v * 3 + k] = data[v * 4 + 1 + k] / opt.quant;
  }
  m.V = V;
  m.pos = pos.subarray(0, V * 3); m.nrm = nrm.subarray(0, V * 3); m.ao = ao.subarray(0, V); m.mat = mat.subarray(0, V); m.flags = flags.subarray(0, V); m.corner = corner.subarray(0, V * 3);
  m.attrs = attrs; m.attrDim = 3;
  m.slotData = data.subarray(0, V * 4);
  m.slotBytes = m.slotData; // for tools that compare per-vertex data
  m.fitStats = { ...ctx.stats, dups, V0 };
  return m;
}

/** Fragment: flat data from the provoking vertex; three interpolated distances. */
export function fragment(attrs, info) {
  const f = CUR.slotData[info.a * 4];
  const oa = f & 7;
  if (oa === info.ownMat) return info.ownMat;
  const form = FORM_OF[(f >> 8) & 7];
  const s1 = attrs[0], s2 = attrs[1], s3 = attrs[2];
  if (evalForm(form, s1, s2, s3)) return info.ownMat;
  const ob = (f >> 3) & 7;
  const o2 = (f >> 6) & 1 ? ob : oa, o3 = (f >> 7) & 1 ? ob : oa;
  return s1 <= s2 && s1 <= s3 ? oa : s2 <= s3 ? o2 : o3;
}
