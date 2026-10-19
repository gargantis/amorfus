// gc study: curved refinement of the default ('hints') rule's mesh.
//
// The control mesh is the production mesh welded per lattice corner, over
// the chunk plus MARGIN blocks (patched mesher, byte-identical for the
// chunk itself). Everything below reads only the region through it.
//
// Determinism: all CC-family positions are computed in integer 1/256-block
// units (chunk-local × 256 + dq), as one integer numerator over a small
// integer denominator, rounded once (exact round-half-up). Translation by a
// chunk (8192 units) shifts every numerator by an exact multiple of its
// denominator, so the same vertex comes out bit-identical from either
// chunk's region. Normals are sums of exact integer cross products, then
// one sqrt + divide. PN/Phong (float) evaluate edge points from the edge's
// lower-id endpoint, in coordinates relative to that endpoint's corner.
import { meshRegion } from './mesher-gc.mjs';
import { decodeMesh } from '../../harness/core.mjs';

export const MARGIN = 3;

export function controlMesh(region, params = {}, margin = MARGIN) {
  const m = meshRegion({ ...region, params: { ...params, margin } });
  return { full: m, c: m.control };
}

// ------------------------------------------------------------ topology
export function topology(c) {
  const V = c.vertCount, Q = c.quadCount, ring = c.ring;
  // vertex → incident quads (ascending quad id = canonical region order)
  const vqStart = new Int32Array(V + 1);
  for (let k = 0; k < Q * 4; k++) vqStart[ring[k] + 1]++;
  for (let v = 0; v < V; v++) vqStart[v + 1] += vqStart[v];
  const vqList = new Int32Array(Q * 4);
  const fill = vqStart.slice(0, V);
  for (let q = 0; q < Q; q++) for (let j = 0; j < 4; j++) { const v = ring[q * 4 + j]; vqList[fill[v]++] = q; }
  // edges
  const emap = new Map();
  const ev0 = [], ev1 = [], eq = [], eqn = [];
  const quadEdge = new Int32Array(Q * 4);
  for (let q = 0; q < Q; q++) {
    for (let j = 0; j < 4; j++) {
      const a = ring[q * 4 + j], b = ring[q * 4 + ((j + 1) & 3)];
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const key = lo * V + hi;
      let e = emap.get(key);
      if (e === undefined) {
        e = ev0.length;
        emap.set(key, e);
        ev0.push(lo); ev1.push(hi); eq.push(-1, -1, -1, -1); eqn.push(0);
      }
      if (eqn[e] < 4) eq[e * 4 + eqn[e]] = q;
      eqn[e]++;
      quadEdge[q * 4 + j] = e;
    }
  }
  const E = ev0.length;
  // vertex → incident edges, ordered by direction slot (−x,+x,−y,+y,−z,+z)
  const vEdge = new Int32Array(V * 6).fill(-1);
  for (let e = 0; e < E; e++) {
    const a = ev0[e], b = ev1[e];
    const dx = c.cx[b] - c.cx[a], dy = c.cy[b] - c.cy[a], dz = c.cz[b] - c.cz[a];
    const axis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
    const d = dx + dy + dz; // ±1
    vEdge[a * 6 + axis * 2 + (d > 0 ? 1 : 0)] = e;
    vEdge[b * 6 + axis * 2 + (d > 0 ? 0 : 1)] = e;
  }
  return {
    V, Q, E, vqStart, vqList, quadEdge, vEdge,
    ev0: Int32Array.from(ev0), ev1: Int32Array.from(ev1), eq: Int32Array.from(eq), eqn: Int32Array.from(eqn),
  };
}

/** Integer position (1/256 units) of control vertex v. */
export const P256 = (c, v, a) => (a === 0 ? c.cx[v] : a === 1 ? c.cy[v] : c.cz[v]) * 256 + c.dq[v * 3 + a];

/** exact round-half-up of num/den for integers (|num/den| < 2^30, den < 2^12) */
const rdiv = (num, den) => Math.floor((2 * num + den) / (2 * den));

// ------------------------------------------------------------ classification
/** Vertex classes for subdivision: 0 smooth, 1 crease (exactly 2 crease
 *  edges, neighbours in creaseNbr), 2 fixed (corner, sharp-touching,
 *  non-manifold fan, ≥3 creases). Edge crease = not exactly 2 quads, or
 *  either quad sharp. */
export function classify(c, t) {
  const { V, E, eq, eqn, vqStart, vqList, vEdge, ev0, ev1 } = t;
  const crease = new Uint8Array(E);
  for (let e = 0; e < E; e++) {
    if (eqn[e] !== 2) { crease[e] = 1; continue; }
    if (c.sharp[eq[e * 4]] || c.sharp[eq[e * 4 + 1]]) crease[e] = 1;
  }
  const vclass = new Uint8Array(V);
  const creaseNbr = new Int32Array(V * 2).fill(-1);
  const touchesSharp = new Uint8Array(V);
  for (let v = 0; v < V; v++) {
    const q0 = vqStart[v], q1 = vqStart[v + 1];
    if (q1 === q0) continue;
    let sharp = false;
    for (let k = q0; k < q1; k++) if (c.sharp[vqList[k]]) sharp = true;
    touchesSharp[v] = sharp ? 1 : 0;
    let nC = 0, nE = 0;
    for (let s = 0; s < 6; s++) {
      const e = vEdge[v * 6 + s];
      if (e < 0) continue;
      nE++;
      if (crease[e]) {
        if (nC < 2) creaseNbr[v * 2 + nC] = ev0[e] === v ? ev1[e] : ev0[e];
        nC++;
      }
    }
    // single fan? quads around v connected through shared non-crease-or-crease edges incident to v
    const n = q1 - q0;
    let fans = 0;
    if (n > 0) {
      const seen = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (seen[i]) continue;
        fans++;
        const stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const a = stack.pop();
          const qa = vqList[q0 + a];
          for (let j = 0; j < 4; j++) {
            const e = t.quadEdge[qa * 4 + j];
            if (ev0[e] !== v && ev1[e] !== v) continue;
            if (eqn[e] !== 2) continue; // non-manifold edges do not join fans
            const other = eq[e * 4] === qa ? eq[e * 4 + 1] : eq[e * 4];
            for (let b = 0; b < n; b++) if (!seen[b] && vqList[q0 + b] === other) { seen[b] = 1; stack.push(b); }
          }
        }
      }
    }
    if (sharp || fans > 1 || nC > 2 || (nC === 2 && fans !== 1)) vclass[v] = 2;
    else if (nC === 2) vclass[v] = 1;
    else vclass[v] = 0;
    if (nE !== n && nC === 0) vclass[v] = 2; // open ring (region border): fixed
  }
  return { crease, vclass, creaseNbr, touchesSharp };
}

// ------------------------------------------------------------ Catmull-Clark (one level)
/**
 * One CC level over the control mesh. Returns refined vertices (integer
 * 1/256 positions), refined quads (4 per control quad, ring CCW from air),
 * per-refined-vertex AO numerators (bilinear), and the parent of each
 * child quad.
 * opts.guard: clamp vertex points to the control vertex's constraint box
 *   (thin-feature guard, D-3 caps, sharp pins) as the mesher does.
 * opts.edgeGuard: also keep edge/face points from moving further toward
 *   air than the bilinear point does (no extra intrusion into openings).
 * opts.weight: blend factor w ∈ {0..1} as a rational num/den between the
 *   bilinear (linear subdivision) point and the CC point (1 = full CC).
 */
