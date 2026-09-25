// Prototype: surface nets on binary occupancy with constrained relaxation.
// Blocks: integer coords b, occupying [b, b+1]^3. Corners: integer coords c.
// Dual cell of corner c = the 8 blocks c-1..c on each axis.
// world(x,y,z) -> 0 air, 1 smooth solid, 2 sharp solid.

// 256-entry table: 1 if the solid set or the air set of a 2x2x2 cell is not face-connected inside the cell
export const AMBIG = new Uint8Array(256);
for (let m = 1; m < 255; m++) {
  const comps = (set) => { const seen = new Set(); let c = 0;
    for (let i = 0; i < 8; i++) if (set(i) && !seen.has(i)) { c++; const st = [i]; seen.add(i);
      while (st.length) { const a = st.pop(); for (const b of [a ^ 1, a ^ 2, a ^ 4]) if (set(b) && !seen.has(b)) { seen.add(b); st.push(b); } } }
    return c; };
  AMBIG[m] = comps(i => (m >> i) & 1) > 1 || comps(i => !((m >> i) & 1)) > 1 ? 1 : 0;
}
export const DEFAULTS = {
  k: 4,            // relaxation iterations
  lambda: 0.5,     // damped Jacobi step
  clamp: 0.5,      // half-width of clamp box around corner
  links: 'mesh',   // 'mesh' (mesh-edge graph) | 'gibson' (any adjacent surface cell)
  init: 'corner',  // 'corner' | 'centroid' (naive SN on binary, edge midpoints)
  quant: 256,      // quantize final offset to 1/quant (0 = off)
  taubinMu: 0,     // if nonzero, alternate lambda / mu steps (Taubin)
  apron: null,     // default k+2
  guard: null,
  pinAmbiguous: false,
  hAir: null,
  edited: null,     // (x,y,z)=>bool; edited AIR octants are forbidden to vertices (keeps dug space open)
  relaxAll: false,
  editedAirRule: 'axis',
  sharpMode: 'vertex', // 'vertex' (pin whole vertex) | 'axis' (pin only axes normal to incident sharp faces) // 'axis' (per-axis half-space, conservative) | 'octant'  // with hints: relax only vertices touching edited/hint-less blocks unless true      // max intrusion into the air side per axis (asymmetric clamp); null = symmetric     // array r[n6]: clamp radius for a block with n6 same-state face neighbours (thin-feature guard)
};

// Mesh a chunk: blocks [o, o+N)^3 own faces whose lower block is inside.
export function meshChunk(world, ox, oy, oz, N, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const A = o.apron ?? (o.k + 2);
  const S = N + 2 * A;           // blocks in local grid
  const bx0 = ox - A, by0 = oy - A, bz0 = oz - A;
  const occ = new Uint8Array(S * S * S);
  for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
    occ[x + S * (y + S * z)] = world(bx0 + x, by0 + y, bz0 + z);
  if (o.edited) { o.E = new Uint8Array(S * S * S); for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o.E[x + S * (y + S * z)] = o.edited(bx0 + x, by0 + y, bz0 + z) ? 1 : 0; }
  if (o.hint) { const H = new Float64Array(S * S * S);
    for (let z = 0; z < S; z++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = x + S * (y + S * z); let h = o.hint(bx0 + x, by0 + y, bz0 + z); // null => edited / no hint
      if (h === null || (o.E && o.E[i]) || (h > 0) !== (occ[i] !== 0)) h = occ[i] ? 1 : -1;       // saturate; must agree with occupancy
      H[i] = Math.max(-1, Math.min(1, h)); }
    o.H = H; }
  return meshGrid(occ, S, bx0, by0, bz0, A, N, o);
}

