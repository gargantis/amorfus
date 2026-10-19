import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { VARIANTS } from './phys.mjs';
import * as P from '../vgs/physics-real.mjs';
const [cx, cy, cz, x, z] = [-3, 1, 1, 8, 11];
const A = 10, STONE = 3;
const base = buildGenMeshInput([1, 1], cx, cy, cz, new Map(), { forceApron: A }).input;
const n = base.nx;
const ri = (X, Y, Z) => ((Y + A) * n + (Z + A)) * n + (X + A);
const solid = (X, Y, Z) => (base.blocks[ri(X, Y, Z)] & 0xff) !== 0;
const H = (X, Z) => { for (let y = 27; y >= 1; y--) if (solid(X, y, Z) && !solid(X, y + 1, Z)) return y; return -99; };
const h = H(x, z);
console.log('h', h, 'cols', [-3,-2,-1,0,1,2,3,4].map(k=>H(x+k,z)));
const V = VARIANTS.hints;
const blocks = base.blocks.slice(), rho = base.rho.slice(), ed = base.shapeEdited.slice();
for (let dz = -1; dz <= 1; dz++) for (let k = 1; k <= 2; k++) { const i = ri(x + k, h + 1, z + dz); blocks[i] = STONE; rho[i] = 1; ed[i] = 1; }
const mesh = V.mesh({ ...base, blocks, rho, shapeEdited: ed, params: V.params });
const src = { chunkAt: (a, b, c) => (a === cx && b === cy && c === cz ? { origin: [cx * 32, cy * 32, cz * 32], positions: mesh.positions, indexData: mesh.indexData, pickRecords: mesh.pickRecords, pickOffsets: mesh.pickOffsets } : null) };
let s = { position: [cx * 32 + x - 1.5, cy * 32 + h + 1.6, cz * 32 + z + 0.5], velocity: [0, 0, 0], onGround: false, flying: false };
const IDLE = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
for (let t = 0, k = 0; t < 1.6; t += 1 / 60, k++) {
  s = P.stepPlayer(src, s, { ...IDLE, move: [0, 1], yaw: -Math.PI / 2 }, 1 / 60);
  if (k % 8 === 0) console.log(t.toFixed(2), (s.position[0] - cx*32).toFixed(2), (s.position[1]-cy*32).toFixed(2), (s.position[2]-cz*32).toFixed(2), s.onGround);
}
