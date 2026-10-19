// gm — generator material hints with an edited-zone fallback.
//
// GEN MODE (every quad whose corners see no player-edited block): the
// vertex carries two generator fields interpolated at its position,
//   S = SEA+2 − H          (per-column plane gmS, bilinear)      sand ⇔ S ≥ 0
//   E = α·σ(p) + max(0, D(p) − δ)                                 top ≤ t1 < dirt ≤ t2 < stone
// D = dTerrain (per-block plane, trilinear). σ = exposure term (rule):
//   'none'  σ = 0: the literal v1 rule on the continuous surface (a grass
//           skin; dirt/stone only where the surface cuts below it: caves,
//           digs, cave mouths); δ clips the ±0.04 offset of surface vertices
//           from D = 0 (p99 0.21)
//   'slope' σ = |∇D| / |∂D/∂y| (1/cos of the generator surface slope)
//   'grad'  σ = |∇D|
// computed per block by central differences of the plane, trilinear at p.
// The fragment thresholds the interpolated (S, E) — 2 compares.
// Stored: S and E as 12-bit codes in the 3 reserved vertex bytes, mode in
// flags bit 3.
//
// FALLBACK MODE (quads whose corners see a non-sharp edited solid surface
// block within the mf-iso window, and the quads of edited or sharp blocks):
// the mf-iso field (Gaussian σ 1.2 over surface blocks, self-support guard
// τ 0.55, flips/fans, 6 × 5-bit r_m relative to own), except that a
// GENERATED surface block contributes its kernel weight as BACKGROUND whose
// material split is the gen field's soft weights g(c) at the evaluation
// point (ramps of half-width L around each threshold, a partition of unity
// over grass/sand/dirt/stone). Far from edits the background is the whole
// mass and the fallback contour equals the gen contour; next to an edit
// the edited block's (boosted) mass competes with it. So an edit has no
// halo of block-staircase materials, and the two modes agree at their
// border. Vertices used by quads of both modes are duplicated (same
// position, normal, AO), so each triangle is single-mode.
//
// Without gen planes (synthetic scenes) every surface block counts as
// edited and the result is mf-iso exactly (work/mf/fast.mjs is called).
import { makeFast } from '../mf/fast.mjs';
import { biS, gradS, triP } from './field.mjs';

const AIR = 0, SHARP = 256;
const GRASS = 1, DIRT = 2, STONE = 3, SAND = 4;