export function catmullClark(c, t, cls, opts = {}) {
  const { V, Q, E, vqStart, vqList, vEdge, ev0, ev1, eq, quadEdge } = t;
  const { crease, vclass, creaseNbr } = cls;
  const wN = opts.wNum ?? 1, wD = opts.wDen ?? 1; // CC weight as a rational
  const NV = V + E + Q;
  const P = new Float64Array(NV * 3); // integer-valued, 1/256 units
  const AO = new Float64Array(NV); // AO in u8 units (rounded)
  const lin = new Float64Array(NV * 3); // bilinear (linear subdivision) point, for guards
  const S4 = new Float64Array(Q * 3); // face sums (exact)
  const ring = c.ring;
  // face points
  for (let q = 0; q < Q; q++) {
    for (let a = 0; a < 3; a++) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += P256(c, ring[q * 4 + j], a);
      S4[q * 3 + a] = s;
      const id = V + E + q;
      P[id * 3 + a] = rdiv(s, 4);
      lin[id * 3 + a] = P[id * 3 + a];
    }
    let ao = 0;
    for (let j = 0; j < 4; j++) ao += Math.round(c.ao[ring[q * 4 + j]] * 255);
    AO[V + E + q] = rdiv(ao, 4);
  }
  // edge points: smooth (v0 + v1 + Fa + Fb)/4 = (4v0 + 4v1 + S4a + S4b)/16 ; crease midpoint
  for (let e = 0; e < E; e++) {
    const a0 = ev0[e], a1 = ev1[e], id = V + e;
    for (let a = 0; a < 3; a++) {
      const p0 = P256(c, a0, a), p1 = P256(c, a1, a);
      const linNum = 8 * (p0 + p1); // /16
      let num = linNum;
      if (!crease[e]) num = 4 * p0 + 4 * p1 + S4[eq[e * 4] * 3 + a] + S4[eq[e * 4 + 1] * 3 + a];
      // blend: (wD - wN)*lin + wN*cc over wD
      lin[id * 3 + a] = rdiv(linNum, 16);
      P[id * 3 + a] = rdiv((wD - wN) * linNum + wN * num, 16 * wD);
    }
    AO[id] = rdiv(Math.round(c.ao[a0] * 255) + Math.round(c.ao[a1] * 255), 2);
  }
  // vertex points
  for (let v = 0; v < V; v++) {
    const q0 = vqStart[v], q1 = vqStart[v + 1];
    if (q1 === q0) continue;
    const id = v;
    AO[id] = Math.round(c.ao[v] * 255);
    for (let a = 0; a < 3; a++) {
      const S = P256(c, v, a);
      lin[id * 3 + a] = S;
      let num, den;
      if (vclass[v] === 2) { num = S; den = 1; }
      else if (vclass[v] === 1) {
        num = P256(c, creaseNbr[v * 2], a) + 6 * S + P256(c, creaseNbr[v * 2 + 1], a);
        den = 8;
      } else {
        // (ΣS4_j + 4Σv_i + 4(n² − 2n)S) / (4n²), faces in quad order, edges in slot order
        const n = q1 - q0;
        let sf = 0;
        for (let k = q0; k < q1; k++) sf += S4[vqList[k] * 3 + a];
        let se = 0, ne = 0;
        for (let s = 0; s < 6; s++) {
          const e = vEdge[v * 6 + s];
          if (e < 0) continue;
          ne++;
          se += P256(c, ev0[e] === v ? ev1[e] : ev0[e], a);
        }
        if (ne !== n) { num = S; den = 1; }
        else { num = sf + 4 * se + 4 * (n * n - 2 * n) * S; den = 4 * n * n; }
      }
      // blend with the old position S
      P[id * 3 + a] = rdiv((wD - wN) * S * den + wN * num, den * wD);
    }
    if (opts.guard) {
      // clamp the offset from the lattice corner to the control box
      const cc = [c.cx[v] * 256, c.cy[v] * 256, c.cz[v] * 256];
      for (let a = 0; a < 3; a++) {
        const lo = Math.ceil(c.lo[v * 3 + a] * 256 - 1e-9), hi = Math.floor(c.hi[v * 3 + a] * 256 + 1e-9);
        const off = P[id * 3 + a] - cc[a];
        // never clamp a vertex further than where the control mesh already put it
        const d0 = c.dq[v * 3 + a];
        const l = Math.min(lo, d0), h = Math.max(hi, d0);
        P[id * 3 + a] = cc[a] + (off < l ? l : off > h ? h : off);
      }
    }
  }
  // child quads: for parent ring (a b c d), edges e0=ab e1=bc e2=cd e3=da, face f
  const cq = new Int32Array(Q * 16);
  for (let q = 0; q < Q; q++) {
    const f = V + E + q;
    const r = [ring[q * 4], ring[q * 4 + 1], ring[q * 4 + 2], ring[q * 4 + 3]];
    const ee = [V + quadEdge[q * 4], V + quadEdge[q * 4 + 1], V + quadEdge[q * 4 + 2], V + quadEdge[q * 4 + 3]];
    for (let j = 0; j < 4; j++) {
      const o = (q * 4 + j) * 4;
      cq[o] = r[j];
      cq[o + 1] = ee[j];
      cq[o + 2] = f;
      cq[o + 3] = ee[(j + 3) & 3];
    }
  }
  return { NV, P, AO, lin, cq, nChild: Q * 4, parentOf: (k) => k >> 2 };
}

// ------------------------------------------------------------ normals (refined quad mesh)
/** Area-weighted normals over non-sharp child quads, exact integer cross
 *  products accumulated in child order (= canonical region order). */
export function quadNormals(NV, P, cq, nChild, isSharpChild) {
  const acc = new Float64Array(NV * 3);
  for (let k = 0; k < nChild; k++) {
    if (isSharpChild(k)) continue;
    const a = cq[k * 4], b = cq[k * 4 + 1], cc = cq[k * 4 + 2], d = cq[k * 4 + 3];
    // cross(c − a, d − b): twice the vector area of the quad
    const ux = P[cc * 3] - P[a * 3], uy = P[cc * 3 + 1] - P[a * 3 + 1], uz = P[cc * 3 + 2] - P[a * 3 + 2];
    const vx = P[d * 3] - P[b * 3], vy = P[d * 3 + 1] - P[b * 3 + 1], vz = P[d * 3 + 2] - P[b * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const w of [a, b, cc, d]) { acc[w * 3] += nx; acc[w * 3 + 1] += ny; acc[w * 3 + 2] += nz; }
  }
  return acc;
}

// octahedral snorm16 round trip, as production stores normals
export function octRoundTrip(nx0, ny0, nz0, out, o) {
  const inv = 1 / (Math.abs(nx0) + Math.abs(ny0) + Math.abs(nz0) || 1);
  let ox = nx0 * inv, oy = ny0 * inv;
  if (nz0 < 0) {
    const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
    ox = tx; oy = ty;
  }
  const sx = Math.max(-32767, Math.min(32767, Math.round(ox * 32767))) / 32767;
  const sy = Math.max(-32767, Math.min(32767, Math.round(oy * 32767))) / 32767;
  let nx = sx, ny = sy, nz = 1 - Math.abs(sx) - Math.abs(sy);
  if (nz < 0) {
    const tx = (1 - Math.abs(sy)) * (sx >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(sx)) * (sy >= 0 ? 1 : -1);
    nx = tx; ny = ty;
  }
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  out[o] = nx / l; out[o + 1] = ny / l; out[o + 2] = nz / l;
}

