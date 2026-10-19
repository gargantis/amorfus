// mf — production-shaped implementation of the isotropic material field
// (the shape a mesher pass would take): flat typed arrays, constant weight
// tables, fixed summation order, only + − × ÷ and comparisons on stored
// values. Same results as field.mjs with kernel 'gauss' (separable),
// guard 'support', diag 'auto'.
//
//   pass A  surface mask (solid, not sharp, an air 6-neighbour)
//   pass B  self-support s of every surface block within reach of the chunk:
//           own-material share of the kernel at its centre (window ±H2);
//           boost = τ(1 − s)/((1 − τ)s) where s < τ, else 1
//   pass C  per vertex: field at its lattice corner (window ±H blocks),
//           r_m = w_m − w_own, clamped to ±R, quantised to `bits`
//   pass D  per quad the boundary crosses: field at the face centre; flip
//           the diagonal if the other one's midpoint matches the centre
//           better and the twist ≤ flipTwist; fan around the kept
//           diagonal's midpoint if that midpoint shows the wrong winner.

const AIR = 0;
const SHARP = 256;

export function makeFast(o) {
  const sigma = o.sigma, trunc = o.trunc ?? 2.5, tau = o.tau ?? 0.55;
  const tau1 = o.tau1 ?? tau, sLone = o.sLone ?? 0.15, sLine = o.sLine ?? 0.25;
  const R = o.R ?? 0.5, bits = o.bits ?? 5, flipTwist = o.flipTwist ?? 0.03;
  const H = Math.floor(trunc + 0.5); // corner window: blocks c−H … c+H−1
  const k1 = (t) => Math.exp(-(t * t) / (2 * sigma * sigma)); // build-time only: a literal table in production
  // 1-D tables: half-integer offsets (corner / face-normal axis) and integer offsets (block centre / face tangents)
  const HALF = new Float64Array(2 * H); // index j ↔ offset j − H + 0.5
  for (let j = 0; j < 2 * H; j++) { const t = j - H + 0.5; HALF[j] = Math.abs(t) <= trunc ? k1(t) : 0; }
  const HI = Math.floor(trunc); // integer offsets −HI … HI (face tangents)
  const HS = Math.floor(o.truncS ?? trunc); // support window: integer offsets −HS … HS
  const INT = new Float64Array(2 * HI + 1);
  for (let j = 0; j <= 2 * HI; j++) { const t = j - HI; INT[j] = Math.abs(t) <= trunc ? k1(t) : 0; }
  const qmax = bits ? (1 << (bits - 1)) - 1 : 0;
  const enc = (r) => {
    let v = r < -R ? -R : r > R ? R : r;
    if (qmax) v = (Math.round((v / R) * qmax) / qmax) * R;
    return v;
  };

  return function addField(m, region) {
    const { nx, ny, nz, apron, blocks } = region;
    const N = nx * ny * nz, SY = nx * nz, SZ = nx;
    const mat = new Uint8Array(N);
    const surf = new Uint8Array(N);
    for (let i = 0; i < N; i++) mat[i] = blocks[i] & 0xff;
    // pass A
    for (let y = 1; y < ny - 1; y++) for (let z = 1; z < nz - 1; z++) {
      let i = (y * nz + z) * nx + 1;
      for (let x = 1; x < nx - 1; x++, i++) {
        if (mat[i] === AIR || (blocks[i] & SHARP) !== 0) continue;
        if (mat[i - 1] === AIR || mat[i + 1] === AIR || mat[i - SY] === AIR || mat[i + SY] === AIR || mat[i - SZ] === AIR || mat[i + SZ] === AIR) surf[i] = 1;
      }
    }
    const boost = new Float64Array(N).fill(1);
    // field at a lattice corner (region coords)
    const cornerField = (cx, cy, cz, out) => {
      out.fill(0);
      let tot = 0;
      for (let jy = 0; jy < 2 * H; jy++) {
        const wy = HALF[jy];
        const by = cy - H + jy;
        for (let jz = 0; jz < 2 * H; jz++) {
          const wyz = wy * HALF[jz];
          let i = (by * nz + cz - H + jz) * nx + cx - H;
          for (let jx = 0; jx < 2 * H; jx++, i++) {
            if (!surf[i]) continue;
            const w = wyz * HALF[jx] * boost[i];
            out[mat[i]] += w;
            tot += w;
          }
        }
      }
      if (tot > 0) for (let k = 0; k < 8; k++) out[k] /= tot;
      return tot;
    };
    // field at a face centre: half-integer along the face axis, integer along the tangents
    const faceField = (ax, fx, fy, fz, out) => { // (fx,fy,fz) = lower block (region), face at lower+1 along ax
      out.fill(0);
      let tot = 0;
      const T0 = ax === 0 ? HALF : INT, T1 = ax === 1 ? HALF : INT, T2 = ax === 2 ? HALF : INT;
      const n0 = T0.length, n1 = T1.length, n2 = T2.length;
      const o0 = ax === 0 ? fx + 1 - H : fx - HI;
      const o1 = ax === 1 ? fy + 1 - H : fy - HI;
      const o2 = ax === 2 ? fz + 1 - H : fz - HI;
      for (let jy = 0; jy < n1; jy++) {
        const wy = T1[jy];
        for (let jz = 0; jz < n2; jz++) {
          const wyz = wy * T2[jz];
          let i = ((o1 + jy) * nz + o2 + jz) * nx + o0;
          for (let jx = 0; jx < n0; jx++, i++) {
            if (!surf[i]) continue;
            const w = wyz * T0[jx] * boost[i];
            out[mat[i]] += w;
            tot += w;
          }
        }
      }
      if (tot > 0) for (let k = 0; k < 8; k++) out[k] /= tot;
      return tot;
    };

    // pass B: boost for surface blocks that some chunk corner can see
    const lo = apron - H, hi = apron + 32 + H; // blocks [lo, hi) per axis
    const acc = new Float64Array(8);
    const supports = [];
    const faceSupport = o.faceSupport ?? false;
    for (let y = lo; y < hi; y++) for (let z = lo; z < hi; z++) for (let x = lo; x < hi; x++) {
      const i = (y * nz + z) * nx + x;
      if (!surf[i]) continue;
      const me = mat[i];
      let s;
      if (faceSupport) {
        // own share at the best exposed face centre (what is rendered)
        s = 0;
        for (let d = 0; d < 6; d++) {
          const ax = d >> 1, plus = d & 1;
          const st = ax === 0 ? 1 : ax === 1 ? SY : SZ;
          const j = plus ? i + st : i - st;
          if (mat[j] !== AIR) continue;
          const lower = plus ? i : j; // the face lies between lower and lower+1 along ax
          const lx = lower % nx, lz = Math.floor(lower / nx) % nz, ly = Math.floor(lower / SY);
          if (faceField(ax, lx, ly, lz, acc) === 0) continue;
          if (acc[me] > s) s = acc[me];
        }
        if (s <= 0) continue;
      } else {
        let own = 0, tot = 0;
        for (let dy = -HS; dy <= HS; dy++) {
          const wy = INT[dy + HI];
          for (let dz = -HS; dz <= HS; dz++) {
            const wyz = wy * INT[dz + HI];
            let j = i + dy * SY + dz * SZ - HS;
            for (let dx = -HS; dx <= HS; dx++, j++) {
              if (!surf[j]) continue;
              const w = wyz * INT[dx + HI];
              tot += w;
              if (mat[j] === me) own += w;
            }
          }
        }
        s = own / tot;
      }
      supports.push(i, s);
    }
    for (let k = 0; k < supports.length; k += 2) {
      const i = supports[k], s = supports[k + 1];
      // τ rises from tau (s ≥ sLine) to tau1 (s ≤ sLone): lone blocks get more
      const t = s >= sLine ? tau : s <= sLone ? tau1 : tau1 + ((tau - tau1) * (s - sLone)) / (sLine - sLone);
      if (s < t) boost[i] = (t * (1 - s)) / ((1 - t) * s);
    }
    // pass C: per-vertex r, one field evaluation per lattice corner
    const V = m.V, dim = 8;
    let attrs = new Float64Array(V * dim);
    // one field per lattice corner of the chunk (33³ slots, dense index)
    const slot = new Int32Array(33 * 33 * 33).fill(-1);
    const fields = new Float64Array(V * 8);
    let nCorners = 0;
    const f = new Float64Array(8);
    for (let v = 0; v < V; v++) {
      const own = m.mat[v], off = v * dim;
      if (m.flags[v] & 1) { for (let k = 0; k < 8; k++) attrs[off + k] = k === own ? 0 : -R; continue; }
      const lx = m.corner[v * 3], ly = m.corner[v * 3 + 1], lz = m.corner[v * 3 + 2];
      const key = (ly * 33 + lz) * 33 + lx;
      let g = slot[key];
      if (g < 0) {
        g = nCorners++ * 8;
        slot[key] = g;
        if (cornerField(lx + apron, ly + apron, lz + apron, f) === 0) f[0] = -1;
        for (let k = 0; k < 8; k++) fields[g + k] = f[k];
      }
      const none = fields[g] < 0, wo = fields[g + own];
      for (let k = 0; k < 8; k++) attrs[off + k] = k === own ? 0 : k === 0 || none ? -R : enc(fields[g + k] - wo);
    }

    // pass D
    const tri = m.tri, pos = m.pos;
    const winner = (a, off, own) => { let b = own, bv = 0; for (let k = 1; k < 8; k++) if (k !== own && a[off + k] > bv) { bv = a[off + k]; b = k; } return b; };
    const rc = new Float64Array(8), mid = new Float64Array(8);
    const split = [], centre = [];
    let flipped = 0, boundaryQuads = 0;
    for (let q = 0; q < m.quadCount; q++) {
      let r0 = tri[6 * q], r1 = tri[6 * q + 1], r2 = tri[6 * q + 2], r3 = tri[6 * q + 5];
      const own = m.mat[r0];
      if (m.flags[r0] & 1) continue;
      const w0 = winner(attrs, r0 * dim, own), w1 = winner(attrs, r1 * dim, own), w2 = winner(attrs, r2 * dim, own), w3 = winner(attrs, r3 * dim, own);
      const ax = m.quadAxis[q];
      const L0 = m.quadLower[q * 3] + apron, L1 = m.quadLower[q * 3 + 1] + apron, L2 = m.quadLower[q * 3 + 2] + apron;
      // a uniform quad whose centre agrees needs nothing; the centre is only
      // evaluated when the corners disagree or a competitor is close
      let close = false;
      if (w0 === w1 && w1 === w2 && w2 === w3) {
        for (const v of [r0, r1, r2, r3]) for (let k = 1; k < 8; k++) if (k !== own && attrs[v * dim + k] > -R) close = true;
        if (!close) continue;
      }
      if (faceField(ax, L0, L1, L2, f) === 0) continue;
      for (let k = 0; k < 8; k++) rc[k] = k === own ? 0 : k === 0 ? -R : enc(f[k] - f[own]);
      const wc = winner(rc, 0, own);
      if (w0 === wc && w1 === wc && w2 === wc && w3 === wc) continue;
      boundaryQuads++;
      let e02 = 0, e13 = 0;
      for (let k = 1; k < 8; k++) {
        if (k === own) continue;
        e02 += (0.5 * (attrs[r0 * dim + k] + attrs[r2 * dim + k]) - rc[k]) ** 2;
        e13 += (0.5 * (attrs[r1 * dim + k] + attrs[r3 * dim + k]) - rc[k]) ** 2;
      }
      let d0 = r0, d1 = r2;
      if (e13 < e02 - 1e-12) {
        let tw = 0;
        for (let a = 0; a < 3; a++) { const d = 0.5 * (pos[r0 * 3 + a] + pos[r2 * 3 + a]) - 0.5 * (pos[r1 * 3 + a] + pos[r3 * 3 + a]); tw += d * d; }
        if (Math.sqrt(tw) <= flipTwist) {
          tri[6 * q] = r1; tri[6 * q + 1] = r2; tri[6 * q + 2] = r3;
          tri[6 * q + 3] = r1; tri[6 * q + 4] = r3; tri[6 * q + 5] = r0;
          flipped++;
          d0 = r1; d1 = r3;
        }
      }
      for (let k = 0; k < 8; k++) mid[k] = 0.5 * (attrs[d0 * dim + k] + attrs[d1 * dim + k]);
      let thinQuad = false;
      if (o.fanThin) {
        // the quad's solid block is a boosted (thin-feature) block
        const sl = m.quadSolidLower[q];
        const sx = L0 + (!sl && ax === 0 ? 1 : 0), sy = L1 + (!sl && ax === 1 ? 1 : 0), sz = L2 + (!sl && ax === 2 ? 1 : 0);
        thinQuad = boost[(sy * nz + sz) * nx + sx] > 1;
      }
      if (!thinQuad && winner(mid, 0, own) === wc) continue;
      split.push(q);
      centre.push(Float64Array.from(rc));
    }
    // fans: four triangles around the kept diagonal's midpoint (same planes)
    const fans = split.length;
    if (fans > 0) {
      const V2 = V + fans, T2 = m.T + 2 * fans;
      const grow = (arr, n, Ctor) => { const a = new Ctor(n); a.set(arr); return a; };
      const pos2 = grow(m.pos, V2 * 3, Float64Array), nrm2 = grow(m.nrm, V2 * 3, Float64Array);
      const mat2 = grow(m.mat, V2, Uint8Array), flags2 = grow(m.flags, V2, Uint8Array), ao2 = grow(m.ao, V2, Float64Array);
      const corner2 = new Int32Array(V2 * 3).fill(-9999); corner2.set(m.corner);
      const attrs2 = grow(attrs, V2 * dim, Float64Array);
      const tri2 = new Uint32Array(T2 * 3), triQuad2 = new Int32Array(T2);
      let t = 0, s = 0;
      for (let q = 0; q < m.quadCount; q++) {
        if (s < fans && split[s] === q) {
          const ring = [tri[6 * q], tri[6 * q + 1], tri[6 * q + 2], tri[6 * q + 5]];
          const c = V + s;
          for (let a = 0; a < 3; a++) {
            pos2[c * 3 + a] = Math.round(((pos2[ring[0] * 3 + a] + pos2[ring[2] * 3 + a]) / 2 + 0.5) * 256) / 256 - 0.5;
            nrm2[c * 3 + a] = m.nrm[ring[0] * 3 + a] + m.nrm[ring[2] * 3 + a];
          }
          const l = Math.sqrt(nrm2[c * 3] ** 2 + nrm2[c * 3 + 1] ** 2 + nrm2[c * 3 + 2] ** 2) || 1;
          for (let a = 0; a < 3; a++) nrm2[c * 3 + a] /= l;
          mat2[c] = m.mat[ring[0]]; flags2[c] = m.flags[ring[0]]; ao2[c] = (m.ao[ring[0]] + m.ao[ring[2]]) / 2;
          attrs2.set(centre[s], c * dim);
          for (let e = 0; e < 4; e++) { tri2[t * 3] = c; tri2[t * 3 + 1] = ring[e]; tri2[t * 3 + 2] = ring[(e + 1) % 4]; triQuad2[t++] = q; }
          s++;
        } else {
          for (let e = 0; e < 6; e++) tri2[t * 3 + e] = tri[6 * q + e];
          triQuad2[t++] = q; triQuad2[t++] = q;
        }
      }
      Object.assign(m, { V: V2, pos: pos2, nrm: nrm2, mat: mat2, flags: flags2, ao: ao2, corner: corner2, T: T2, tri: tri2, triQuad: triQuad2 });
      attrs = attrs2;
    }
    m.attrs = attrs;
    m.attrDim = dim;
    m.mfStats = { boundaryQuads, flipped, fans, corners: nCorners };
    return m;
  };
}

