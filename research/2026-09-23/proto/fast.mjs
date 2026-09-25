// Reasonably optimized single-thread mesher for timing: binary surface nets + guarded damped-Jacobi relaxation.
// occ: Uint8Array S^3 (0 air, 1 smooth, 2 sharp). Output region: blocks [A, A+N)^3 own faces.
const DX = [-1, 1, 0, 0, 0, 0], DY = [0, 0, -1, 1, 0, 0], DZ = [0, 0, 0, 0, -1, 1];
const Q4 = new Int32Array(4), O4 = new Int32Array(4);
const GUARD = new Float32Array([0.2, 0.25, 0.3, 0.5, 0.5, 0.5, 0.5]);

export const T = { guard: 0, verts: 0, adj: 0, relax: 0, emit: 0 };
export function mesh(occ, S, A, N, k, lambda = 0.5, quant = 256, shrink = true, offsetSpace = false) {
  const S2 = S * S; let t0 = performance.now(), t1;
  // 1. per-block clamp radius r (thin-feature guard; sharp -> 0)
  const r = new Float32Array(S * S2).fill(0.5);
  for (let z = 1; z < S - 1; z++) for (let y = 1; y < S - 1; y++) {
    let i = 1 + S * (y + S * z);
    for (let x = 1; x < S - 1; x++, i++) {
      const b = occ[i];
      if (b === 2) { r[i] = 0; continue; }
      const st = b !== 0;
      const n6 = ((occ[i - 1] !== 0) === st) + ((occ[i + 1] !== 0) === st) + ((occ[i - S] !== 0) === st) +
        ((occ[i + S] !== 0) === st) + ((occ[i - S2] !== 0) === st) + ((occ[i + S2] !== 0) === st);
      r[i] = GUARD[n6];
    }
  }
  t1 = performance.now(); T.guard += t1 - t0; t0 = t1;
  // 2. vertices on corners. corner (x,y,z) indexes like block (x,y,z) in an S^3 grid; its dual cell = blocks x-1..x etc.
  const cid = new Int32Array(S * S2).fill(-1);
  let cap = 1 << 16;
  let ccorner = new Int32Array(cap), cmask = new Uint8Array(cap), ch = new Float32Array(cap), cpin = new Uint8Array(cap);
  let V = 0;
  const lo = 2, hi = S - 1; // corners with full dual cells and guard data
  for (let z = lo; z < hi; z++) for (let y = lo; y < hi; y++) {
    let i = lo + S * (y + S * z);
    for (let x = lo; x < hi; x++, i++) {
      const b0 = occ[i - 1 - S - S2], b1 = occ[i - S - S2], b2 = occ[i - 1 - S2], b3 = occ[i - S2],
        b4 = occ[i - 1 - S], b5 = occ[i - S], b6 = occ[i - 1], b7 = occ[i];
      const mask = (b0 !== 0) | ((b1 !== 0) << 1) | ((b2 !== 0) << 2) | ((b3 !== 0) << 3) |
        ((b4 !== 0) << 4) | ((b5 !== 0) << 5) | ((b6 !== 0) << 6) | ((b7 !== 0) << 7);
      if (mask === 0 || mask === 255) continue;
      if (V === cap) { cap *= 2; ccorner = grow(ccorner, cap); cmask = grow(cmask, cap); ch = grow(ch, cap); cpin = grow(cpin, cap); }
      cid[i] = V; ccorner[V] = i; cmask[V] = mask;
      const h = Math.min(r[i - 1 - S - S2], r[i - S - S2], r[i - 1 - S2], r[i - S2], r[i - 1 - S], r[i - S], r[i - 1], r[i]);
      ch[V] = h; cpin[V] = h === 0 ? 1 : 0;
      V++;
    }
  }
  t1 = performance.now(); T.verts += t1 - t0; t0 = t1;
  // 3. adjacency from the mask: edge c -> c+x exists iff the 4 blocks with dx=0 (bits 1,3,5,7) are mixed, etc.
  const nb = new Int32Array(V * 6).fill(-1);
  const HALF = [0b01010101, 0b10101010, 0b00110011, 0b11001100, 0b00001111, 0b11110000]; // -x,+x,-y,+y,-z,+z
  const OFF = [-1, 1, -S, S, -S2, S2];
  for (let v = 0; v < V; v++) {
    const m = cmask[v], c = ccorner[v];
    for (let d = 0; d < 6; d++) {
      const hm = m & HALF[d];
      if (hm === 0 || hm === HALF[d]) continue;
      nb[v * 6 + d] = cid[c + OFF[d]]; // exists (neighbour cell shares the mixed half); -1 at grid edge
    }
  }
  t1 = performance.now(); T.adj += t1 - t0; t0 = t1;
  // 4. relaxation
  let P = new Float32Array(V * 3), Q = new Float32Array(V * 3);
  const cx = new Float32Array(V * 3);
  for (let v = 0; v < V; v++) {
    const c = ccorner[v];
    const x = c % S, y = ((c / S) | 0) % S, z = (c / S2) | 0;
    cx[3 * v] = P[3 * v] = x; cx[3 * v + 1] = P[3 * v + 1] = y; cx[3 * v + 2] = P[3 * v + 2] = z;
  }
  // ring distance (Linf) of each corner outside the corner box [A-1, A+N+1] whose final positions are needed
  const dist = new Uint8Array(V);
  if (shrink) for (let v = 0; v < V; v++) {
    const X = cx[3 * v], Y = cx[3 * v + 1], Z = cx[3 * v + 2];
    const dx = Math.max(0, A - 1 - X, X - (A + N + 1)), dy = Math.max(0, A - 1 - Y, Y - (A + N + 1)), dz = Math.max(0, A - 1 - Z, Z - (A + N + 1));
    dist[v] = Math.max(dx, dy, dz);
  }
  if (offsetSpace) P.fill(0);
  for (let it = 0; it < k; it++) {
    const dmax = k - 1 - it;
    for (let v = 0; v < V; v++) {
      const i3 = 3 * v;
      if (dist[v] > dmax) continue;
      let px = P[i3], py = P[i3 + 1], pz = P[i3 + 2];
      if (!cpin[v]) {
        let sx = 0, sy = 0, sz = 0, n = 0;
        if (offsetSpace) {
          // P holds offsets; neighbour position relative to this corner = unit step + neighbour offset
          for (let d = 0; d < 6; d++) {
            const w = nb[v * 6 + d];
            if (w < 0) continue;
            const w3 = 3 * w; sx += P[w3] + DX[d]; sy += P[w3 + 1] + DY[d]; sz += P[w3 + 2] + DZ[d]; n++;
          }
          if (n) {
            const inv = 1 / n, h = ch[v];
            px += lambda * (sx * inv - px); py += lambda * (sy * inv - py); pz += lambda * (sz * inv - pz);
            px = px < -h ? -h : px > h ? h : px; py = py < -h ? -h : py > h ? h : py; pz = pz < -h ? -h : pz > h ? h : pz;
          }
          Q[i3] = px; Q[i3 + 1] = py; Q[i3 + 2] = pz; continue;
        }
        for (let d = 0; d < 6; d++) {
          const w = nb[v * 6 + d];
          if (w < 0) continue;
          const w3 = 3 * w; sx += P[w3]; sy += P[w3 + 1]; sz += P[w3 + 2]; n++;
        }
        if (n) {
          const inv = 1 / n;
          px += lambda * (sx * inv - px); py += lambda * (sy * inv - py); pz += lambda * (sz * inv - pz);
          const h = ch[v], X = cx[i3], Y = cx[i3 + 1], Z = cx[i3 + 2];
          px = px < X - h ? X - h : px > X + h ? X + h : px;
          py = py < Y - h ? Y - h : py > Y + h ? Y + h : py;
          pz = pz < Z - h ? Z - h : pz > Z + h ? Z + h : pz;
        }
      }
      Q[i3] = px; Q[i3 + 1] = py; Q[i3 + 2] = pz;
    }
    const t = P; P = Q; Q = t;
  }
  t1 = performance.now(); T.relax += t1 - t0; t0 = t1;
  if (offsetSpace) for (let i = 0; i < V * 3; i++) P[i] = cx[i] + (quant ? Math.round(P[i] * quant) / quant : P[i]);
  else if (quant) for (let i = 0; i < V * 3; i++) P[i] = cx[i] + Math.round((P[i] - cx[i]) * quant) / quant;
  // 5. quads for owned faces + normals (accumulate over one extra layer so border normals match)
  const nrm = new Float32Array(V * 3);
  let idx = new Uint32Array(1 << 16), ni = 0;
  const outV = new Int32Array(V).fill(-1);
  let pos = new Float32Array(1 << 16), nout = 0; const vcorner = new Int32Array(V);
  const quadCorners = (i, a) => {
    // face between block i and i+e_a lies on plane at +1 along a; corners are corner-indices
    if (a === 0) return [i + 1, i + 1 + S, i + 1 + S + S2, i + 1 + S2];
    if (a === 1) return [i + S, i + S + S2, i + S + S2 + 1, i + S + 1];
    return [i + S2, i + S2 + 1, i + S2 + 1 + S, i + S2 + S];
  };
  const STEP = [1, S, S2];
  for (let pass = 0; pass < 2; pass++) {
    const b0 = pass === 0 ? A - 1 : A, b1 = pass === 0 ? A + N + 1 : A + N;
    for (let z = b0; z < b1; z++) for (let y = b0; y < b1; y++) for (let x = b0; x < b1; x++) {
      const i = x + S * (y + S * z);
      const s0 = occ[i] !== 0;
      for (let a = 0; a < 3; a++) {
        const s1 = occ[i + STEP[a]] !== 0;
        if (s0 === s1) continue;
        let c0, c1, c2, c3;
        if (a === 0) { c0 = i + 1; c1 = i + 1 + S; c2 = i + 1 + S + S2; c3 = i + 1 + S2; }
        else if (a === 1) { c0 = i + S; c1 = i + S + S2; c2 = i + S + S2 + 1; c3 = i + S + 1; }
        else { c0 = i + S2; c1 = i + S2 + 1; c2 = i + S2 + 1 + S; c3 = i + S2 + S; }
        const q0 = cid[c0], q2 = cid[c2];
        const q1 = s0 ? cid[c1] : cid[c3], q3 = s0 ? cid[c3] : cid[c1];
        Q4[0] = q0; Q4[1] = q1; Q4[2] = q2; Q4[3] = q3; const q = Q4;
        if (pass === 0) {
          const d1x = P[3 * q[2]] - P[3 * q[0]], d1y = P[3 * q[2] + 1] - P[3 * q[0] + 1], d1z = P[3 * q[2] + 2] - P[3 * q[0] + 2];
          const d2x = P[3 * q[3]] - P[3 * q[1]], d2y = P[3 * q[3] + 1] - P[3 * q[1] + 1], d2z = P[3 * q[3] + 2] - P[3 * q[1] + 2];
          const nx = d1y * d2z - d1z * d2y, ny = d1z * d2x - d1x * d2z, nz = d1x * d2y - d1y * d2x;
          for (let j = 0; j < 4; j++) { const w = 3 * q[j]; nrm[w] += nx; nrm[w + 1] += ny; nrm[w + 2] += nz; }
        } else {
          if (ni + 6 > idx.length) idx = grow(idx, idx.length * 2);
          const o = O4;
          for (let j = 0; j < 4; j++) {
            let ov = outV[q[j]];
            if (ov < 0) { if (nout * 6 + 6 > pos.length) pos = grow(pos, pos.length * 2); ov = outV[q[j]] = nout++; vcorner[ov] = ccorner[q[j]];
              const w = 3 * q[j]; const l = Math.hypot(nrm[w], nrm[w + 1], nrm[w + 2]) || 1;
              pos[6 * ov] = P[w]; pos[6 * ov + 1] = P[w + 1]; pos[6 * ov + 2] = P[w + 2];
              pos[6 * ov + 3] = nrm[w] / l; pos[6 * ov + 4] = nrm[w + 1] / l; pos[6 * ov + 5] = nrm[w + 2] / l; }
            o[j] = ov;
          }
          idx[ni++] = o[0]; idx[ni++] = o[1]; idx[ni++] = o[2]; idx[ni++] = o[0]; idx[ni++] = o[2]; idx[ni++] = o[3];
        }
      }
    }
  }
  t1 = performance.now(); T.emit += t1 - t0;
  return { V, vcorner, S, verts: nout, tris: ni / 3, pos: pos.subarray(0, nout * 6), idx: idx.subarray(0, ni) };
}
function grow(a, n) { const b = new a.constructor(n); b.set(a); return b; }
