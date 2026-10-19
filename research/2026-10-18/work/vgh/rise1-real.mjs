// VGH: PLACED 1-block rises on REAL generated terrain (seed [1,1], GEN_MESH
// input with hints, apron 10). Find flat natural ground (one column height
// over a 7×5 area), place a 5-wide × 4-deep 1-high patch on it, and walk /
// sprint at it with the real controller (PLAN §14: walk up a built smooth
// 1-block rise). Reports the local hint phase φ (surface − block-grid top).
//   node work/vgh/rise1-real.mjs [maxCandidates]
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { VARIANTS } from './phys.mjs';
import * as P from '../vgs/physics-real.mjs';
import * as core from '../../harness/core.mjs';
import { slice } from './viz.mjs';
const topAt = (raw, X, Z) => { const m = core.decodeMesh(raw); let best = -Infinity; for (const [u0, y0, u1, y1] of slice(m, 2, Z)) { const lo = Math.min(u0, u1), hi = Math.max(u0, u1); if (lo <= X && hi >= X && hi > lo) { const y = y0 + ((y1 - y0) * (X - u0)) / (u1 - u0); if (y > best) best = y; } } return best; };
const sag = {};

const MAXC = Number(process.argv[2] ?? 60);
const VARS = (process.env.VARS ?? 'hints,gs-ctx,gh-cc8b').split(',');
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const STONE = 3, A = 10;
const IDLE = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
let found = 0;
const fails = {};
const failPh = {};
const phs = [];
for (const [cx, cy, cz] of CHUNKS) {
  if (found >= MAXC) break;
  const base = buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: A }).input;
  const n = base.nx;
  const ri = (x, y, z) => ((y + A) * n + (z + A)) * n + (x + A);
  const solid = (x, y, z) => (base.blocks[ri(x, y, z)] & 0xff) !== 0;
  const H = (x, z) => { for (let y = 27; y >= 1; y--) if (solid(x, y, z) && !solid(x, y + 1, z)) return y; return -99; };
  const surf = (x, z) => { const y = H(x, z); const r0 = base.rho[ri(x, y, z)], r1 = base.rho[ri(x, y + 1, z)]; return y + 0.5 + r0 / (r0 - r1); };
  for (let x = 4; x < 23 && found < MAXC; x += 1) for (let z = 5; z < 26 && found < MAXC; z += 1) {
    const h = H(x, z);
    if (h < 2 || h > 22) continue;
    let ok = true;
    for (let dx = -2; dx <= 4 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) if (H(x + dx, z + dz) !== h) ok = false;
    // no overhangs / trees above the walk line (spawn must be clear)
    for (let dx = -3; dx <= 6 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) for (let y = h + 2; y <= h + 5; y++) if (solid(x + dx, y, z + dz)) ok = false;
    if (!ok) continue;
    found++;
    const ph = surf(x, z) - (h + 1);
    phs.push(ph);
    const row = [];
    for (const vn of VARS) {
      const V = VARIANTS[vn];
      const blocks = base.blocks.slice(), rho = base.rho.slice(), ed = base.shapeEdited.slice();
      for (let dz = -2; dz <= 2; dz++) for (let k = 1; k <= 4; k++) { const i = ri(x + k, h + 1, z + dz); blocks[i] = STONE; rho[i] = 1; ed[i] = 1; }
      const mesh = V.mesh({ ...base, blocks, rho, shapeEdited: ed, params: V.params });
      const src = { chunkAt: (a, b, c) => (a === cx && b === cy && c === cz ? { origin: [cx * 32, cy * 32, cz * 32], positions: mesh.positions, indexData: mesh.indexData, pickRecords: mesh.pickRecords, pickOffsets: mesh.pickOffsets } : null) };
      let up = 0;
      for (const sprint of [false, true]) {
        let s = { position: [cx * 32 + x - 1.5, cy * 32 + h + 1.6, cz * 32 + z + 0.5], velocity: [0, 0, 0], onGround: false, flying: false };
        const inp = { ...IDLE, move: [0, 1], yaw: -Math.PI / 2, sprint };
        let onPatch = false;
        for (let t = 0; t < 2.0; t += 1 / 60) {
          s = P.stepPlayer(src, s, inp, 1 / 60);
          const lx = s.position[0] - cx * 32, ly = s.position[1] - cy * 32, lz = s.position[2] - cz * 32;
          if (lx >= x + 2.5 && lx <= x + 4.5 && lz >= z - 2 && lz <= z + 3 && ly > h + 1.5) onPatch = true;
        }
        if (onPatch) up++;
      }
      const top = topAt(mesh, x + 3, z + 0.5) - (h + 2);
      (sag[vn] ??= []).push(top);
      row.push(`${vn} ${up === 2 ? 'up' : `STUCK ${2 - up}/2`} top ${top >= 0 ? '+' : ''}${top.toFixed(3)}`);
      if (up < 2) { fails[vn] = (fails[vn] ?? 0) + 1; (failPh[vn] ??= []).push(ph.toFixed(2)); }
    }
    console.log(`chunk ${cx},${cy},${cz} x=${x} z=${z} h=${h} φ ${ph.toFixed(2)}: ${row.join(' | ')}`);
  }
}
phs.sort((a, b) => a - b);
console.log(`patches tested: ${found}; φ range ${phs[0]?.toFixed(2)} … ${phs[phs.length - 1]?.toFixed(2)}, ${phs.filter((p) => p <= -0.4).length} with φ ≤ −0.40`);
console.log('patches with a failed approach:', fails, 'at φ', failPh);
for (const [vn, a] of Object.entries(sag)) { const b = a.slice().sort((p, q) => p - q); console.log(`${vn}: patch-top height at its centre minus the block top: min ${b[0].toFixed(3)}, median ${b[b.length >> 1].toFixed(3)}, max ${b[b.length - 1].toFixed(3)}; ${b.filter((v) => v < -0.1).length}/${b.length} below −0.10`); }
