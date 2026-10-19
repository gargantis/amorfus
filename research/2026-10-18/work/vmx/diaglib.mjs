// vmx: diagnostics for mx-codes fragments.
// locate(): the exact block search of work/mx/prod.mjs fragmentGpu(), but it
// also returns WHICH block was found (axis, column, level) so a review can
// tell whether a fragment shows a block next to its own block or a far one.
// Every call is cross-checked against the target's own fragment() output.
import * as core from '../../harness/core.mjs';
import { prep, computeCodes, buildTexels, fragmentGpu, decode, evalCode, UVA } from '../mx/prod.mjs';
import * as VMX from '../../approaches/vmx-codes.mjs';
export { VMX };

/** Recompute the target's GPU data for a region (same functions, same options). */
export function gpuData(region) {
  const P = prep(region);
  const { codes, stats } = computeCodes(P, VMX.OPTS);
  return { G: buildTexels(P, codes, 3), codes, stats, P };
}

/** fragmentGpu() with the found block exposed. yBias 0.5, W 2 (the defaults of mx-codes). */
export function locate(G, nrm, px, py, pz, W = 2, yBias = 0.5) {
  const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
  let a, s;
  if (ay >= yBias * (ax > az ? ax : az)) { a = 1; s = nrm[1] >= 0 ? 1 : -1; }
  else if (ax >= az) { a = 0; s = nrm[0] >= 0 ? 1 : -1; }
  else { a = 2; s = nrm[2] >= 0 ? 1 : -1; }
  const d = a * 2 + (s > 0 ? 0 : 1);
  const p = [px, py, pz];
  const [ua, va] = UVA[a];
  const cu = Math.floor(p[ua]), cv = Math.floor(p[va]);
  const Lp = Math.floor(p[a] - 0.5 * s);
  const { tex, N, M } = G;
  const at = (L) => {
    const q = [0, 0, 0]; q[a] = L; q[ua] = cu; q[va] = cv;
    const X = q[0] + M, Y = q[1] + M, Z = q[2] + M;
    if (X < 0 || Y < 0 || Z < 0 || X >= N || Y >= N || Z >= N) return 0;
    return tex[(Y * N + Z) * N + X];
  };
  const bit = 1 << (4 + d);
  let L = Lp, t = at(L), found = false, Lf = null;
  if ((t & 7) !== 0) {
    if (t & bit) { found = true; Lf = L; }
    else for (let l = L + s; l >= Lp - W && l <= Lp + W; l += s) { t = at(l); if ((t & 7) === 0) break; if (t & bit) { found = true; Lf = l; break; } }
  } else {
    for (let l = L - s; l >= Lp - W && l <= Lp + W; l -= s) { t = at(l); if ((t & 7) !== 0) { found = true; Lf = l; break; } }
  }
  const out = { a, s, d, cu, cv, Lp, found, block: null, mat: -1, coded: false, sharp: false };
  if (!found) return out;
  const blk = [0, 0, 0]; blk[a] = Lf; blk[ua] = cu; blk[va] = cv;
  out.block = blk;
  if (t & 8) { out.sharp = true; return out; }
  const mask = (t >>> 10) & 63;
  if (!(mask & (1 << d))) { out.mat = t & 7; return out; }
  out.coded = true;
  let pc = mask & ((1 << d) - 1), n = 0; while (pc) { n += pc & 1; pc >>>= 1; }
  const idx = (t >>> 16) + n;
  const ps = decode(G.codeWords[idx * 2], G.codeWords[idx * 2 + 1]);
  const m = evalCode(ps, p[ua] - cu, p[va] - cv);
  out.mat = m === -2 ? t & 7 : m;
  return out;
}

/** Surface materials (exposed solid blocks) within Chebyshev distance r of block b. */
export function nearbySurfaceMats(region, b, r = 1) {
  const set = new Set();
  const idx = (x, y, z) => core.regionIndex(region, x, y, z);
  const solid = (x, y, z) => { const i = idx(x, y, z); return i >= 0 && (region.blocks[i] & 0xff) !== 0; };
  for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = b[0] + dx, y = b[1] + dy, z = b[2] + dz;
    if (!solid(x, y, z)) continue;
    if (solid(x + 1, y, z) && solid(x - 1, y, z) && solid(x, y + 1, z) && solid(x, y - 1, z) && solid(x, y, z + 1) && solid(x, y, z - 1)) continue;
    set.add(region.blocks[idx(x, y, z)] & 7);
  }
  return set;
}

/** A fragment() wrapper that classifies every fragment. mode: 'mat' (the
 *  target's material), 'diag' (foreign material → 0 = magenta in the view
 *  palette, far-found block → 7 = blue, else the target's material). */
export function makeDiag(region, mesh, G, mode = 'mat') {
  const st = { frags: 0, differs: 0, foreign: 0, far: 0, noSurface: 0, coded: 0, mismatch: 0, examples: [] };
  const near = new Map();
  const fn = (attrs, info) => {
    st.frags++;
    const m = VMX.fragment(attrs, info, null);
    const q = mesh.triQuad[info.t];
    const own = core.quadSolidCell(mesh, q);
    let r = null;
    if (!(mesh.flags[info.a] & 1)) {
      r = locate(G, [attrs[0], attrs[1], attrs[2]], info.x, info.y, info.z);
      const mm = r.found && !r.sharp ? r.mat : info.ownMat;
      const skipped = mesh.attrDim === 4 && attrs[3] > 0.9999;
      if (!skipped && mm !== m) st.mismatch++;
      if (!r.found) st.noSurface++;
      if (r.coded) st.coded++;
    }
    let cls = 0;
    if (m !== info.ownMat) {
      st.differs++;
      const k = own.join(',');
      let s = near.get(k);
      if (!s) { s = nearbySurfaceMats(region, own, 1); near.set(k, s); }
      if (!s.has(m)) { st.foreign++; cls = 1; }
    }
    if (r && r.block) {
      const dd = Math.max(Math.abs(r.block[0] - own[0]), Math.abs(r.block[1] - own[1]), Math.abs(r.block[2] - own[2]));
      if (dd > 1) { st.far++; if (!cls) cls = 2; }
    }
    if (cls && st.examples.length < 40 && (st.frags % 7 === 0)) st.examples.push({ cls: cls === 1 ? 'foreign' : 'far', pos: [+info.x.toFixed(2), +info.y.toFixed(2), +info.z.toFixed(2)], own, ownMat: info.ownMat, shown: m, found: r?.block, axis: r?.d, n: [+attrs[0].toFixed(2), +attrs[1].toFixed(2), +attrs[2].toFixed(2)] });
    if (mode === 'diag') return cls === 1 ? 0 : cls === 2 ? 7 : m;
    return m;
  };
  return { fn, st };
}
