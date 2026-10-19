// VGS: seams at a 3D chunk CORNER. Meshes the 8 chunks around world corner
// (32,32,32), each from its own region at apron A (as production does), and
// compares every vertex shared across the x=32, y=32 and z=32 planes (keyed
// by lattice corner + material, sharp excluded) in position and normal
// bytes. Also checks apron sufficiency: each chunk at A vs at 24.
//   node work/vgs/seams3d.mjs [variants] [apron] [world]
import { VARIANTS, clampRho, AIR, GRASS, DIRT, STONE, PLANKS, BRICK } from './phys.mjs';

const [vs = 'hints,gs-ctx,gs-mls', aArg = '10', worldName = 'corner'] = process.argv.slice(2);
const A = Number(aArg);
const BIG = 24;
const hash = (x, y, z) => { let h = Math.imul(x * 374761393 + y * 1103515245 + z * 668265263, 1274126177) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h >>> 8) / 16777216; };
const C = 32; // the corner
const WORLDS = {
  // natural hill whose surface crosses y = 32 around the corner, with edits straddling all three seams
  corner(x, y, z) {
    const xc = x + 0.5, yc = y + 0.5, zc = z + 0.5;
    const H = 31.6 + 1.8 * Math.sin(xc * 0.23) * Math.cos(zc * 0.19) + 0.04 * (xc - C) ; // surface crosses y=32
    // edits
    if (Math.hypot(xc - C, yc - (C - 1), zc - C) < 4.6 && yc > C - 1) return { v: PLANKS, edited: true };          // mound on the corner
    if (zc > 36 && zc < 42 && xc > 24 && xc < 40 && yc < 30 + (xc - 24) / 4 && yc > 29) return { v: STONE, edited: true }; // 1:4 ramp crossing x=32 and y=32
    if (Math.abs(xc - zc) < 1.0 && xc > 22 && xc < 42 && yc > 30 && yc < 32) return { v: AIR, edited: true };      // dug diagonal 1×2 tunnel crossing the corner
    if (xc > 26 && xc < 38 && zc > 24 && zc < 29 && yc > 31 && yc < 31 + 1 + Math.floor(hash(x >> 1, 0, z >> 1) * 3)) return { v: BRICK, edited: true }; // rubble across x=32
    if (xc > 34 && xc < 36 && zc > 26 && zc < 38 && yc > 30 && yc < 35) return { v: STONE, edited: true };          // 1-thick wall crossing z=32 and y=32
    if (hash(x, y, z) < 0.04 && Math.abs(xc - C) < 6 && Math.abs(zc - C) < 6 && Math.abs(yc - C) < 5) return { v: hash(z, x, y) < 0.5 ? STONE : AIR, edited: true }; // sprinkled single edits
    const d = H - yc;
    if (d <= 0) return { v: AIR, rho: clampRho(d) };
    return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) };
  },
};
const world = WORLDS[worldName];
function region(cx, cy, cz, apron) {
  const n = 32 + 2 * apron;
  const blocks = new Uint16Array(n * n * n), rho = new Float32Array(n * n * n), shapeEdited = new Uint8Array(n * n * n);
  for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const c = world(cx * 32 + x - apron, cy * 32 + y - apron, cz * 32 + z - apron);
    const i = (y * n + z) * n + x;
    blocks[i] = c.v; rho[i] = c.rho ?? (c.v === AIR ? -1 : 1); shapeEdited[i] = c.edited ? 1 : 0;
  }
  return { nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited };
}
const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
for (const vn of vs.split(',')) {
  const V = VARIANTS[vn];
  const meshes = {};
  let suff = 0, total = 0, diffVerts = 0;
  for (const cx of [0, 1]) for (const cy of [0, 1]) for (const cz of [0, 1]) {
    const m = V.mesh({ ...region(cx, cy, cz, A), params: V.params });
    meshes[`${cx}${cy}${cz}`] = m;
    if (A !== BIG) {
      const mb = V.mesh({ ...region(cx, cy, cz, BIG), params: V.params });
      total++;
      if (same(new Uint8Array(m.vertexData), new Uint8Array(mb.vertexData)) && same(m.indexData, mb.indexData)) suff++;
      else {
        const key = (mm, v) => `${mm.corners[v * 3]},${mm.corners[v * 3 + 1]},${mm.corners[v * 3 + 2]},${new Uint8Array(mm.vertexData)[v * 16 + 12]},${new Uint8Array(mm.vertexData)[v * 16 + 7] & 1}`;
        const big = new Map();
        const ub = new Uint8Array(mb.vertexData);
        for (let v = 0; v < mb.vertexCount; v++) big.set(key(mb, v), ub.subarray(v * 16, v * 16 + 12).join(','));
        const ua = new Uint8Array(m.vertexData);
        for (let v = 0; v < m.vertexCount; v++) if (big.get(key(m, v)) !== ua.subarray(v * 16, v * 16 + 12).join(',')) diffVerts++;
      }
    }
  }
  // shared-plane comparison for the 12 adjacent pairs
  let shared = 0, posBad = 0, nrmBad = 0, aoBad = 0;
  const pairs = [];
  for (const a of ['0', '1']) for (const b of ['0', '1']) {
    pairs.push([`0${a}${b}`, `1${a}${b}`, 0]);
    pairs.push([`${a}0${b}`, `${a}1${b}`, 1]);
    pairs.push([`${a}${b}0`, `${a}${b}1`, 2]);
  }
  for (const [ka, kb, axis] of pairs) {
    const ma = meshes[ka], mb = meshes[kb];
    const ua = new Uint8Array(ma.vertexData), ub = new Uint8Array(mb.vertexData);
    const idx = new Map();
    for (let v = 0; v < mb.vertexCount; v++) {
      if (mb.corners[v * 3 + axis] !== 0) continue;
      if ((ub[v * 16 + 7] & 1) === 1) continue;
      const c = [mb.corners[v * 3], mb.corners[v * 3 + 1], mb.corners[v * 3 + 2]];
      c[axis] = 32;
      idx.set(`${c.join(',')},${ub[v * 16 + 12]}`, v);
    }
    for (let v = 0; v < ma.vertexCount; v++) {
      if (ma.corners[v * 3 + axis] !== 32) continue;
      if ((ua[v * 16 + 7] & 1) === 1) continue;
      const w = idx.get(`${ma.corners[v * 3]},${ma.corners[v * 3 + 1]},${ma.corners[v * 3 + 2]},${ua[v * 16 + 12]}`);
      if (w === undefined) continue;
      shared++;
      for (let q = 0; q < 3; q++) {
        const pa = ua[v * 16 + q * 2] | (ua[v * 16 + q * 2 + 1] << 8);
        const pb = ub[w * 16 + q * 2] | (ub[w * 16 + q * 2 + 1] << 8);
        if (pa - (q === axis ? 32 * 256 : 0) !== pb) { posBad++; break; }
      }
      for (let q = 8; q < 12; q++) if (ua[v * 16 + q] !== ub[w * 16 + q]) { nrmBad++; break; }
      if (ua[v * 16 + 6] !== ub[w * 16 + 6]) aoBad++;
    }
  }
  console.log(`${vn.padEnd(7)} apron ${A}: ${A !== BIG ? `${suff}/${total} chunks byte-identical to apron ${BIG} (${diffVerts} differing vertices)` : ''}; 8-chunk corner seams: ${shared} shared vertices, ${posBad} position / ${nrmBad} normal / ${aoBad} AO mismatches`);
}