// ------------------------------------------------------------ emit (quad mesh → plain mesh)
/**
 * Emit the owned part of a refined quad mesh as a harness plain mesh.
 * P: integer 1/256 positions; cq: child quads (4 ids, ring CCW from air);
 * parent(k): control quad of child k; AO: u8 units.
 * Vertices weld per (refined id, material) for smooth quads; sharp quads
 * get their own flat vertices (production rule).
 */
export function emitQuadMesh(c, NV, P, AO, cq, nChild, parent, nacc, opts = {}) {
  // owned control quads → pick order index
  const Q = c.quadCount;
  const ownIdx = new Int32Array(Q).fill(-1);
  let quadCount = 0;
  for (let q = 0; q < Q; q++) if (c.owned[q]) ownIdx[q] = quadCount++;
  const quadLower = new Int32Array(quadCount * 3), quadAxis = new Uint8Array(quadCount), quadSolidLower = new Uint8Array(quadCount);
  for (let q = 0; q < Q; q++) {
    const i = ownIdx[q];
    if (i < 0) continue;
    const rec = c.pick[q];
    const li = rec & 0x7fff;
    quadLower[i * 3] = li % 32; quadLower[i * 3 + 1] = Math.floor(li / 1024); quadLower[i * 3 + 2] = Math.floor(li / 32) % 32;
    quadAxis[i] = (rec >> 15) & 3; quadSolidLower[i] = (rec >> 17) & 1;
  }
  const pos = [], nrm = [], mat = [], flags = [], ao = [], tri = [], triQuad = [];
  const weld = new Map();
  const tmp = [0, 0, 0];
  const vertexOf = (id, material, sharp, fn) => {
    const key = id * 8 + material;
    if (!sharp) { const w = weld.get(key); if (w !== undefined) return w; }
    const out = pos.length / 3;
    pos.push(P[id * 3] / 256, P[id * 3 + 1] / 256, P[id * 3 + 2] / 256);
    let nx, ny, nz;
    if (sharp) { nx = fn[0]; ny = fn[1]; nz = fn[2]; }
    else {
      nx = nacc[id * 3]; ny = nacc[id * 3 + 1]; nz = nacc[id * 3 + 2];
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l > 1e-9) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
    }
    octRoundTrip(nx, ny, nz, tmp, 0);
    nrm.push(tmp[0], tmp[1], tmp[2]);
    mat.push(material);
    flags.push(sharp ? 1 : 0);
    ao.push(Math.max(0, Math.min(255, AO[id])) / 255);
    if (!sharp) weld.set(key, out);
    return out;
  };
  const fn = [0, 0, 0];
  for (let k = 0; k < nChild; k++) {
    const q = parent(k);
    if (ownIdx[q] < 0) continue;
    const sharp = c.sharp[q] === 1;
    const material = c.material[q];
    if (sharp) {
      const s = c.solidIsLower[q] ? 1 : -1;
      fn[0] = fn[1] = fn[2] = 0;
      fn[c.axis[q]] = s;
    }
    const r = [cq[k * 4], cq[k * 4 + 1], cq[k * 4 + 2], cq[k * 4 + 3]];
    const ids = r.map((id) => vertexOf(id, material, sharp, fn));
    const d2 = (i, j) => {
      const dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
      return dx * dx + dy * dy + dz * dz;
    };
    if (d2(r[0], r[2]) <= d2(r[1], r[3])) tri.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    else tri.push(ids[1], ids[2], ids[3], ids[1], ids[3], ids[0]);
    triQuad.push(ownIdx[q], ownIdx[q]);
  }
  const V = pos.length / 3;
  return {
    V, pos: Float64Array.from(pos), nrm: Float64Array.from(nrm), mat: Uint8Array.from(mat), flags: Uint8Array.from(flags),
    ao: Float64Array.from(ao), T: tri.length / 3, tri: Uint32Array.from(tri), triQuad: Int32Array.from(triQuad),
    quadCount, quadLower, quadAxis, quadSolidLower, corner: null,
  };
}

// ------------------------------------------------------------ control mesh as-is (sanity)
export function emitControl(c, t) {
  const V = c.vertCount;
  const P = new Float64Array(V * 3);
  const AO = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    for (let a = 0; a < 3; a++) P[v * 3 + a] = P256(c, v, a);
    AO[v] = Math.round(c.ao[v] * 255);
  }
  const nacc = new Float64Array(V * 3);
  for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) nacc[v * 3 + a] = c.nrm[v * 3 + a];
  return emitQuadMesh(c, V, P, AO, c.ring, c.quadCount, (k) => k, nacc);
}

// ------------------------------------------------------------ triangle patches (PN / Phong)
/**
 * Refine every owned coarse triangle (production split: shorter diagonal)
 * at level L with a patch evaluator. kind: 'pn' | 'phong' (alpha).
 * Edge points are evaluated once per lattice edge (or quad diagonal) from
 * the lower-id endpoint, in coordinates relative to its lattice corner, so
 * both triangles and both chunks agree. Crease edges (sharp-adjacent or
 * non-manifold) stay straight; sharp quads stay flat.
 */