export function fragmentArgmax(a, info) {
  const own = info.ownMat;
  let best = own, bv = 0;
  for (let k = 1; k < 8; k++) if (k !== own && a[k] > bv) { bv = a[k]; best = k; }
  return best;
}

// Soft, natural-blend fragment (fragment-side math, not hashed): each
// material m gets a "height" h_m(world position) from two octaves of value
// noise; the fragment shows argmax over {own: h_own, m: r_m + h_m} among the
// materials present in the field (r_m > −R). Far from a boundary only the
// own material is present, so nothing changes there. `soft` lists the
// material ids that take part (natural ones); others keep the plain argmax.
export function makeSoftFragment({ amp = 0.35, freq = 0.8, R = 0.5, soft = [1, 2, 3, 4] } = {}) {
  const isSoft = new Uint8Array(8);
  for (const m of soft) isSoft[m] = 1;
  const hash = (ix, iy, iz, s) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 1103515245) + Math.imul(iz, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x, y, z, s) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    let r = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      r += (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz) * hash(ix + dx, iy + dy, iz + dz, s);
    }
    return r;
  };
  const height = (m, x, y, z) => amp * ((vnoise(x * freq, y * freq, z * freq, m * 7) - 0.5) + 0.5 * (vnoise(x * freq * 2.3, y * freq * 2.3, z * freq * 2.3, m * 7 + 3) - 0.5));
  return function fragmentSoft(a, info) {
    const own = info.ownMat;
    let best = own, bv = 0;
    const ownSoft = isSoft[own];
    if (!ownSoft) { for (let k = 1; k < 8; k++) if (k !== own && a[k] > bv) { bv = a[k]; best = k; } return best; }
    bv = height(own, info.x, info.y, info.z);
    for (let k = 1; k < 8; k++) {
      if (k === own || a[k] <= -R + 1e-9) continue;
      const s = a[k] + (isSoft[k] ? height(k, info.x, info.y, info.z) : 0);
      if (s > bv) { bv = s; best = k; }
    }
    return best;
  };
}