export function meshGrid(occ, S, bx0, by0, bz0, A, N, o) {
  const B = (x, y, z) => occ[x + S * (y + S * z)];
  const solid = (x, y, z) => B(x, y, z) !== 0;
  // corners local c in 1..S-1 have full dual cells. corner local index c <-> world bx0 + c
  // optional blurred density (separable binomial kernel) at block centres, for init:'blur'
  let D = null;
  if (o.init === 'blur') {
    const K = o.kernel || [1, 2, 1]; const ks = K.reduce((a, b) => a + b); const R = (K.length - 1) >> 1;
    let a = new Float64Array(S * S * S); for (let i = 0; i < a.length; i++) a[i] = occ[i] ? 1 : 0;
    for (const st of [1, S, S * S]) { const b = new Float64Array(a.length);
      for (let i = 0; i < a.length; i++) { let v = 0; for (let j = -R; j <= R; j++) { const q = i + j * st; v += (q >= 0 && q < a.length ? a[q] : a[i]) * K[j + R]; } b[i] = v / ks; }
      a = b; }
    D = a;
  }
  const C = S + 1;
  const cid = new Int32Array(C * C * C).fill(-1);
  const ci = (x, y, z) => x + C * (y + C * z);
  const vx = [], vy = [], vz = [], pinned = [], cx = [], cy = [], cz = [], hcl = [], lamv = [], boxLo = [], boxHi = [], forbid = [];
  let V = 0;
  for (let z = 1; z < S; z++) for (let y = 1; y < S; y++) for (let x = 1; x < S; x++) {
    let n = 0, sharp = false, mask = 0, bit = 0;
    for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++, bit++) {
      const b = B(x + dx, y + dy, z + dz);
      if (b) { n++; mask |= 1 << bit; if (b === 2) sharp = true; }
    }
    if (o.pinAmbiguous && AMBIG[mask]) sharp = true;
    const pinAx = [false, false, false];
    if (sharp && o.sharpMode === 'axis') {
      // 12 face-adjacent pairs inside the 2x2x2 cell; pair differs in exactly one axis bit
      for (let b = 0; b < 8; b++) for (let a = 0; a < 3; a++) { const b2 = b ^ (1 << a); if (b2 < b) continue;
        const p = [x - 1 + (b & 1), y - 1 + ((b >> 1) & 1), z - 1 + ((b >> 2) & 1)], q = [x - 1 + (b2 & 1), y - 1 + ((b2 >> 1) & 1), z - 1 + ((b2 >> 2) & 1)];
        const u = B(...p), w = B(...q);
        if ((u === 2 && w === 0) || (w === 2 && u === 0)) pinAx[a] = true; }
      sharp = false;
    }
    if (n === 0 || n === 8) continue;
    cid[ci(x, y, z)] = V++;
    cx.push(x); cy.push(y); cz.push(z); pinned.push(sharp ? 1 : 0);
    let hv = o.clamp;
    if (o.guard) {
      for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
        const X = x + dx, Y = y + dy, Z = z + dz, st = solid(X, Y, Z);
        if (X < 1 || Y < 1 || Z < 1 || X >= S - 1 || Y >= S - 1 || Z >= S - 1) continue;
        let n6 = 0;
        n6 += solid(X - 1, Y, Z) === st; n6 += solid(X + 1, Y, Z) === st;
        n6 += solid(X, Y - 1, Z) === st; n6 += solid(X, Y + 1, Z) === st;
        n6 += solid(X, Y, Z - 1) === st; n6 += solid(X, Y, Z + 1) === st;
        if (!(o.sharpMode === 'axis' && B(X, Y, Z) === 2)) hv = Math.min(hv, o.guard[n6]);
      }
    }
    hcl.push(hv);
    { // asymmetric per-axis box
      const lo3 = [-hv, -hv, -hv], hi3 = [hv, hv, hv];
      let cellEdited = false;
      if (o.E) for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) if (o.E[(x + dx) + S * ((y + dy) + S * (z + dz))]) cellEdited = true;
      if (o.hAir !== null && o.hAir !== undefined && (!o.hAirEditedOnly || cellEdited)) {
        for (let a = 0; a < 3; a++) { let sn = 0, sp = 0;
          for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
            const d = [dx, dy, dz][a]; if (solid(x + dx, y + dy, z + dz)) { if (d < 0) sn++; else sp++; } }
          if (sp > sn) lo3[a] = -Math.min(hv, (Array.isArray(o.hAir) ? o.hAir[a] : o.hAir)); else if (sn > sp) hi3[a] = Math.min(hv, (Array.isArray(o.hAir) ? o.hAir[a] : o.hAir));
        } }
      if (o.E && o.editedAirRule === 'axis') {
        for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
          const ii = (x + dx) + S * ((y + dy) + S * (z + dz));
          if (o.E[ii] && !occ[ii]) { const dd = [dx, dy, dz]; for (let a = 0; a < 3; a++) { if (dd[a] === 0) hi3[a] = Math.min(hi3[a], o.hEdited ?? 0); else lo3[a] = Math.max(lo3[a], -(o.hEdited ?? 0)); } }
        }
      }
      for (let a = 0; a < 3; a++) if (pinAx[a]) { lo3[a] = 0; hi3[a] = 0; }
      boxLo.push(lo3); boxHi.push(hi3);
    }
    let sat = true, forb = 0, bit2 = 0;
    if (o.H && o.E && o.hintedLambda !== undefined) sat = false;
    else if (o.H && o.hintedLambda !== undefined) { sat = false;
      for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) { const hh = o.H[(x + dx) + S * ((y + dy) + S * (z + dz))]; if (hh === 1 || hh === -1) sat = true; } }
    if (o.E) for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++, bit2++) {
      const ii = (x + dx) + S * ((y + dy) + S * (z + dz)); if (o.E[ii]) { sat = true; if (!occ[ii]) forb |= 1 << bit2; } }
    if (o.H && o.E && o.hintedLambda !== undefined && !o.relaxAll) { /* sat already reflects edited */ }
    lamv.push(sat ? o.lambda : o.hintedLambda); forbid.push(forb);
    let px = 0, py = 0, pz = 0;
    if (o.init === 'centroid') {
      // naive SN on binary samples at block centres: average of edge midpoints of sign-changing lattice edges
      let m = 0;
      // lattice points are block centres at corner + (+-0.5); edges along each axis
      for (let a = 0; a < 3; a++) for (let u = -1; u <= 0; u++) for (let v = -1; v <= 0; v++) {
        let p, q, off;
        if (a === 0) { p = solid(x - 1, y + u, z + v); q = solid(x, y + u, z + v); off = [0, u + 0.5, v + 0.5]; }
        if (a === 1) { p = solid(x + u, y - 1, z + v); q = solid(x + u, y, z + v); off = [u + 0.5, 0, v + 0.5]; }
        if (a === 2) { p = solid(x + u, y + v, z - 1); q = solid(x + u, y + v, z); off = [u + 0.5, v + 0.5, 0]; }
        if (p !== q) { px += off[0]; py += off[1]; pz += off[2]; m++; }
      }
      px /= m; py /= m; pz /= m;
    }
    if (o.H) {
      let m = 0; const Hd = (X, Y, Z) => o.H[X + S * (Y + S * Z)];
      for (let a = 0; a < 3; a++) for (let u = -1; u <= 0; u++) for (let v = -1; v <= 0; v++) {
        let p, q, pa, pb;
        if (a === 0) { p = Hd(x - 1, y + u, z + v); q = Hd(x, y + u, z + v); pa = [-0.5, u + 0.5, v + 0.5]; pb = [0.5, u + 0.5, v + 0.5]; }
        if (a === 1) { p = Hd(x + u, y - 1, z + v); q = Hd(x + u, y, z + v); pa = [u + 0.5, -0.5, v + 0.5]; pb = [u + 0.5, 0.5, v + 0.5]; }
        if (a === 2) { p = Hd(x + u, y + v, z - 1); q = Hd(x + u, y + v, z); pa = [u + 0.5, v + 0.5, -0.5]; pb = [u + 0.5, v + 0.5, 0.5]; }
        if ((p > 0) !== (q > 0)) { const t = p / (p - q); px += pa[0] + t * (pb[0] - pa[0]); py += pa[1] + t * (pb[1] - pa[1]); pz += pa[2] + t * (pb[2] - pa[2]); m++; }
      }
      px /= m; py /= m; pz /= m;
      const L0 = boxLo[boxLo.length - 1], H0 = boxHi[boxHi.length - 1]; px = Math.max(L0[0], Math.min(H0[0], px)); py = Math.max(L0[1], Math.min(H0[1], py)); pz = Math.max(L0[2], Math.min(H0[2], pz));
    }
    if (o.init === 'blur') {
      // centroid of iso-0.5 crossings of the blurred field on the 12 lattice edges of this dual cell; clamp to cell
      let m = 0; const Dd = (X, Y, Z) => D[X + S * (Y + S * Z)] - 0.5;
      for (let a = 0; a < 3; a++) for (let u = -1; u <= 0; u++) for (let v = -1; v <= 0; v++) {
        let p, q, pa, pb;
        if (a === 0) { p = Dd(x - 1, y + u, z + v); q = Dd(x, y + u, z + v); pa = [-0.5, u + 0.5, v + 0.5]; pb = [0.5, u + 0.5, v + 0.5]; }
        if (a === 1) { p = Dd(x + u, y - 1, z + v); q = Dd(x + u, y, z + v); pa = [u + 0.5, -0.5, v + 0.5]; pb = [u + 0.5, 0.5, v + 0.5]; }
        if (a === 2) { p = Dd(x + u, y + v, z - 1); q = Dd(x + u, y + v, z); pa = [u + 0.5, v + 0.5, -0.5]; pb = [u + 0.5, v + 0.5, 0.5]; }
        if ((p > 0) !== (q > 0)) { const t = p / (p - q); px += pa[0] + t * (pb[0] - pa[0]); py += pa[1] + t * (pb[1] - pa[1]); pz += pa[2] + t * (pb[2] - pa[2]); m++; }
      }
      if (m) { px /= m; py /= m; pz /= m; } 
      const hb = o.clamp; px = Math.max(-hb, Math.min(hb, px)); py = Math.max(-hb, Math.min(hb, py)); pz = Math.max(-hb, Math.min(hb, pz));
    }
    if (forbid[forbid.length - 1] && o.editedAirRule === 'octant') { const T = [x + px, y + py, z + pz]; projectOctants(T, 0, x, y, z, forbid[forbid.length - 1], boxLo[boxLo.length - 1], boxHi[boxHi.length - 1]); px = T[0] - x; py = T[1] - y; pz = T[2] - z; }
    if (pinned[pinned.length - 1]) { px = 0; py = 0; pz = 0; }
    vx.push(x + px); vy.push(y + py); vz.push(z + pz);
  }
  // adjacency: 6 directions
  const DIRS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  const nb = new Int32Array(V * 6).fill(-1);
  for (let v = 0; v < V; v++) {
    const x = cx[v], y = cy[v], z = cz[v];
    for (let d = 0; d < 6; d++) {
      const [ex, ey, ez] = DIRS[d];
      const X = x + ex, Y = y + ey, Z = z + ez;
      if (X < 1 || Y < 1 || Z < 1 || X >= S || Y >= S || Z >= S) continue;
      const w = cid[ci(X, Y, Z)];
      if (w < 0) continue;
      if (o.links === 'gibson') { nb[v * 6 + d] = w; continue; }
      // mesh edge iff the 4 blocks around the block-edge (c, c+e) are not uniform
      const lx = Math.min(x, X), ly = Math.min(y, Y), lz = Math.min(z, Z);
      let s = 0;
      if (ex) { for (let u = -1; u <= 0; u++) for (let t = -1; t <= 0; t++) s += solid(lx, y + u, z + t) ? 1 : 0; }
      if (ey) { for (let u = -1; u <= 0; u++) for (let t = -1; t <= 0; t++) s += solid(x + u, ly, z + t) ? 1 : 0; }
      if (ez) { for (let u = -1; u <= 0; u++) for (let t = -1; t <= 0; t++) s += solid(x + u, y + t, lz) ? 1 : 0; }
      if (s !== 0 && s !== 4) nb[v * 6 + d] = w;
    }
  }
  // relaxation (damped Jacobi, order independent)
  let P = new Float64Array(V * 3), Q = new Float64Array(V * 3);
  for (let v = 0; v < V; v++) { P[3 * v] = vx[v]; P[3 * v + 1] = vy[v]; P[3 * v + 2] = vz[v]; }
  for (let it = 0; it < o.k; it++) {
    const lam0 = o.taubinMu && (it & 1) ? o.taubinMu : o.lambda;
    for (let v = 0; v < V; v++) {
      const i3 = 3 * v;
      const lam = o.taubinMu ? lam0 : lamv[v];
      if (pinned[v]) { Q[i3] = P[i3]; Q[i3 + 1] = P[i3 + 1]; Q[i3 + 2] = P[i3 + 2]; continue; }
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (let d = 0; d < 6; d++) {           // fixed neighbour order -> deterministic sums
        const w = nb[v * 6 + d]; if (w < 0) continue;
        sx += P[3 * w]; sy += P[3 * w + 1]; sz += P[3 * w + 2]; m++;
      }
      let nx = P[i3], ny = P[i3 + 1], nz = P[i3 + 2];
      if (m) {
        nx += lam * (sx / m - nx); ny += lam * (sy / m - ny); nz += lam * (sz / m - nz);
      }
      const X = cx[v], Y = cy[v], Z = cz[v], L = boxLo[v], H = boxHi[v];
      Q[i3] = Math.min(X + H[0], Math.max(X + L[0], nx));
      Q[i3 + 1] = Math.min(Y + H[1], Math.max(Y + L[1], ny));
      Q[i3 + 2] = Math.min(Z + H[2], Math.max(Z + L[2], nz));
      if (forbid[v] && o.editedAirRule === 'octant') projectOctants(Q, i3, X, Y, Z, forbid[v], L, H);
    }
    const t = P; P = Q; Q = t;
  }
  // quantize offset relative to corner, convert to world coords
  const W = new Float64Array(V * 3);
  for (let v = 0; v < V; v++) {
    const c = [cx[v], cy[v], cz[v]], b0 = [bx0, by0, bz0];
    for (let a = 0; a < 3; a++) {
      let off = P[3 * v + a] - c[a];
      if (o.quant) off = Math.round(off * o.quant) / o.quant;
      W[3 * v + a] = (b0[a] + c[a]) + off;
    }
  }
  // faces owned by chunk: lower block local in [A, A+N)
  const quads = []; // [v0,v1,v2,v3, solidBlockWorld..., airBlockWorld...]
  const faceQuads = (x, y, z, a) => {
    // face between block (x,y,z) and (x,y,z)+e_a
    const e = [0, 0, 0]; e[a] = 1;
    const s0 = solid(x, y, z), s1 = solid(x + e[0], y + e[1], z + e[2]);
    if (s0 === s1) return;
    // corners of the face: plane coord = (x,y,z)[a]+1, other two axes span [b, b+1]
    const u = (a + 1) % 3, w = (a + 2) % 3;
    const base = [x, y, z]; base[a] += 1;
    const cs = [];
    for (const [du, dw] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = base.slice(); p[u] += du; p[w] += dw; cs.push(cid[ci(p[0], p[1], p[2])]);
    }
    if (cs.some(c => c < 0)) throw new Error('missing vertex');
    // orient so normal points from solid to air: (u,w) order gives +a normal
    const q = s0 ? cs : [cs[0], cs[3], cs[2], cs[1]];
    const sb = s0 ? [x, y, z] : [x + e[0], y + e[1], z + e[2]];
    const ab = s0 ? [x + e[0], y + e[1], z + e[2]] : [x, y, z];
    quads.push({ v: q, solid: [sb[0] + bx0, sb[1] + by0, sb[2] + bz0], air: [ab[0] + bx0, ab[1] + by0, ab[2] + bz0], sharp: B(...sb) === 2 });
  };
  for (let z = A; z < A + N; z++) for (let y = A; y < A + N; y++) for (let x = A; x < A + N; x++)
    for (let a = 0; a < 3; a++) faceQuads(x, y, z, a);
  // faces on the low boundary (lower block at A-1 on one axis) are owned by the neighbour chunk
  return { V, W, quads, cx, cy, cz, bx0, by0, bz0, pinned, nb };
}