export function refineTriangles(c, t, cls, { kind = 'pn', L = 2, alpha = 0.75 } = {}) {
  const { crease } = cls;
  const Q = c.quadCount;
  const ownIdx = new Int32Array(Q).fill(-1);
  let quadCount = 0;
  for (let q = 0; q < Q; q++) if (c.owned[q]) ownIdx[q] = quadCount++;
  const quadLower = new Int32Array(quadCount * 3), quadAxis = new Uint8Array(quadCount), quadSolidLower = new Uint8Array(quadCount);
  for (let q = 0; q < Q; q++) {
    const i = ownIdx[q];
    if (i < 0) continue;
    const rec = c.pick[q];
    const li = rec & 0x7fff;
    quadLower[i * 3] = li % 32; quadLower[i * 3 + 1] = Math.floor(li / 1024); quadLower[i * 3 + 2] = Math.floor(li / 32) % 32;
    quadAxis[i] = (rec >> 15) & 3; quadSolidLower[i] = (rec >> 17) & 1;
  }
  const rel = (w, ref, a) => ((a === 0 ? c.cx[w] - c.cx[ref] : a === 1 ? c.cy[w] - c.cy[ref] : c.cz[w] - c.cz[ref]) * 256 + c.dq[w * 3 + a]) / 256;
  const corner256 = (ref, a) => (a === 0 ? c.cx[ref] : a === 1 ? c.cy[ref] : c.cz[ref]) * 256;
  const N = (v, a) => c.nrm[v * 3 + a];

  // generic patch evaluation for triangle (A,B,C) with flat/straight flags, relative to ref
  // returns [x,y,z] relative to ref (blocks) and normal
  function evalPatch(vs, ns, straight, flat, u, v, w, outP, outN) {
    // vs: 3 relative positions [[x,y,z]...], ns: 3 normals, u,v,w barycentric on A,B,C
    const [P1, P2, P3] = vs, [N1, N2, N3] = ns;
    if (flat) {
      for (let a = 0; a < 3; a++) outP[a] = u * P1[a] + v * P2[a] + w * P3[a];
      for (let a = 0; a < 3; a++) outN[a] = N1[a];
      return;
    }
    if (kind === 'pn') {
      const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const bij = (Pi, Pj, Ni, s) => {
        const wij = s ? 0 : (Pj[0] - Pi[0]) * Ni[0] + (Pj[1] - Pi[1]) * Ni[1] + (Pj[2] - Pi[2]) * Ni[2];
        return [0, 1, 2].map((a) => (2 * Pi[a] + Pj[a] - wij * Ni[a]) / 3);
      };
      const b210 = bij(P1, P2, N1, straight[0]), b120 = bij(P2, P1, N2, straight[0]);
      const b021 = bij(P2, P3, N2, straight[1]), b012 = bij(P3, P2, N3, straight[1]);
      const b102 = bij(P3, P1, N3, straight[2]), b201 = bij(P1, P3, N1, straight[2]);
      const E = [0, 1, 2].map((a) => (b210[a] + b120[a] + b021[a] + b012[a] + b102[a] + b201[a]) / 6);
      const Vc = [0, 1, 2].map((a) => (P1[a] + P2[a] + P3[a]) / 3);
      const b111 = [0, 1, 2].map((a) => E[a] + (E[a] - Vc[a]) / 2);
      for (let a = 0; a < 3; a++) {
        outP[a] = P1[a] * u * u * u + P2[a] * v * v * v + P3[a] * w * w * w +
          3 * (b210[a] * u * u * v + b120[a] * u * v * v + b201[a] * u * u * w +
               b021[a] * v * v * w + b102[a] * u * w * w + b012[a] * v * w * w) +
          6 * b111[a] * u * v * w;
      }
      const nij = (Pi, Pj, Ni, Nj, s) => {
        if (s) { const m = [Ni[0] + Nj[0], Ni[1] + Nj[1], Ni[2] + Nj[2]]; const l = Math.sqrt(dot(m, m)) || 1; return m.map((x) => x / l); }
        const d = [Pj[0] - Pi[0], Pj[1] - Pi[1], Pj[2] - Pi[2]];
        const vv = (2 * dot(d, [Ni[0] + Nj[0], Ni[1] + Nj[1], Ni[2] + Nj[2]])) / (dot(d, d) || 1);
        const h = [0, 1, 2].map((a) => Ni[a] + Nj[a] - vv * d[a]);
        const l = Math.sqrt(dot(h, h)) || 1;
        return h.map((x) => x / l);
      };
      const n110 = nij(P1, P2, N1, N2, straight[0]), n011 = nij(P2, P3, N2, N3, straight[1]), n101 = nij(P3, P1, N3, N1, straight[2]);
      for (let a = 0; a < 3; a++) outN[a] = N1[a] * u * u + N2[a] * v * v + N3[a] * w * w + n110[a] * u * v + n011[a] * v * w + n101[a] * w * u;
    } else {
      // Phong tessellation; a straight edge projects only onto... keep straight edges linear
      const p = [0, 1, 2].map((a) => u * P1[a] + v * P2[a] + w * P3[a]);
      const proj = (Pi, Ni) => { const d = (p[0] - Pi[0]) * Ni[0] + (p[1] - Pi[1]) * Ni[1] + (p[2] - Pi[2]) * Ni[2]; return [p[0] - d * Ni[0], p[1] - d * Ni[1], p[2] - d * Ni[2]]; };
      const onEdge = (w === 0 && straight[0]) || (u === 0 && straight[1]) || (v === 0 && straight[2]);
      if (onEdge) { for (let a = 0; a < 3; a++) outP[a] = p[a]; }
      else {
        const q1 = proj(P1, N1), q2 = proj(P2, N2), q3 = proj(P3, N3);
        for (let a = 0; a < 3; a++) outP[a] = (1 - alpha) * p[a] + alpha * (u * q1[a] + v * q2[a] + w * q3[a]);
      }
      for (let a = 0; a < 3; a++) outN[a] = u * N1[a] + v * N2[a] + w * N3[a];
    }
    const l = Math.sqrt(outN[0] * outN[0] + outN[1] * outN[1] + outN[2] * outN[2]) || 1;
    outN[0] /= l; outN[1] /= l; outN[2] /= l;
  }

  // edge lookup for lattice edges
  const edgeOf = (a, b) => {
    for (let s = 0; s < 6; s++) {
      const e = t.vEdge[a * 6 + s];
      if (e >= 0 && (t.ev0[e] === b || t.ev1[e] === b)) return e;
    }
    return -1;
  };
  const pos = [], nrm = [], mat = [], flags = [], ao = [], tri = [], triQuad = [];
  const weld = new Map();
  const tmpN = [0, 0, 0];
  const emit = (key, material, sharp, P256abs, n, aoU8) => {
    const k = sharp ? null : `${key}|${material}`;
    if (k !== null) { const w = weld.get(k); if (w !== undefined) return w; }
    const out = pos.length / 3;
    pos.push(P256abs[0] / 256, P256abs[1] / 256, P256abs[2] / 256);
    octRoundTrip(n[0], n[1], n[2], tmpN, 0);
    nrm.push(tmpN[0], tmpN[1], tmpN[2]);
    mat.push(material); flags.push(sharp ? 1 : 0); ao.push(aoU8 / 255);
    if (k !== null) weld.set(k, out);
    return out;
  };
  const P = [0, 0, 0], NN = [0, 0, 0];
  for (let q = 0; q < Q; q++) {
    if (ownIdx[q] < 0) continue;
    const r = [c.ring[q * 4], c.ring[q * 4 + 1], c.ring[q * 4 + 2], c.ring[q * 4 + 3]];
    const sharp = c.sharp[q] === 1;
    const material = c.material[q];
    const fn = [0, 0, 0];
    if (sharp) fn[c.axis[q]] = c.solidIsLower[q] ? 1 : -1;
    const d2 = (i, j) => { let s = 0; for (let a = 0; a < 3; a++) { const d = P256(c, i, a) - P256(c, j, a); s += d * d; } return s; };
    const tris = d2(r[0], r[2]) <= d2(r[1], r[3]) ? [[r[0], r[1], r[2]], [r[0], r[2], r[3]]] : [[r[1], r[2], r[3]], [r[1], r[3], r[0]]];
    for (const [A, B, C] of tris) {
      const ids = [A, B, C];
      const edgeIds = [edgeOf(A, B), edgeOf(B, C), edgeOf(C, A)]; // -1 = quad diagonal
      const straight = edgeIds.map((e) => (e >= 0 ? crease[e] === 1 : false));
      const ns = sharp ? [fn, fn, fn] : ids.map((v) => [N(v, 0), N(v, 1), N(v, 2)]);
      const aoV = ids.map((v) => Math.round(c.ao[v] * 255));
      // grid points
      const gid = new Map();
      const pointId = (j, k) => {
        const key = j * 64 + k;
        if (gid.has(key)) return gid.get(key);
        const i = L - j - k;
        let id;
        // which feature? corner / edge / interior; reference vertex for canonical evaluation
        let ref, u, v, w, rkey, vsIdx;
        if ((i === L) || (j === L) || (k === L)) {
          const vtx = i === L ? A : j === L ? B : C;
          const which = i === L ? 0 : j === L ? 1 : 2;
          for (let a = 0; a < 3; a++) P[a] = P256(c, vtx, a);
          id = emit(`v${vtx}`, material, sharp, P, ns[which], aoV[which]);
          gid.set(key, id);
          return id;
        }
        // edge points: evaluate with the edge's canonical orientation (lower id first)
        let ea = -1, eb = -1, s = 0, ek;
        if (k === 0) { ea = A; eb = B; s = j; ek = edgeIds[0]; }
        else if (i === 0) { ea = B; eb = C; s = k; ek = edgeIds[1]; }
        else if (j === 0) { ea = A; eb = C; s = k; ek = edgeIds[2]; }
        let Pv, Nv, AOv;
        if (ea >= 0) {
          const lo = Math.min(ea, eb), hi = Math.max(ea, eb);
          const sc = ea === lo ? s : L - s; // steps from lo
          const tt = sc / L;
          // evaluate the edge curve as a degenerate triangle (lo, hi, *) with w = 0
          const isStraight = ek >= 0 ? crease[ek] === 1 : false;
          const ref = lo;
          const vs = [[rel(lo, ref, 0), rel(lo, ref, 1), rel(lo, ref, 2)], [rel(hi, ref, 0), rel(hi, ref, 1), rel(hi, ref, 2)], [0, 0, 0]];
          const nl = sharp ? fn : [N(lo, 0), N(lo, 1), N(lo, 2)], nh = sharp ? fn : [N(hi, 0), N(hi, 1), N(hi, 2)];
          evalPatch(vs, [nl, nh, nl], [isStraight, true, true], sharp, 1 - tt, tt, 0, P, NN);
          for (let a = 0; a < 3; a++) P[a] = corner256(ref, a) + Math.round(P[a] * 256);
          const aoLo = Math.round(c.ao[lo] * 255), aoHi = Math.round(c.ao[hi] * 255);
          AOv = Math.round((1 - tt) * aoLo + tt * aoHi);
          rkey = ek >= 0 ? `e${ek}:${sc}` : `d${lo}-${hi}:${sc}`;
          id = emit(rkey, material, sharp, P, NN, AOv);
        } else {
          const ref = A;
          const vs = ids.map((vv) => [rel(vv, ref, 0), rel(vv, ref, 1), rel(vv, ref, 2)]);
          evalPatch(vs, ns, straight, sharp, i / L, j / L, k / L, P, NN);
          for (let a = 0; a < 3; a++) P[a] = corner256(ref, a) + Math.round(P[a] * 256);
          AOv = Math.round((i * aoV[0] + j * aoV[1] + k * aoV[2]) / L);
          id = emit(`t${q}:${A}:${j}:${k}`, material, sharp, P, NN, AOv);
        }
        gid.set(key, id);
        return id;
      };
      for (let k = 0; k < L; k++) {
        for (let j = 0; j + k < L; j++) {
          tri.push(pointId(j, k), pointId(j + 1, k), pointId(j, k + 1));
          triQuad.push(ownIdx[q]);
          if (j + k <= L - 2) {
            tri.push(pointId(j + 1, k), pointId(j + 1, k + 1), pointId(j, k + 1));
            triQuad.push(ownIdx[q]);
          }
        }
      }
    }
  }
  const V = pos.length / 3;
  return {
    V, pos: Float64Array.from(pos), nrm: Float64Array.from(nrm), mat: Uint8Array.from(mat), flags: Uint8Array.from(flags),
    ao: Float64Array.from(ao), T: tri.length / 3, tri: Uint32Array.from(tri), triQuad: Int32Array.from(triQuad),
    quadCount, quadLower, quadAxis, quadSolidLower, corner: null,
  };
}

