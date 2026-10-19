// vgn: C-12 — an edit at a chunk corner remeshes up to 8 chunks. Sum and
// max of per-chunk mesh time (min-of-N, interleaved), repo vs gn-best, for
// (a) one block placed at the corner of an otherwise unbuilt area and
// (b) the same block placed in a built-up area (a 16×8×16 hollow house
// straddling the corner).
import { meshRegion as gn } from '../gn/mesher-gn.mjs';
import { meshRegion as repo } from '../../lib/mesher-repo.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { setBlock } from './util.mjs';
const N = Number(process.argv[2] ?? 15);
const seed = [1, 1];
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
// corner (x=-32, z=64); y border nearest the surface there
const X = -32, Z = 64;
const t = topAt(X, Z);
const Y = Math.round((t + 1) / 32) * 32;
console.log(`corner at ${X},${Y},${Z}; surface top ${t}`);
const chunks = [];
for (const dy of [-1, 0]) for (const dz of [-1, 0]) for (const dx of [-1, 0]) chunks.push([X / 32 + dx, Y / 32 + dy, Z / 32 + dz]);
const scen = {
  'one block at the corner': (e) => setBlock(e, X, t + 1, Z, 3),
  'one block at the corner of a 16x8x16 house': (e) => {
    for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z++) { const h = topAt(X + x, Z + z) + 1; for (let y = 0; y < 8; y++) { const wall = x === -8 || x === 7 || z === -8 || z === 7 || y === 7; setBlock(e, X + x, h + y, Z + z, wall ? 5 : 0); } }
    setBlock(e, X, t + 1, Z, 3);
  },
};
for (const [label, f] of Object.entries(scen)) {
  const e = new Map(); f(e);
  const inputs = chunks.map((c) => buildGenMeshInput(seed, ...c, e, {}).input);
  const best = inputs.map(() => [Infinity, Infinity]);
  for (let r = 0; r < N; r++) inputs.forEach((inp, i) => {
    let t0 = performance.now(); repo(inp); best[i][0] = Math.min(best[i][0], performance.now() - t0);
    t0 = performance.now(); gn({ ...inp, params: PARAMS }); best[i][1] = Math.min(best[i][1], performance.now() - t0);
  });
  const sum = (k) => best.reduce((s, b) => s + b[k], 0), mx = (k) => Math.max(...best.map((b) => b[k]));
  console.log(`${label}: aprons ${inputs.map((i) => i.apron).join(',')}; 8-chunk sum repo ${sum(0).toFixed(1)} ms → gn-best ${sum(1).toFixed(1)} ms (+${(sum(1) - sum(0)).toFixed(1)}); slowest chunk ${mx(0).toFixed(1)} → ${mx(1).toFixed(1)} ms`);
}