// Project offset d onto the union of closed octant boxes whose block is not forbidden (edited air).
// Octant bit order matches the dual-cell loop: bit = (dx+1) + 2*(dy+1) + 4*(dz+1), dx,dy,dz in {-1,0} -> sign -,+.
function projectOctants(Q, i3, X, Y, Z, forb, L, H) {
  const d = [Q[i3] - X, Q[i3 + 1] - Y, Q[i3 + 2] - Z];
  const oct = (d[0] > 0 ? 1 : 0) + (d[1] > 0 ? 2 : 0) + (d[2] > 0 ? 4 : 0);
  if (!(forb >> oct & 1)) return;
  let best = null, bd = Infinity;
  for (let b = 0; b < 8; b++) { if (forb >> b & 1) continue;
    const c = [0, 1, 2].map(a => { const pos = (b >> a) & 1; const lo = pos ? 0 : L[a], hi = pos ? H[a] : 0; return Math.min(hi, Math.max(lo, d[a])); });
    const dd = (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2;
    if (dd < bd) { bd = dd; best = c; } }
  if (!best) best = [0, 0, 0];
  Q[i3] = X + best[0]; Q[i3 + 1] = Y + best[1]; Q[i3 + 2] = Z + best[2];
}
export function worldPos(m, v) { return [m.W[3 * v], m.W[3 * v + 1], m.W[3 * v + 2]]; }

// signed volume of closed quad mesh (split quads into 2 triangles)
export function volume(m) {
  let vol = 0;
  for (const q of m.quads) {
    const p = q.v.map(v => worldPos(m, v));
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
      const [a, b, c] = [p[i], p[j], p[k]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}

// directed-edge cancellation (closed 2-chain) check
export function watertight(m) {
  const cnt = new Map();
  const key = (a, b) => a + ',' + b;
  for (const q of m.quads) for (let i = 0; i < 4; i++) {
    const a = q.v[i], b = q.v[(i + 1) % 4];
    cnt.set(key(a, b), (cnt.get(key(a, b)) || 0) + 1);
  }
  let bad = 0;
  for (const [k, n] of cnt) { const [a, b] = k.split(','); if ((cnt.get(key(b, a)) || 0) !== n) bad++; }
  return bad;
}