// ------------------------------------------------------------ generic CC on integer quad meshes
// A level: { NV, P (Float64Array, integer 1/256 units), quads (Int32Array ×4,
// CCW from air), nQ, qSharp (Uint8Array), root (Int32Array: control quad of
// each quad), AO (Float64Array, u8 units), box (optional per-vertex
// [lo0,lo1,lo2,hi0,hi1,hi2] in 1/256 units around a lattice corner, + corner) }.
// All position arithmetic is exact integer numerators over one integer
// denominator, so results do not depend on summation order or on which
// chunk computes them.

export function levelFromControl(c) {
  const V = c.vertCount;
  const P = new Float64Array(V * 3), AO = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    for (let a = 0; a < 3; a++) P[v * 3 + a] = P256(c, v, a);
    AO[v] = Math.round(c.ao[v] * 255);
  }
  const root = new Int32Array(c.quadCount);
  for (let q = 0; q < c.quadCount; q++) root[q] = q;
  return { NV: V, P, AO, quads: c.ring, nQ: c.quadCount, qSharp: c.sharp, root };
}

export function levelTopology(L) {
  const { NV, quads, nQ, qSharp } = L;
  const vqStart = new Int32Array(NV + 1);
  for (let k = 0; k < nQ * 4; k++) vqStart[quads[k] + 1]++;
  for (let v = 0; v < NV; v++) vqStart[v + 1] += vqStart[v];
  const vqList = new Int32Array(nQ * 4), vqSlot = new Int8Array(nQ * 4);
  const fill = vqStart.slice(0, NV);
  for (let q = 0; q < nQ; q++) for (let j = 0; j < 4; j++) { const v = quads[q * 4 + j]; vqSlot[fill[v]] = j; vqList[fill[v]++] = q; }
  const emap = new Map();
  const ev = [], eq = [], eqn = [];
  const quadEdge = new Int32Array(nQ * 4);
  for (let q = 0; q < nQ; q++) {
    for (let j = 0; j < 4; j++) {
      const a = quads[q * 4 + j], b = quads[q * 4 + ((j + 1) & 3)];
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const key = lo * NV + hi;
      let e = emap.get(key);
      if (e === undefined) { e = eqn.length; emap.set(key, e); ev.push(lo, hi); eq.push(-1, -1, -1, -1); eqn.push(0); }
      if (eqn[e] < 4) eq[e * 4 + eqn[e]] = q;
      eqn[e]++;
      quadEdge[q * 4 + j] = e;
    }
  }
  const E = eqn.length;
  const crease = new Uint8Array(E);
  for (let e = 0; e < E; e++) crease[e] = eqn[e] !== 2 || qSharp[eq[e * 4]] || qSharp[eq[e * 4 + 1]] ? 1 : 0;
  // vertex → incident edges
  const veStart = new Int32Array(NV + 1);
  for (let e = 0; e < E; e++) { veStart[ev[e * 2] + 1]++; veStart[ev[e * 2 + 1] + 1]++; }
  for (let v = 0; v < NV; v++) veStart[v + 1] += veStart[v];
  const veList = new Int32Array(E * 2);
  const f2 = veStart.slice(0, NV);
  for (let e = 0; e < E; e++) { veList[f2[ev[e * 2]]++] = e; veList[f2[ev[e * 2 + 1]]++] = e; }
  // classes: 0 smooth, 1 crease(2 crease edges), 2 fixed
  const vclass = new Uint8Array(NV);
  const creaseNbr = new Int32Array(NV * 2).fill(-1);
  for (let v = 0; v < NV; v++) {
    const q0 = vqStart[v], q1 = vqStart[v + 1];
    if (q0 === q1) continue;
    let sharp = false;
    for (let k = q0; k < q1; k++) if (qSharp[vqList[k]]) sharp = true;
    let nC = 0;
    const nE = veStart[v + 1] - veStart[v];
    for (let k = veStart[v]; k < veStart[v + 1]; k++) {
      const e = veList[k];
      if (!crease[e]) continue;
      if (nC < 2) creaseNbr[v * 2 + nC] = ev[e * 2] === v ? ev[e * 2 + 1] : ev[e * 2];
      nC++;
    }
    // manifold single fan: every incident edge has exactly 2 quads, nE == nQv, connected
    const n = q1 - q0;
    let fans = 0;
    const seen = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      fans++;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const a = stack.pop();
        const qa = vqList[q0 + a];
        for (let j = 0; j < 4; j++) {
          const e = quadEdge[qa * 4 + j];
          if (ev[e * 2] !== v && ev[e * 2 + 1] !== v) continue;
          if (eqn[e] !== 2) continue;
          const other = eq[e * 4] === qa ? eq[e * 4 + 1] : eq[e * 4];
          for (let b = 0; b < n; b++) if (!seen[b] && vqList[q0 + b] === other) { seen[b] = 1; stack.push(b); }
        }
      }
    }
    let open = false;
    for (let k = veStart[v]; k < veStart[v + 1]; k++) if (eqn[veList[k]] === 1) open = true;
    if (sharp || fans > 1 || nC > 2 || open || (nC === 0 && nE !== n)) vclass[v] = 2;
    else if (nC === 2) vclass[v] = 1;
    else vclass[v] = 0;
  }
  return { E, ev: Int32Array.from(ev), eq: Int32Array.from(eq), eqn: Int32Array.from(eqn), quadEdge, crease, vqStart, vqList, vqSlot, veStart, veList, vclass, creaseNbr };
}

