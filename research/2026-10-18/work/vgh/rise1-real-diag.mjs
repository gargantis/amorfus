// VGH: diagnose rise1-real.mjs cases. For each (chunk, x, z): terrain
// columns around the 5×4 patch, the player trajectory (walk) per variant,
// the riser profile on the walk line, and the gh crossing for the riser's
// edges. Writes a profile image per case.
//   CASES='0,1,2:22:19;1,1,1:4:14' node work/vgh/rise1-real-diag.mjs
import { join } from 'node:path';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { VARIANTS } from './phys.mjs';
import * as P from '../vgs/physics-real.mjs';
import * as core from '../../harness/core.mjs';
import { slice, plotProfiles, IMG } from './viz.mjs';

const CASES = (process.env.CASES ?? '0,1,2:22:19;0,1,2:22:20;1,1,1:4:14;-1,0,0:6:20').split(';').map((s) => { const [c, x, z] = s.split(':'); return { c: c.split(',').map(Number), x: Number(x), z: Number(z) }; });
const VARS = (process.env.VARS ?? 'hints,gs-ctx,gh-cc8b').split(',');
const COL = { hints: [0, 90, 200], 'gs-ctx': [0, 160, 0], 'gh-cc8b': [210, 30, 30] };
const A = 10, STONE = 3;
const IDLE = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
for (const { c: [cx, cy, cz], x, z } of CASES) {
  const base = buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: A }).input;
  const n = base.nx;
  const ri = (X, Y, Z) => ((Y + A) * n + (Z + A)) * n + (X + A);
  const solid = (X, Y, Z) => (base.blocks[ri(X, Y, Z)] & 0xff) !== 0;
  const H = (X, Z) => { for (let y = 27; y >= 1; y--) if (solid(X, y, Z) && !solid(X, y + 1, Z)) return y; return -99; };
  const h = H(x, z);
  console.log(`== chunk ${cx},${cy},${cz} x=${x} z=${z} h=${h}`);
  for (let dz = -4; dz <= 4; dz++) {
    const row = [];
    for (let dx = -4; dx <= 9; dx++) { const hh = H(x + dx, z + dz) - h; row.push(hh === 0 ? ' .' : (hh > 0 ? '+' : '') + hh); }
    console.log(`   z${String(z + dz).padStart(3)} ${row.join(' ')}`);
  }
  // anything solid above the ground near the walk line (overhangs, trees)?
  let over = [];
  for (let dx = -3; dx <= 6; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = h + 2; y <= h + 5; y++) if (solid(x + dx, y, z + dz)) over.push(`${x + dx},${y},${z + dz}`);
  console.log(`   solid blocks h+2..h+5 near the walk line: ${over.length ? over.slice(0, 12).join(' ') : 'none'}`);
  const lines = [];
  for (const vn of VARS) {
    const V = VARIANTS[vn];
    const blocks = base.blocks.slice(), rho = base.rho.slice(), ed = base.shapeEdited.slice();
    for (let dz = -2; dz <= 2; dz++) for (let k = 1; k <= 4; k++) { const i = ri(x + k, h + 1, z + dz); blocks[i] = STONE; rho[i] = 1; ed[i] = 1; }
    const raw = V.mesh({ ...base, blocks, rho, shapeEdited: ed, params: V.params });
    const src = { chunkAt: (a, b, c) => (a === cx && b === cy && c === cz ? { origin: [cx * 32, cy * 32, cz * 32], positions: raw.positions, indexData: raw.indexData, pickRecords: raw.pickRecords, pickOffsets: raw.pickOffsets } : null) };
    let s = { position: [cx * 32 + x - 1.5, cy * 32 + h + 1.6, cz * 32 + z + 0.5], velocity: [0, 0, 0], onGround: false, flying: false };
    const tr = [];
    for (let t = 0, k = 0; t < 2.0; t += 1 / 60, k++) {
      s = P.stepPlayer(src, s, { ...IDLE, move: [0, 1], yaw: -Math.PI / 2 }, 1 / 60);
      if (k % 10 === 0) tr.push(`${(s.position[0] - cx * 32).toFixed(2)},${(s.position[1] - cy * 32).toFixed(2)}`);
    }
    const mesh = core.decodeMesh(raw);
    const segs = slice(mesh, 2, z + 0.5).filter((sg) => Math.min(sg[0], sg[2]) > x - 3 && Math.max(sg[0], sg[2]) < x + 7);
    const steep = segs.filter(([u0, y0, u1, y1]) => Math.abs(y1 - y0) > 0.05).map(([u0, y0, u1, y1]) => [Math.min(y0, y1), Math.max(y0, y1), (Math.atan2(Math.abs(y1 - y0), Math.abs(u1 - u0)) * 180) / Math.PI, Math.min(u0, u1)]).filter((q) => q[2] > 35).sort((a, b) => a[3] - b[3]);
    console.log(`   ${vn.padEnd(8)} walk: ${tr.join(' ')}`);
    console.log(`   ${''.padEnd(8)} >35° segs: ${steep.map(([a, b, g, u]) => `u${u.toFixed(2)} ${a.toFixed(2)}..${b.toFixed(2)}@${g.toFixed(0)}°`).join(' ')}`);
    lines.push({ segs, rgb: COL[vn] ?? [0, 0, 0], w: 1 });
  }
  const f = join(IMG, `rise1-real-${cx}_${cy}_${cz}-x${x}-z${z}.png`);
  plotProfiles(f, { u0: x - 3, u1: x + 7, y0: h - 0.5, y1: h + 3, S: 70, cells: (u, y) => { const k = u - x; if (k >= 1 && k <= 4 && y === h + 1) return 2; return solid(u, y, z) ? 1 : 0; }, lines });
  console.log('   ' + f);
}
