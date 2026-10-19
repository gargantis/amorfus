// Seam / apron evidence for a param set.
//   node work/gs/tools/seams.mjs '<json params>' <apron> [bigApron=24]
// World: built shapes straddling the chunk borders x = 32 and z = 32 —
// a mound centred on the chunk corner, a 1:4 ramp and a 1:8 ramp crossing
// x = 32, a terrace disc, on hinted ground (top y = 6).
// (1) apron sufficiency: each chunk meshed at `apron` must equal (bytes)
//     the same chunk meshed at bigApron;
// (2) seam: vertices shared between chunk (0,0,0) and (1,0,0) / (0,0,1)
//     must match in position and normal bytes.
import { meshRegion } from '../mesher-gs.mjs';
const params = JSON.parse(process.argv[2]);
const A = Number(process.argv[3] ?? 10);
const BIG = Number(process.argv[4] ?? 24);
const BASE = 6;
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
function ground(x, y, z) {
  const top = BASE + 0.3 + 0.15 * Math.sin(x * 0.21) * Math.cos(z * 0.17); // hinted, off-lattice
  const d = top - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) };
}
const hash = (x, z) => { let h = Math.imul(x * 374761393 + z * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 8) / 16777216; };
// random built heightfield (1–4 high, smoothed by a 2×2 box so it has slopes) along both seams
const rubble = (x, z) => {
  if (!((x >= 24 && x < 40) || (z >= 24 && z < 40))) return 0;
  if (x < 0 || z < 0 || x >= 64 || z >= 64) return 0;
  const f = (a, b) => Math.floor(hash(a >> 1, b >> 1) * 4);
  return Math.round((f(x, z) + f(x + 1, z) + f(x, z + 1) + f(x + 1, z + 1)) / 4);
};
function world(x, y, z) {
  const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
  if (y >= BASE && y < BASE + rubble(x, z) && !(Math.hypot(cx - 32.2, cz - 31.7) < 8)) return { v: STONE, edited: true };
  if (y >= BASE) {
    if (Math.hypot(cx - 32.2, cy - BASE, cz - 31.7) < 6.4) return { v: STONE, edited: true };           // mound on the corner
    if (cz >= 4 && cz < 14 && cx >= 20 && cy < BASE + Math.min(24, cx - 20) / 4) return { v: STONE, edited: true }; // 1:4 ramp
    if (cz >= 44 && cz < 54 && cx >= 16 && cy < BASE + Math.min(40, cx - 16) / 8) return { v: STONE, edited: true }; // 1:8 ramp
    if (y === BASE && Math.hypot(cx - 46, cz - 46) < 5.3) return { v: STONE, edited: true };            // terrace disc
    if (y < BASE + 5 && Math.hypot(cx - 31.8, cz - 46) < 3.6) return { v: STONE, edited: true };        // tower on the border
  }
  return ground(x, y, z);
}
function region(ci, ck, apron) {
  const n = 32 + 2 * apron;
  const blocks = new Uint16Array(n * n * n), rho = new Float32Array(n * n * n), shapeEdited = new Uint8Array(n * n * n);
  for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const c = world(ci * 32 + x - apron, y - apron, ck * 32 + z - apron);
    const i = (y * n + z) * n + x;
    blocks[i] = c.v; rho[i] = c.rho ?? (c.v === AIR ? -1 : 1); shapeEdited[i] = c.edited ? 1 : 0;
  }
  return { nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited, params };
}
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const meshes = {};
let suff = 0, checked = 0;
let iters = '';
for (const [ci, ck] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
  const m = meshRegion(region(ci, ck, A));
  const mb = meshRegion(region(ci, ck, BIG));
  meshes[`${ci},${ck}`] = m;
  checked++;
  const ok = same(new Uint8Array(m.vertexData), new Uint8Array(mb.vertexData)) && same(m.indexData, mb.indexData);
  if (ok) suff++;
  else {
    // count differing vertices (by corner+material) for the report
    const key = (mm, v) => `${mm.corners[v * 3]},${mm.corners[v * 3 + 1]},${mm.corners[v * 3 + 2]},${new Uint8Array(mm.vertexData)[v * 16 + 12]}`;
    const big = new Map();
    const ub = new Uint8Array(mb.vertexData);
    for (let v = 0; v < mb.vertexCount; v++) big.set(key(mb, v), ub.subarray(v * 16, v * 16 + 12).join(','));
    const ua = new Uint8Array(m.vertexData);
    let diff = 0;
    for (let v = 0; v < m.vertexCount; v++) if (big.get(key(m, v)) !== ua.subarray(v * 16, v * 16 + 12).join(',')) diff++;
    console.log(`  chunk ${ci},${ck}: apron ${A} differs from apron ${BIG} at ${diff} of ${m.vertexCount} vertices`);
  }
  if (m.stats?.iters) iters += ` ${ci},${ck}:i${m.stats.iters}/${mb.stats.iters}`;
}
// shared vertices across x = 32 and z = 32
function seam(ma, mbb, axis) {
  const ua = new Uint8Array(ma.vertexData), ub = new Uint8Array(mbb.vertexData);
  const idx = new Map();
  for (let v = 0; v < mbb.vertexCount; v++) {
    if (mbb.corners[v * 3 + axis] !== 0) continue;
    if ((ub[v * 16 + 7] & 1) === 1) continue; // sharp vertices are per-quad
    const c = [mbb.corners[v * 3], mbb.corners[v * 3 + 1], mbb.corners[v * 3 + 2]];
    c[axis] = 32;
    idx.set(`${c.join(',')},${ub[v * 16 + 12]}`, v);
  }
  let shared = 0, posBad = 0, nrmBad = 0;
  for (let v = 0; v < ma.vertexCount; v++) {
    if (ma.corners[v * 3 + axis] !== 32) continue;
    if ((ua[v * 16 + 7] & 1) === 1) continue;
    const k = `${ma.corners[v * 3]},${ma.corners[v * 3 + 1]},${ma.corners[v * 3 + 2]},${ua[v * 16 + 12]}`;
    const w = idx.get(k);
    if (w === undefined) continue;
    shared++;
    // positions: chunk-local fixed point; the axis coordinate differs by 32·256
    for (let a = 0; a < 3; a++) {
      const pa = ua[v * 16 + a * 2] | (ua[v * 16 + a * 2 + 1] << 8);
      const pb = ub[w * 16 + a * 2] | (ub[w * 16 + a * 2 + 1] << 8);
      if (pa - (a === axis ? 32 * 256 : 0) !== pb) { posBad++; break; }
    }
    for (let b = 8; b < 12; b++) if (ua[v * 16 + b] !== ub[w * 16 + b]) { nrmBad++; break; }
  }
  return { shared, posBad, nrmBad };
}
const sx = seam(meshes['0,0'], meshes['1,0'], 0);
const sz = seam(meshes['0,0'], meshes['0,1'], 2);
console.log(`apron ${A}: ${suff}/${checked} chunks identical to apron ${BIG}; seam x=32: ${sx.shared} shared, ${sx.posBad} position + ${sx.nrmBad} normal mismatches; seam z=32: ${sz.shared} shared, ${sz.posBad} position + ${sz.nrmBad} normal mismatches${iters}`);