/** One CC step. opts.box(v) → null | {c:[x,y,z]*256, lo:[..], hi:[..]} clamps vertex points. */
export function ccStep(L, T, opts = {}) {
  const { NV, P, AO, quads, nQ, qSharp, root } = L;
  const { E, ev, eq, quadEdge, crease, vqStart, vqList, veStart, veList, vclass, creaseNbr } = T;
  const NV2 = NV + E + nQ;
  const P2 = new Float64Array(NV2 * 3), AO2 = new Float64Array(NV2);
  const S4 = new Float64Array(nQ * 3);
  for (let q = 0; q < nQ; q++) {
    const id = NV + E + q;
    let ao = 0;
    for (let j = 0; j < 4; j++) ao += AO[quads[q * 4 + j]];
    AO2[id] = rdiv(ao, 4);
    for (let a = 0; a < 3; a++) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += P[quads[q * 4 + j] * 3 + a];
      S4[q * 3 + a] = s;
      P2[id * 3 + a] = rdiv(s, 4);
    }
  }
  for (let e = 0; e < E; e++) {
    const a0 = ev[e * 2], a1 = ev[e * 2 + 1], id = NV + e;
    AO2[id] = rdiv(AO[a0] + AO[a1], 2);
    for (let a = 0; a < 3; a++) {
      const p0 = P[a0 * 3 + a], p1 = P[a1 * 3 + a];
      P2[id * 3 + a] = crease[e] ? rdiv(p0 + p1, 2) : rdiv(4 * p0 + 4 * p1 + S4[eq[e * 4] * 3 + a] + S4[eq[e * 4 + 1] * 3 + a], 16);
    }
  }
  for (let v = 0; v < NV; v++) {
    const q0 = vqStart[v], q1 = vqStart[v + 1];
    AO2[v] = AO[v];
    if (q0 === q1) { for (let a = 0; a < 3; a++) P2[v * 3 + a] = P[v * 3 + a]; continue; }
    for (let a = 0; a < 3; a++) {
      const S = P[v * 3 + a];
      if (vclass[v] === 2) { P2[v * 3 + a] = S; continue; }
      if (vclass[v] === 1) { P2[v * 3 + a] = rdiv(P[creaseNbr[v * 2] * 3 + a] + 6 * S + P[creaseNbr[v * 2 + 1] * 3 + a], 8); continue; }
      const n = q1 - q0;
      let sf = 0, se = 0;
      for (let k = q0; k < q1; k++) sf += S4[vqList[k] * 3 + a];
      for (let k = veStart[v]; k < veStart[v + 1]; k++) { const e = veList[k]; se += P[(ev[e * 2] === v ? ev[e * 2 + 1] : ev[e * 2]) * 3 + a]; }
      P2[v * 3 + a] = rdiv(sf + 4 * se + 4 * (n * n - 2 * n) * S, 4 * n * n);
    }
    if (opts.box) {
      const b = opts.box(v);
      if (b) for (let a = 0; a < 3; a++) {
        const off = P2[v * 3 + a] - b.c[a];
        P2[v * 3 + a] = b.c[a] + (off < b.lo[a] ? b.lo[a] : off > b.hi[a] ? b.hi[a] : off);
      }
    }
  }
  const q2 = new Int32Array(nQ * 16), sharp2 = new Uint8Array(nQ * 4), root2 = new Int32Array(nQ * 4);
  for (let q = 0; q < nQ; q++) {
    const f = NV + E + q;
    for (let j = 0; j < 4; j++) {
      const o = (q * 4 + j) * 4;
      q2[o] = quads[q * 4 + j];
      q2[o + 1] = NV + quadEdge[q * 4 + j];
      q2[o + 2] = f;
      q2[o + 3] = NV + quadEdge[q * 4 + ((j + 3) & 3)];
      sharp2[q * 4 + j] = qSharp[q];
      root2[q * 4 + j] = root[q];
    }
  }
  return { NV: NV2, P: P2, AO: AO2, quads: q2, nQ: nQ * 4, qSharp: sharp2, root: root2 };
}

/** Push every vertex to the CC limit surface (positions only). */
export function ccLimit(L, T) {
  const { NV, P, quads } = L;
  const { vqStart, vqList, vqSlot, vclass, creaseNbr, veStart } = T;
  const P2 = new Float64Array(NV * 3);
  for (let v = 0; v < NV; v++) {
    const q0 = vqStart[v], q1 = vqStart[v + 1];
    for (let a = 0; a < 3; a++) {
      const S = P[v * 3 + a];
      if (q0 === q1 || vclass[v] === 2) { P2[v * 3 + a] = S; continue; }
      if (vclass[v] === 1) { P2[v * 3 + a] = rdiv(P[creaseNbr[v * 2] * 3 + a] + 4 * S + P[creaseNbr[v * 2 + 1] * 3 + a], 6); continue; }
      const n = q1 - q0;
      // Σe over distinct edge neighbours = ½ Σ_quads (next + prev); Σf = Σ_quads opposite
      let snp = 0, sf = 0;
      for (let k = q0; k < q1; k++) {
        const q = vqList[k], j = vqSlot[k];
        snp += P[quads[q * 4 + ((j + 1) & 3)] * 3 + a] + P[quads[q * 4 + ((j + 3) & 3)] * 3 + a];
        sf += P[quads[q * 4 + ((j + 2) & 3)] * 3 + a];
      }
      // (n² S + 4 Σe + Σf) / (n(n+5)) with Σe = snp/2
      P2[v * 3 + a] = rdiv(n * n * S + 2 * snp + sf, n * (n + 5));
    }
  }
  return { ...L, P: P2 };
}