export function makeGM(o = {}) {
  const sigma = o.sigma ?? 1.2, trunc = o.trunc ?? 2.5, tau = o.tau ?? 0.55;
  const R = o.R ?? 0.5, bits = o.bits ?? 5, flipTwist = o.flipTwist ?? 0.03;
  const rule = o.rule ?? 'none', alpha = o.alpha ?? 0, delta = o.delta ?? 0.3;
  const t1 = o.t1 ?? 1, t2 = o.t2 ?? 4, Ls = o.Ls ?? 1.5, Le = o.Le ?? 1.5, adaptive = o.adaptive ?? true, sandFade = o.sandFade ?? 0;
  const fine = o.fine ?? (rule !== 'none');
  const sBits = o.sBits ?? 12, eBits = o.eBits ?? 12, sMax = o.sMax ?? 8, eLo = o.eLo ?? -1, eHi = o.eHi ?? 7;
  const mfOnly = makeFast({ sigma, trunc, tau, bits, R, flipTwist });

  const H = Math.floor(trunc + 0.5);
  const k1 = (t) => Math.exp(-(t * t) / (2 * sigma * sigma)); // build-time table only
  const HALF = new Float64Array(2 * H);
  for (let j = 0; j < 2 * H; j++) { const t = j - H + 0.5; HALF[j] = Math.abs(t) <= trunc ? k1(t) : 0; }
  const HI = Math.floor(trunc);
  const INT = new Float64Array(2 * HI + 1);
  for (let j = 0; j <= 2 * HI; j++) { const t = j - HI; INT[j] = Math.abs(t) <= trunc ? k1(t) : 0; }
  const qmax = bits ? (1 << (bits - 1)) - 1 : 0;
  const encR = (r) => { let v = r < -R ? -R : r > R ? R : r; if (qmax) v = (Math.round((v / R) * qmax) / qmax) * R; return v; };
  const sq = sBits ? (1 << (sBits - 1)) - 1 : 0, eq = eBits ? (1 << eBits) - 1 : 0;
  const encS = (v) => { const c = v < -sMax ? -sMax : v > sMax ? sMax : v; return sq ? (Math.round((c / sMax) * sq) / sq) * sMax : c; };
  const encE = (v) => { const c = v < eLo ? eLo : v > eHi ? eHi : v; return eq ? eLo + (Math.round(((c - eLo) / (eHi - eLo)) * eq) / eq) * (eHi - eLo) : c; };

  function gmPass(m, region) {
    if (!region.gmS) {
      // no generator planes: every surface block is 'edited' → mf-iso exactly
      mfOnly(m, region);
      const a9 = new Float64Array(m.V * 9);
      for (let v = 0; v < m.V; v++) for (let k = 0; k < 8; k++) a9[v * 9 + 1 + k] = m.attrs[v * 8 + k];
      m.attrs = a9; m.attrDim = 9;
      m.gmStats = { genQuads: 0, fallbackQuads: m.quadCount, noPlanes: true };
      return m;
    }
    const { nx, ny, nz, apron, blocks, gmS, gmEd } = region;
    const P = fine ? region.gmD16 : region.gmD, PS = fine ? 256 : 16;
    const N = nx * ny * nz, SY = nx * nz, SZ = nx;

    // ---- exposure term σ per block (lazy), trilinear
    let sigAt = null;
    if (rule !== 'none' && alpha !== 0) {
      const G = new Float64Array(N).fill(-1);
      const cap = 8;
      const at = (i) => {
        let g = G[i];
        if (g >= 0) return g;
        const x = i % nx, z = Math.floor(i / nx) % nz, y = Math.floor(i / SY);
        const gx = x > 0 && x < nx - 1 ? (P[i + 1] - P[i - 1]) / (2 * PS) : 0;
        const gy = y > 0 && y < ny - 1 ? (P[i + SY] - P[i - SY]) / (2 * PS) : 0;
        const gz = z > 0 && z < nz - 1 ? (P[i + SZ] - P[i - SZ]) / (2 * PS) : 0;
        g = Math.sqrt(gx * gx + gy * gy + gz * gz);
        if (rule === 'slope') { const ay = gy < 0 ? -gy : gy; g = ay * cap > g ? g / ay : cap; }
        G[i] = g;
        return g;
      };
      sigAt = (x, y, z) => {
        const qx = x - 0.5, qy = y - 0.5, qz = z - 0.5;
        const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz);
        const tx = qx - ix, ty = qy - iy, tz = qz - iz, b = (iy * nz + iz) * nx + ix;
        const c000 = at(b), c100 = at(b + 1), c010 = at(b + SY), c110 = at(b + SY + 1);
        const c001 = at(b + SZ), c101 = at(b + SZ + 1), c011 = at(b + SY + SZ), c111 = at(b + SY + SZ + 1);
        const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx, x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
        const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
        return y0 + (y1 - y0) * tz;
      };
    }
    // gen fields at a region point → [S (H units), E]
    // exposure weight: 1 inland, fading to 0 over ±sandFade blocks around
    // the shore (sand keeps its own top; optional)
    const expoW = (x, z) => {
      if (!sandFade) return 1;
      const S = biS(gmS, nx, nz, x, z), g = gradS(gmS, nx, nz, x, z);
      const sd = S / (g > 0.02 ? g : 0.02);
      const w = 0.5 - sd / (2 * sandFade);
      return w < 0 ? 0 : w > 1 ? 1 : w;
    };
    const gen = (x, y, z, out) => {
      out[0] = biS(gmS, nx, nz, x, z);
      const Dv = triP(P, PS, nx, ny, nz, x, y, z);
      out[1] = (sigAt ? alpha * sigAt(x, y, z) * expoW(x, z) : 0) + (Dv > delta ? Dv - delta : 0);
      return out;
    };
    // soft gen weights (partition of unity) at a region point. Ramps are
    // Ls / Le BLOCKS wide in space: E is divided by its local gradient
    // (central differences at ±½), so a slowly varying exposure field still
    // gets a ~1/3-per-block r slope that 5-bit codes can carry.
    const Eat = (x, y, z) => { const Dv = triP(P, PS, nx, ny, nz, x, y, z); return (sigAt ? alpha * sigAt(x, y, z) * expoW(x, z) : 0) + (Dv > delta ? Dv - delta : 0); };
    const soft = (x, y, z, out) => {
      const S = biS(gmS, nx, nz, x, z);
      const g = gradS(gmS, nx, nz, x, z);
      const sd = S / (g > 0.02 ? g : 0.02); // blocks to the sand contour
      const E = Eat(x, y, z);
      let LeE = Le;
      if (adaptive) {
        const ex = Eat(x + 0.5, y, z) - Eat(x - 0.5, y, z), ey = Eat(x, y + 0.5, z) - Eat(x, y - 0.5, z), ez = Eat(x, y, z + 0.5) - Eat(x, y, z - 0.5);
        const gE = Math.sqrt(ex * ex + ey * ey + ez * ez);
        LeE = Le * (gE > 0.01 ? gE : 0.01);
      }
      let T = 0.5 - (E - t1) / (2 * LeE); T = T < 0 ? 0 : T > 1 ? 1 : T;
      let St = 0.5 + (E - t2) / (2 * LeE); St = St < 0 ? 0 : St > 1 ? 1 : St;
      let Dm = 1 - T - St; if (Dm < 0) Dm = 0;
      const tot = T + Dm + St;
      let sg = 0.5 + sd / (2 * Ls); sg = sg < 0 ? 0 : sg > 1 ? 1 : sg;
      out.fill(0);
      out[SAND] = (T * sg) / tot; out[GRASS] = (T * (1 - sg)) / tot; out[DIRT] = Dm / tot; out[STONE] = St / tot;
      return out;
    };

    // ---- surface and edited masks (mf-iso's surface definition)
    const mat = new Uint8Array(N), surf = new Uint8Array(N), ed = new Uint8Array(N);
    for (let i = 0; i < N; i++) mat[i] = blocks[i] & 0xff;
    let anyEd = false;
    const lo = apron - H - 2, hi = apron + 32 + H + 2; // reach: corner window ± support window
    for (let y = 1; y < ny - 1; y++) for (let z = 1; z < nz - 1; z++) {
      let i = (y * nz + z) * nx + 1;
      for (let x = 1; x < nx - 1; x++, i++) {
        if (mat[i] === AIR || (blocks[i] & SHARP) !== 0) continue;
        if (mat[i - 1] === AIR || mat[i + 1] === AIR || mat[i - SY] === AIR || mat[i + SY] === AIR || mat[i - SZ] === AIR || mat[i + SZ] === AIR) {
          surf[i] = 1;
          if (gmEd[i]) { ed[i] = 1; if (x >= lo && x < hi && y >= lo && y < hi && z >= lo && z < hi) anyEd = true; }
        }
      }
    }

    const V0 = m.V, tri = m.tri, Q = m.quadCount;
    const g2 = new Float64Array(2);
    // ---- fast path: no edited surface block within reach → all gen
    // per-quad mode: 1 gen, 0 fallback
    const qMode = new Uint8Array(Q).fill(1);
    // corner slot table (33³) → edited mass flag / field cache
    const slot = new Int32Array(33 * 33 * 33).fill(-1);
    const boost = new Float64Array(N).fill(1);
    const cf = []; // per corner: Float64Array(8) field or null
    const cEd = []; // per corner: edited mass > 0
    const gsoft = new Float64Array(8), acc = new Float64Array(8);
    const cornerOf = (v) => (m.corner[v * 3 + 1] * 33 + m.corner[v * 3 + 2]) * 33 + m.corner[v * 3];

    // corner field with background: returns edited mass, fills out (normalised)
    const cornerField = (cx, cy, cz, g, out) => {
      out.fill(0);
      let tot = 0, edm = 0, bg = 0;
      for (let jy = 0; jy < 2 * H; jy++) {
        const wy = HALF[jy], by = cy - H + jy;
        for (let jz = 0; jz < 2 * H; jz++) {
          const wyz = wy * HALF[jz];
          let i = (by * nz + cz - H + jz) * nx + cx - H;
          for (let jx = 0; jx < 2 * H; jx++, i++) {
            if (!surf[i]) continue;
            let w = wyz * HALF[jx];
            if (ed[i]) { w *= boost[i]; out[mat[i]] += w; edm += w; } else bg += w;
            tot += w;
          }
        }
      }
      if (g) for (let k = 0; k < 8; k++) out[k] += bg * g[k];
      if (tot > 0) for (let k = 0; k < 8; k++) out[k] /= tot;
      return edm;
    };
    const edMassOnly = (cx, cy, cz) => {
      for (let jy = 0; jy < 2 * H; jy++) {
        const by = cy - H + jy;
        for (let jz = 0; jz < 2 * H; jz++) {
          let i = (by * nz + cz - H + jz) * nx + cx - H;
          for (let jx = 0; jx < 2 * H; jx++, i++) if (ed[i]) return true;
        }
      }
      return false;
    };

    if (anyEd) {
      // pass B: self-support boost of EDITED surface blocks (background
      // supports them where the gen field at their centre agrees)
      for (let y = lo + 2; y < hi - 2; y++) for (let z = lo + 2; z < hi - 2; z++) for (let x = lo + 2; x < hi - 2; x++) {
        const i = (y * nz + z) * nx + x;
        if (!ed[i]) continue;
        const me = mat[i];
        soft(x + 0.5, y + 0.5, z + 0.5, gsoft);
        let own = 0, tot = 0;
        for (let dy = -HI; dy <= HI; dy++) {
          const wy = INT[dy + HI];
          for (let dz = -HI; dz <= HI; dz++) {
            const wyz = wy * INT[dz + HI];
            let j = i + dy * SY + dz * SZ - HI;
            for (let dx = -HI; dx <= HI; dx++, j++) {
              if (!surf[j]) continue;
              const w = wyz * INT[dx + HI];
              tot += w;
              if (ed[j]) { if (mat[j] === me) own += w; } else own += w * gsoft[me];
            }
          }
        }
        const s = own / tot;
        if (s < tau) boost[i] = (tau * (1 - s)) / ((1 - tau) * s);
      }
      // per-corner zone flag
      for (let v = 0; v < V0; v++) {
        const key = cornerOf(v);
        if (slot[key] >= 0) continue;
        slot[key] = cEd.length;
        cEd.push(edMassOnly(m.corner[v * 3] + apron, m.corner[v * 3 + 1] + apron, m.corner[v * 3 + 2] + apron));
        cf.push(null);
      }
      for (let q = 0; q < Q; q++) {
        const r0 = tri[6 * q], r1 = tri[6 * q + 1], r2 = tri[6 * q + 2], r3 = tri[6 * q + 5];
        if (m.flags[r0] & 1) { qMode[q] = 0; continue; } // sharp quad: own material
        // the quad's solid block
        const ax = m.quadAxis[q], sl = m.quadSolidLower[q];
        const sx = m.quadLower[q * 3] + apron + (!sl && ax === 0 ? 1 : 0), sy = m.quadLower[q * 3 + 1] + apron + (!sl && ax === 1 ? 1 : 0), sz = m.quadLower[q * 3 + 2] + apron + (!sl && ax === 2 ? 1 : 0);
        if (gmEd[(sy * nz + sz) * nx + sx]) { qMode[q] = 0; continue; }
        if (cEd[slot[cornerOf(r0)]] || cEd[slot[cornerOf(r1)]] || cEd[slot[cornerOf(r2)]] || cEd[slot[cornerOf(r3)]]) qMode[q] = 0;
      }
    } else {
      for (let q = 0; q < Q; q++) if (m.flags[tri[6 * q]] & 1) qMode[q] = 0;
    }

    // ---- vertex usage by mode; duplicate shared vertices
    const use = new Uint8Array(V0); // bit0 gen, bit1 fallback
    for (let q = 0; q < Q; q++) {
      const b = qMode[q] ? 1 : 2;
      for (let e = 0; e < 6; e++) use[tri[6 * q + e]] |= b;
    }
    const dupOf = new Int32Array(V0).fill(-1);
    let V = V0;
    for (let v = 0; v < V0; v++) if (use[v] === 3) dupOf[v] = V++;
    const DIM = 9;
    const grow = (arr, n, Ctor) => { const a = new Ctor(n); a.set(arr); return a; };
    let pos = m.pos, nrm = m.nrm, matV = m.mat, flags = m.flags, ao = m.ao, corner = m.corner;
    if (V > V0) {
      pos = grow(m.pos, V * 3, Float64Array); nrm = grow(m.nrm, V * 3, Float64Array);
      matV = grow(m.mat, V, Uint8Array); flags = grow(m.flags, V, Uint8Array); ao = grow(m.ao, V, Float64Array);
      corner = grow(m.corner, V * 3, Int32Array);
      for (let v = 0; v < V0; v++) {
        const d = dupOf[v];
        if (d < 0) continue;
        for (let a = 0; a < 3; a++) { pos[d * 3 + a] = m.pos[v * 3 + a]; nrm[d * 3 + a] = m.nrm[v * 3 + a]; corner[d * 3 + a] = m.corner[v * 3 + a]; }
        matV[d] = m.mat[v]; flags[d] = m.flags[v]; ao[d] = m.ao[v];
      }
      // fallback quads use the duplicate
      for (let q = 0; q < Q; q++) if (!qMode[q]) for (let e = 0; e < 6; e++) { const v = tri[6 * q + e]; if (dupOf[v] >= 0) tri[6 * q + e] = dupOf[v]; }
    }
    let attrs = new Float64Array(V * DIM);
    const isGenV = (v) => (v < V0 ? use[v] === 1 || use[v] === 3 : false);
    // gen attrs
    let nGen = 0, nFb = 0;
    for (let v = 0; v < V0; v++) {
      if (!(use[v] & 1)) continue;
      gen(pos[v * 3] + apron, pos[v * 3 + 1] + apron, pos[v * 3 + 2] + apron, g2);
      const o = v * DIM;
      attrs[o] = 1; attrs[o + 1] = encS(g2[0]); attrs[o + 2] = encE(g2[1]);
      nGen++;
    }
    // fallback attrs (fallback-mode vertices: unused-by-gen originals and duplicates)
    const fbVerts = [];
    for (let v = 0; v < V0; v++) {
      if (use[v] === 2) fbVerts.push(v, v);
      else if (use[v] === 3) fbVerts.push(dupOf[v], v);
    }
    const f = new Float64Array(8);
    const fieldOfCorner = (v) => {
      const key = cornerOf(v);
      let s = slot[key];
      if (s < 0) { s = slot[key] = cEd.length; cEd.push(false); cf.push(null); }
      if (cf[s]) return cf[s];
      soft(pos[v * 3] + apron, pos[v * 3 + 1] + apron, pos[v * 3 + 2] + apron, gsoft);
      const out = new Float64Array(8);
      cornerField(m.corner[v * 3] + apron, m.corner[v * 3 + 1] + apron, m.corner[v * 3 + 2] + apron, gsoft, out);
      cf[s] = out;
      return out;
    };
    for (let k = 0; k < fbVerts.length; k += 2) {
      const v = fbVerts[k], src = fbVerts[k + 1];
      const own = matV[v], o = v * DIM;
      attrs[o] = 0;
      if (flags[v] & 1) { for (let q = 0; q < 8; q++) attrs[o + 1 + q] = q === own ? 0 : -R; nFb++; continue; }
      const F = fieldOfCorner(src);
      const wo = F[own];
      for (let q = 0; q < 8; q++) attrs[o + 1 + q] = q === own ? 0 : q === 0 ? -R : encR(F[q] - wo);
      nFb++;
    }

    // ---- pass D (fallback quads only): flips / fans, as mf-iso
    const winner = (a, off, own) => { let b = own, bv = 0; for (let k = 1; k < 8; k++) if (k !== own && a[off + 1 + k] > bv) { bv = a[off + 1 + k]; b = k; } return b; };
    const rc = new Float64Array(DIM), mid = new Float64Array(DIM);
    const faceField = (ax, fx, fy, fz, g, out) => {
      out.fill(0);
      let tot = 0, bg = 0;
      const T0 = ax === 0 ? HALF : INT, T1 = ax === 1 ? HALF : INT, T2 = ax === 2 ? HALF : INT;
      const o0 = ax === 0 ? fx + 1 - H : fx - HI, o1 = ax === 1 ? fy + 1 - H : fy - HI, o2 = ax === 2 ? fz + 1 - H : fz - HI;
      for (let jy = 0; jy < T1.length; jy++) {
        const wy = T1[jy];
        for (let jz = 0; jz < T2.length; jz++) {
          const wyz = wy * T2[jz];
          let i = ((o1 + jy) * nz + o2 + jz) * nx + o0;
          for (let jx = 0; jx < T0.length; jx++, i++) {
            if (!surf[i]) continue;
            let w = wyz * T0[jx];
            if (ed[i]) { w *= boost[i]; out[mat[i]] += w; } else bg += w;
            tot += w;
          }
        }
      }
      for (let k = 0; k < 8; k++) out[k] += bg * g[k];
      if (tot > 0) for (let k = 0; k < 8; k++) out[k] /= tot;
      return tot;
    };
    const split = [], centre = [];
    let flipped = 0;
    for (let q = 0; q < Q; q++) {
      if (qMode[q]) continue;
      let r0 = tri[6 * q], r1 = tri[6 * q + 1], r2 = tri[6 * q + 2], r3 = tri[6 * q + 5];
      const own = matV[r0];
      if (flags[r0] & 1) continue;
      const w0 = winner(attrs, r0 * DIM, own), w1 = winner(attrs, r1 * DIM, own), w2 = winner(attrs, r2 * DIM, own), w3 = winner(attrs, r3 * DIM, own);
      let close = false;
      if (w0 === w1 && w1 === w2 && w2 === w3) {
        for (const v of [r0, r1, r2, r3]) for (let k = 1; k < 8; k++) if (k !== own && attrs[v * DIM + 1 + k] > -R) close = true;
        if (!close) continue;
      }
      const ax = m.quadAxis[q];
      const L0 = m.quadLower[q * 3] + apron, L1 = m.quadLower[q * 3 + 1] + apron, L2 = m.quadLower[q * 3 + 2] + apron;
      let cxp = 0, cyp = 0, czp = 0;
      for (const v of [r0, r1, r2, r3]) { cxp += pos[v * 3] / 4; cyp += pos[v * 3 + 1] / 4; czp += pos[v * 3 + 2] / 4; }
      soft(cxp + apron, cyp + apron, czp + apron, gsoft);
      if (faceField(ax, L0, L1, L2, gsoft, f) === 0) continue;
      rc[0] = 0;
      for (let k = 0; k < 8; k++) rc[1 + k] = k === own ? 0 : k === 0 ? -R : encR(f[k] - f[own]);
      const wc = winner(rc, 0, own);
      if (w0 === wc && w1 === wc && w2 === wc && w3 === wc) continue;
      let e02 = 0, e13 = 0;
      for (let k = 1; k < 8; k++) {
        if (k === own) continue;
        e02 += (0.5 * (attrs[r0 * DIM + 1 + k] + attrs[r2 * DIM + 1 + k]) - rc[1 + k]) ** 2;
        e13 += (0.5 * (attrs[r1 * DIM + 1 + k] + attrs[r3 * DIM + 1 + k]) - rc[1 + k]) ** 2;
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
      for (let k = 0; k < DIM; k++) mid[k] = 0.5 * (attrs[d0 * DIM + k] + attrs[d1 * DIM + k]);
      if (winner(mid, 0, own) === wc) continue;
      split.push(q);
      centre.push(Float64Array.from(rc));
    }
    const fans = split.length;
    let T = m.T, triQuad = m.triQuad, triOut = tri;
    if (fans > 0) {
      const V2 = V + fans, T2 = m.T + 2 * fans;
      pos = grow(pos, V2 * 3, Float64Array); nrm = grow(nrm, V2 * 3, Float64Array);
      matV = grow(matV, V2, Uint8Array); flags = grow(flags, V2, Uint8Array); ao = grow(ao, V2, Float64Array);
      const corner2 = new Int32Array(V2 * 3).fill(-9999); corner2.set(corner); corner = corner2;
      attrs = grow(attrs, V2 * DIM, Float64Array);
      const tri2 = new Uint32Array(T2 * 3), triQuad2 = new Int32Array(T2);
      let t = 0, s = 0;
      for (let q = 0; q < Q; q++) {
        if (s < fans && split[s] === q) {
          const ring = [tri[6 * q], tri[6 * q + 1], tri[6 * q + 2], tri[6 * q + 5]];
          const c = V + s;
          for (let a = 0; a < 3; a++) {
            pos[c * 3 + a] = Math.round(((pos[ring[0] * 3 + a] + pos[ring[2] * 3 + a]) / 2 + 0.5) * 256) / 256 - 0.5;
            nrm[c * 3 + a] = nrm[ring[0] * 3 + a] + nrm[ring[2] * 3 + a];
          }
          const l = Math.sqrt(nrm[c * 3] ** 2 + nrm[c * 3 + 1] ** 2 + nrm[c * 3 + 2] ** 2) || 1;
          for (let a = 0; a < 3; a++) nrm[c * 3 + a] /= l;
          matV[c] = matV[ring[0]]; flags[c] = flags[ring[0]]; ao[c] = (ao[ring[0]] + ao[ring[2]]) / 2;
          attrs.set(centre[s], c * DIM);
          for (let e = 0; e < 4; e++) { tri2[t * 3] = c; tri2[t * 3 + 1] = ring[e]; tri2[t * 3 + 2] = ring[(e + 1) % 4]; triQuad2[t++] = q; }
          s++;
        } else {
          for (let e = 0; e < 6; e++) tri2[t * 3 + e] = tri[6 * q + e];
          triQuad2[t++] = q; triQuad2[t++] = q;
        }
      }
      V = V2; T = T2; triOut = tri2; triQuad = triQuad2;
    }
    Object.assign(m, { V, pos, nrm, mat: matV, flags, ao, corner, T, tri: triOut, triQuad, attrs, attrDim: DIM });
    m.gmStats = { genQuads: qMode.reduce((a, b) => a + b, 0), fallbackQuads: Q - qMode.reduce((a, b) => a + b, 0), duplicated: V0 > 0 ? dupOf.filter((d) => d >= 0).length : 0, fans, flipped, nGen, nFb, anyEd };
    m.gmMode = qMode;
    return m;
  }
  return gmPass;
}

/** Fragment: gen mode thresholds (S, E); fallback = mf-iso argmax.
 *  Optional fragment-side world noise on E (look option). */
export function makeGMFragment({ t1 = 1, t2 = 4, noise = null } = {}) {
  return function fragmentGM(a, info) {
    if (a[0] > 0.5) {
      let e = a[2];
      if (noise) e += noise(info.x, info.y, info.z);
      if (e <= t1) return a[1] >= 0 ? SAND : GRASS;
      if (e <= t2) return DIRT;
      return STONE;
    }
    const own = info.ownMat;
    let best = own, bv = 0;
    for (let k = 1; k < 8; k++) if (k !== own && a[1 + k] > bv) { bv = a[1 + k]; best = k; }
    return best;
  };
}
