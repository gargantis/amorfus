// VGS: the tall-foot bypass on REAL generated terrain (seed [1,1], GEN_MESH
// input with hints). Find natural 1-block terrace edges (flat lower side,
// flat upper side), place a 1-high patch flush on the upper side (a player
// floor/wall), walk/sprint at it with the real controller.
//   node work/vgs/bypass-real.mjs [maxCandidates]
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { VARIANTS, stepPlayer, f2 } from './phys.mjs';
import * as P from './physics-real.mjs';

const MAXC = Number(process.argv[2] ?? 12);
const CHUNKS = [[-1, 1, 1], [-2, 1, 1], [-1, 1, 2], [-3, 1, 0], [-2, 1, 0], [-2, 1, 2], [-3, 1, 1], [0, 1, 2], [0, 0, -3], [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [1, 1, 1], [-1, 0, -1]];
const STONE = 3, A = 10;
let found = 0;
const tally = {};
const IDLE = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
for (const [cx, cy, cz] of CHUNKS) {
  if (found >= MAXC) break;
  const base = buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: A }).input;
  const n = base.nx;
  const ri = (x, y, z) => ((y + A) * n + (z + A)) * n + (x + A);
  const solid = (x, y, z) => (base.blocks[ri(x, y, z)] & 0xff) !== 0;
  // surface height per column (top solid with air above), chunk-local, −1 if none in [1, 28]
  const H = (x, z) => { for (let y = 27; y >= 1; y--) if (solid(x, y, z) && !solid(x, y + 1, z)) return y; return -99; };
  for (let x = 4; x < 24 && found < MAXC; x++) for (let z = 5; z < 27 && found < MAXC; z++) {
    for (const dir of [1, -1]) {
      // edge between column x (lower, height h) and x+dir (upper, h+1), straight along z for 5
      const h = H(x, z);
      if (h < 2 || h > 22) continue;
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) {
        for (let k = 0; k < 2 && ok; k++) if (H(x - dir * k, z + dz) !== h) ok = false;          // flat lower side, 2 deep
        for (let k = 1; k <= 2 && ok; k++) if (H(x + dir * k, z + dz) !== h + 1) ok = false;      // flat upper side, 2 deep
      }
      if (!ok) continue;
      found++;
      const label = `chunk ${cx},${cy},${cz} edge x=${x}${dir > 0 ? '→' : '←'} z=${z} h=${h}`;
      const row = [];
      for (const vn of ['hints', 'gs-ctx', 'gs-mls']) {
        const V = VARIANTS[vn];
        // copy and place a 1-high patch on the upper terrace (3 deep × 5 wide), flush with the edge
        const blocks = base.blocks.slice(), rho = base.rho.slice(), ed = base.shapeEdited.slice();
        for (let dz = -1; dz <= 1; dz++) for (let k = 1; k <= 2; k++) {
          const i = ri(x + dir * k, h + 2, z + dz);
          blocks[i] = STONE; rho[i] = 1; ed[i] = 1;
        }
        const mesh = V.mesh({ ...base, blocks, rho, shapeEdited: ed, params: V.params });
        const src = { chunkAt: (a, b, c) => (a === cx && b === cy && c === cz ? { origin: [cx * 32, cy * 32, cz * 32], positions: mesh.positions, indexData: mesh.indexData, pickRecords: mesh.pickRecords, pickOffsets: mesh.pickOffsets } : null) };
        let up = 0;
        for (const sprint of [false, true]) {
          let s = { position: [cx * 32 + x - dir * 1.0 + 0.5, cy * 32 + h + 1.6, cz * 32 + z + 0.5], velocity: [0, 0, 0], onGround: false, flying: false };
          const inp = { ...IDLE, move: [0, 1], yaw: dir > 0 ? -Math.PI / 2 : Math.PI / 2, sprint };
          for (let t = 0; t < 2.2; t += 1 / 60) s = P.stepPlayer(src, s, inp, 1 / 60);
          const lx = s.position[0] - cx * 32, ly = s.position[1] - cy * 32;
          if ((dir > 0 ? lx > x + 1.6 : lx < x - 0.6) && ly > h + 2.6) up++;
        }
        row.push(`${vn} ${up === 0 ? 'blocked' : `CLIMBED ${up}/2`}`);
        tally[vn] = (tally[vn] ?? 0) + (up > 0 ? 1 : 0);
      }
      console.log(`${label}: ${row.join(' | ')}`);
    }
  }
}
console.log(`edges tested: ${found}; climbed (2-block rise = natural step + placed patch):`, tally);