/** Area-weighted (exact integer) normals of a level, sharp quads excluded. */
export function levelNormals(L) {
  return quadNormals(L.NV, L.P, L.quads, L.nQ, (k) => L.qSharp[k] === 1);
}

/** Emit a level's owned quads (by root control quad) as a plain mesh. */
export function emitLevel(c, L, nacc) {
  return emitQuadMesh(c, L.NV, L.P, L.AO, L.quads, L.nQ, (k) => L.root[k], nacc);
}

/** Map vertex normals of the control mesh through CC-like linear
 *  subdivision (bilinear), for shading a refined level with coarse normals. */
export function bilinearNormals(c, levels) {
  // returns nacc for the final level: start from control normals
  let N = new Float64Array(c.vertCount * 3);
  for (let i = 0; i < c.vertCount * 3; i++) N[i] = c.nrm[i];
  for (const { L, T } of levels) {
    const { NV, quads, nQ } = L;
    const N2 = new Float64Array((NV + T.E + nQ) * 3);
    for (let v = 0; v < NV; v++) for (let a = 0; a < 3; a++) N2[v * 3 + a] = N[v * 3 + a];
    for (let e = 0; e < T.E; e++) for (let a = 0; a < 3; a++) N2[(NV + e) * 3 + a] = N[T.ev[e * 2] * 3 + a] + N[T.ev[e * 2 + 1] * 3 + a];
    for (let q = 0; q < nQ; q++) for (let a = 0; a < 3; a++) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += N[quads[q * 4 + j] * 3 + a];
      N2[(NV + T.E + q) * 3 + a] = s;
    }
    N = N2;
  }
  return N;
}

// ------------------------------------------------------------ variant builder
/**
 * buildCC(region, { levels, limit, normals: 'area'|'bilinear', guard, params })
 *  levels: CC steps (0 = control mesh); limit: project the last level to the
 *  limit surface; guard: clamp level-1 vertex points to the control
 *  vertex's constraint box (thin-feature guard, D-3 caps, sharp pins).
 */
export function buildCC(region, o = {}) {
  const { c } = controlMesh(region, o.params ?? {});
  let L = levelFromControl(c);
  const hist = [];
  for (let i = 0; i < (o.levels ?? 1); i++) {
    const T = levelTopology(L);
    hist.push({ L, T });
    const box = o.guard && i === 0 ? (v) => {
      const cc = [c.cx[v] * 256, c.cy[v] * 256, c.cz[v] * 256];
      const lo = [0, 0, 0], hi = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        const d0 = c.dq[v * 3 + a];
        lo[a] = Math.min(Math.ceil(c.lo[v * 3 + a] * 256 - 1e-9), d0);
        hi[a] = Math.max(Math.floor(c.hi[v * 3 + a] * 256 + 1e-9), d0);
      }
      return { c: cc, lo, hi };
    } : null;
    L = ccStep(L, T, { box });
  }
  if (o.limit) L = ccLimit(L, levelTopology(L));
  const nacc = o.normals === 'bilinear' ? bilinearNormals(c, hist) : levelNormals(L);
  const out = emitLevel(c, L, nacc);
  out.__level = L; out.__control = c;
  return out;
}

// ------------------------------------------------------------ adaptive CC (edited regions only)
/**
 * One CC level applied only to control quads with a vertex in the
 * relaxation set R (a cell holding a shape-edited block); the rest stays the
 * production mesh. An edge is split when any incident quad is refined, and an
 * unrefined quad with split edges becomes a fan around its centroid, so
 * there are no T-junction cracks. Positions: CC level-1 points for every
 * vertex of a refined quad, production positions elsewhere. Normals: the
 * production normals, interpolated bilinearly at new points (so shading is
 * the production normal field). With no edits within reach the output is
 * byte-for-byte the production mesh.
 * opts.ring: also refine quads within this many quad-rings of R (0 default).
 */
