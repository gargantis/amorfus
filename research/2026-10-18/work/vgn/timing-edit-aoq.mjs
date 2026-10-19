// vgn: edited-chunk cost, interleaved min-of-N, untouched repo mesher vs
// gn-best, including worst cases for the ring normals (most vertices in the
// edit zone). Mesh only (no decode), production apron (10 here).
//   node work/vgn/timing-edit.mjs [N]
import { meshRegion as gn } from '../gn/mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { PARAMS as AOQ } from '../../approaches/vgn-aoq.mjs';
import { setBlock } from './util.mjs';
const N = Number(process.argv[2] ?? 15);
const seed = [1, 1];
const C = [-1, 1, 1];
const bx = C[0] * 32, by = C[1] * 32, bz = C[2] * 32;
const cache = new Map();
function topAt(wx, wz) {
  for (let cy = 3; cy >= -1; cy--) {
    const k = `${Math.floor(wx / 32)},${cy},${Math.floor(wz / 32)}`;
    let inp = cache.get(k);
    if (!inp) { inp = buildGenMeshInput(seed, Math.floor(wx / 32), cy, Math.floor(wz / 32), new Map(), { forceApron: 0 }).input; cache.set(k, inp); }
    const lx = wx - Math.floor(wx / 32) * 32, lz = wz - Math.floor(wz / 32) * 32;
    for (let y = 31; y >= 0; y--) if ((inp.blocks[(y * 32 + lz) * 32 + lx] & 0xff) !== 0) return cy * 32 + y;
  }
}
let rs = 12345;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const S = {
  'one placed block': (e) => setBlock(e, bx + 16, topAt(bx + 16, bz + 16) + 1, bz + 16, 3),
  'fence maze (1-wide, 3 high, every 3 blocks, whole chunk)': (e) => {
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) if (x % 3 === 0 || z % 3 === 0) { const t = topAt(bx + x, bz + z); for (let h = 1; h <= 3; h++) setBlock(e, bx + x, t + h, bz + z, 5); }
  },
  'scaffold (1x1 beams every 3 blocks in x, y, z)': (e) => {
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) { const t = topAt(bx + x, bz + z); for (let y = t + 1; y < by + 32; y++) { const k = ((x % 3 === 0) ? 1 : 0) + ((z % 3 === 0) ? 1 : 0) + (((y - by) % 3 === 0) ? 1 : 0); if (k >= 2) setBlock(e, bx + x, y, bz + z, 5); } }
  },
  '3000 random edits (place/dig) in the chunk': (e) => {
    for (let i = 0; i < 3000; i++) { const x = Math.floor(rnd() * 32), z = Math.floor(rnd() * 32); const t = topAt(bx + x, bz + z); const y = t + Math.floor(rnd() * 6) - 2; setBlock(e, bx + x, y, bz + z, rnd() < 0.5 ? 0 : 3); }
  },
  'hollow house 16x8x16': (e) => {
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { const h = topAt(bx + 8 + x, bz + 8 + z) + 1; for (let y = 0; y < 8; y++) { const wall = x === 0 || x === 15 || z === 0 || z === 15 || y === 7; setBlock(e, bx + 8 + x, h + y, bz + 8 + z, wall ? 5 : 0); } }
  },
};
const inputs = Object.entries(S).map(([label, f]) => { const e = new Map(); f(e); return [label, buildGenMeshInput(seed, ...C, e, {}).input]; });
const zoneOf = (inp) => {
  const m1 = gn({ ...inp, params: PARAMS });
  const m0 = gn({ ...inp, params: { ...PARAMS, normalRule: 'area', fastShade: false } });
  const i1 = new Int16Array(m1.vertexData), i0 = new Int16Array(m0.vertexData);
  let z = 0;
  for (let v = 0; v < m1.vertexCount; v++) if (i1[v * 8 + 4] !== i0[v * 8 + 4] || i1[v * 8 + 5] !== i0[v * 8 + 5]) z++;
  return [z, m1.vertexCount];
};
const best = inputs.map(() => [Infinity, Infinity, Infinity]);
for (let r = 0; r < N; r++) inputs.forEach(([, inp], i) => {
  let t0 = performance.now(); repo(inp); best[i][0] = Math.min(best[i][0], performance.now() - t0);
  t0 = performance.now(); gn({ ...inp, params: PARAMS }); best[i][1] = Math.min(best[i][1], performance.now() - t0);
  t0 = performance.now(); gn({ ...inp, params: AOQ }); best[i][2] = Math.min(best[i][2], performance.now() - t0);
});
inputs.forEach(([label, inp], i) => {
  const [z, V] = zoneOf(inp);
  console.log(`${label}: apron ${inp.apron}, ${V} vertices, ${z} with ring normals; repo ${best[i][0].toFixed(1)} ms, gn-best ${best[i][1].toFixed(1)} ms, AO-only ${best[i][2].toFixed(1)} ms (+${(best[i][1] - best[i][0]).toFixed(1)}, ×${(best[i][1] / best[i][0]).toFixed(2)}) [min of ${N}]`);
});