export function buildCCAdaptive(region, opts = {}) {
  // margin 1 suffices: CC points of owned quads read only their 1-ring;
  // normals are the production normals (interpolated).
  const { full, c } = controlMesh(region, opts.params ?? {}, opts.margin ?? 1);
  const V = c.vertCount, Q = c.quadCount;
  // refine flags
  let ref = new Uint8Array(Q);
  for (let q = 0; q < Q; q++) for (let j = 0; j < 4; j++) if (c.inR[c.ring[q * 4 + j]]) ref[q] = 1;
  for (let r = 0; r < (opts.ring ?? 0); r++) {
    const vmark = new Uint8Array(V);
    for (let q = 0; q < Q; q++) if (ref[q]) for (let j = 0; j < 4; j++) vmark[c.ring[q * 4 + j]] = 1;
    const ref2 = ref.slice();
    for (let q = 0; q < Q; q++) for (let j = 0; j < 4; j++) if (vmark[c.ring[q * 4 + j]]) ref2[q] = 1;
    ref = ref2;
  }
  let any = false;
  for (let q = 0; q < Q; q++) if (ref[q] && c.owned[q]) any = true;
  if (!any) return decodeMesh(full); // nothing edited within reach: the production mesh, untouched
  // optional clamp of CC vertex points: 'hw' = thin-feature guard only
  // (±hw around the lattice corner), 'box' = the mesher's full box (guard,
  // D-3 caps, pins); never tighter than the production position itself.
  const box = opts.guard === 'hw' || opts.guard === 'box' ? (v) => {
    const cc = [c.cx[v] * 256, c.cy[v] * 256, c.cz[v] * 256];
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const d0 = c.dq[v * 3 + a];
      const l = opts.guard === 'hw' ? -c.hw[v] : c.lo[v * 3 + a];
      const h = opts.guard === 'hw' ? c.hw[v] : c.hi[v * 3 + a];
      lo[a] = Math.min(Math.ceil(l * 256 - 1e-9), d0);
      hi[a] = Math.max(Math.floor(h * 256 + 1e-9), d0);
    }
    return { c: cc, lo, hi };
  } : null;
  const L0 = levelFromControl(c);
  const T0 = levelTopology(L0);
  const E = T0.E;
  const L1 = ccStep(L0, T0, { box });
  if (opts.capEdges) {
    // D-3 for new points: where either endpoint's box carries a clearance cap,
    // an edge point may not move toward air (along the production normal)
    // beyond the edge midpoint.
    const capped = (v) => {
      for (let a = 0; a < 3; a++) if (c.hi[v * 3 + a] < c.hw[v] - 1e-9 || c.lo[v * 3 + a] > -c.hw[v] + 1e-9) return true;
      return false;
    };
    for (let e = 0; e < T0.E; e++) {
      const a0 = T0.ev[e * 2], a1 = T0.ev[e * 2 + 1];
      if (!capped(a0) && !capped(a1)) continue;
      const id = V + e;
      const n = [0, 1, 2].map((a) => c.nrm[a0 * 3 + a] + c.nrm[a1 * 3 + a]);
      const ln = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
      if (ln < 1e-9) continue;
      const mid = [0, 1, 2].map((a) => (L0.P[a0 * 3 + a] + L0.P[a1 * 3 + a]) / 2);
      const d = [0, 1, 2].map((a) => L1.P[id * 3 + a] - mid[a]);
      const dn = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / ln;
      if (dn <= 0) continue;
      for (let a = 0; a < 3; a++) L1.P[id * 3 + a] = Math.round(mid[a] + d[a] - (dn * n[a]) / ln);
    }
  }
  // vertex uses refined position if any incident quad is refined
  const vRef = new Uint8Array(V);
  for (let q = 0; q < Q; q++) if (ref[q]) for (let j = 0; j < 4; j++) vRef[c.ring[q * 4 + j]] = 1;
  const eSplit = new Uint8Array(E);
  for (let e = 0; e < E; e++) for (let k = 0; k < Math.min(4, T0.eqn[e]); k++) if (ref[T0.eq[e * 4 + k]]) eSplit[e] = 1;
  // final positions (integer 1/256 units; centroids at 1/1024 → keep ×4 for fans)
  const pos = (id, a) => (id < V ? (vRef[id] ? L1.P[id * 3 + a] : L0.P[id * 3 + a]) : L1.P[id * 3 + a]);
  // normals: production normals at control vertices; sums at new points
  const N = new Float64Array(L1.NV * 3);
  for (let v = 0; v < V; v++) for (let a = 0; a < 3; a++) N[v * 3 + a] = c.nrm[v * 3 + a];
  for (let e = 0; e < E; e++) for (let a = 0; a < 3; a++) N[(V + e) * 3 + a] = c.nrm[T0.ev[e * 2] * 3 + a] + c.nrm[T0.ev[e * 2 + 1] * 3 + a];
  for (let q = 0; q < Q; q++) for (let a = 0; a < 3; a++) {
    let s = 0;
    for (let j = 0; j < 4; j++) s += c.nrm[c.ring[q * 4 + j] * 3 + a];
    N[(V + E + q) * 3 + a] = s;
  }
  // emit owned quads
  const ownIdx = new Int32Array(Q).fill(-1);
  let quadCount = 0;
  for (let q = 0; q < Q; q++) if (c.owned[q]) ownIdx[q] = quadCount++;
  const quadLower = new Int32Array(quadCount * 3), quadAxis = new Uint8Array(quadCount), quadSolidLower = new Uint8Array(quadCount);
  for (let q = 0; q < Q; q++) {
    const i = ownIdx[q];
    if (i < 0) continue;
    const rec = c.pick[q];
    const li = rec & 0x7fff;
    quadLower[i * 3] = li % 32; quadLower[i * 3 + 1] = Math.floor(li / 1024); quadLower[i * 3 + 2] = Math.floor(li / 32) % 32;
    quadAxis[i] = (rec >> 15) & 3; quadSolidLower[i] = (rec >> 17) & 1;
  }
  const P = [], NR = [], MAT = [], FL = [], AOo = [], TRI = [], TQ = [];
  const weld = new Map();
  const tmp = [0, 0, 0];
  const aoOf = (id) => (id < V ? L0.AO[id] : L1.AO[id]);
  const vert = (key, p4, n, material, sharp, ao) => {
    const k = sharp ? null : key * 8 + material;
    if (k !== null) { const w = weld.get(k); if (w !== undefined) return w; }
    const out = P.length / 3;
    P.push(p4[0] / 1024, p4[1] / 1024, p4[2] / 1024);
    const l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    octRoundTrip(n[0] / l, n[1] / l, n[2] / l, tmp, 0);
    NR.push(tmp[0], tmp[1], tmp[2]); MAT.push(material); FL.push(sharp ? 1 : 0); AOo.push(Math.max(0, Math.min(255, ao)) / 255);
    if (k !== null) weld.set(k, out);
    return out;
  };
  const NVfan = L1.NV; // keys for fan centroids: NVfan + q
  for (let q = 0; q < Q; q++) {
    if (ownIdx[q] < 0) continue;
    const sharp = c.sharp[q] === 1;
    const material = c.material[q];
    const fn = [0, 0, 0];
    if (sharp) fn[c.axis[q]] = c.solidIsLower[q] ? 1 : -1;
    const nrmOf = (id) => (sharp ? fn : [N[id * 3], N[id * 3 + 1], N[id * 3 + 2]]);
    const p4 = (id) => [pos(id, 0) * 4, pos(id, 1) * 4, pos(id, 2) * 4];
    const r = [c.ring[q * 4], c.ring[q * 4 + 1], c.ring[q * 4 + 2], c.ring[q * 4 + 3]];
    const eids = [0, 1, 2, 3].map((j) => T0.quadEdge[q * 4 + j]);
    const push = (a, b, cc) => { TRI.push(a, b, cc); TQ.push(ownIdx[q]); };
    const d2 = (i, j) => { let s = 0; for (let a = 0; a < 3; a++) { const d = pos(i, a) - pos(j, a); s += d * d; } return s; };
    const quadOut = (ids) => {
      const vs = ids.map((id) => vert(id, p4(id), nrmOf(id), material, sharp, aoOf(id)));
      if (d2(ids[0], ids[2]) <= d2(ids[1], ids[3])) { push(vs[0], vs[1], vs[2]); push(vs[0], vs[2], vs[3]); }
      else { push(vs[1], vs[2], vs[3]); push(vs[1], vs[3], vs[0]); }
    };
    if (ref[q]) {
      const f = V + E + q;
      for (let j = 0; j < 4; j++) quadOut([r[j], V + eids[j], f, V + eids[(j + 3) & 3]]);
      continue;
    }
    const nSplit = eids.reduce((s, e) => s + eSplit[e], 0);
    if (nSplit === 0) { quadOut(r); continue; }
    // fan around the centroid of the (final) corners
    // centroid rounded to the 1/256 grid the vertex format stores (×4 for p4 units)
    const cen = [0, 1, 2].map((a) => 4 * rdiv(r.reduce((s, id) => s + pos(id, a), 0), 4));
    const cn = [0, 1, 2].map((a) => r.reduce((s, id) => s + nrmOf(id)[a], 0));
    const cao = Math.round(r.reduce((s, id) => s + aoOf(id), 0) / 4);
    const ci = vert(NVfan + q, cen, sharp ? fn : cn, material, sharp, cao);
    const bnd = [];
    for (let j = 0; j < 4; j++) {
      bnd.push(r[j]);
      if (eSplit[eids[j]]) bnd.push(V + eids[j]);
    }
    const bv = bnd.map((id) => vert(id, p4(id), nrmOf(id), material, sharp, aoOf(id)));
    for (let j = 0; j < bv.length; j++) push(ci, bv[j], bv[(j + 1) % bv.length]);
  }
  const Vn = P.length / 3;
  return {
    V: Vn, pos: Float64Array.from(P), nrm: Float64Array.from(NR), mat: Uint8Array.from(MAT), flags: Uint8Array.from(FL),
    ao: Float64Array.from(AOo), T: TRI.length / 3, tri: Uint32Array.from(TRI), triQuad: Int32Array.from(TQ),
    quadCount, quadLower, quadAxis, quadSolidLower, corner: null,
  };
}
