// GS STUDY: the §14 physics battery (controller.test.ts scenarios) plus
// built staircases and walls, run through the REAL controller against the
// patched mesher with arbitrary params. Returns measurements, not asserts.
import { stepPlayer, PLAYER, type PlayerState, type ControllerInput } from './controller';
import { MeshWorld, type WorldFn } from './test-world';
import { trianglesInBox, type TriangleSource } from './collision';
import { makeBlock, AIR } from '../world/block';
import type { MeshParams } from '../mesh/mesher';

const STONE = makeBlock(3, false);
const PLANKS = makeBlock(5, false);
const SHARP_BRICK = makeBlock(6, true);
const idle: ControllerInput = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
const spawn = (x: number, y: number, z: number): PlayerState => ({ position: [x, y, z], velocity: [0, 0, 0], onGround: false, flying: false });

function run(w: TriangleSource, s0: PlayerState, input: Partial<ControllerInput>, seconds: number, dt = 1 / 60): PlayerState {
  let s = s0;
  const full: ControllerInput = { ...idle, ...input };
  for (let t = 0; t < seconds; t += dt) s = stepPlayer(w, s, full, dt);
  return s;
}

function pointTriDist(px: number, py: number, pz: number, t: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number }): number {
  const d2 = (x: number, y: number, z: number): number => Math.hypot(px - x, py - y, pz - z);
  const gx = (t.ax + t.bx + t.cx) / 3;
  const gy = (t.ay + t.by + t.cy) / 3;
  const gz = (t.az + t.bz + t.cz) / 3;
  return Math.min(d2(t.ax, t.ay, t.az), d2(t.bx, t.by, t.bz), d2(t.cx, t.cy, t.cz), d2(gx, gy, gz));
}
function insideSolid(world: TriangleSource, s: PlayerState, eps = 0.05): boolean {
  const [px, py, pz] = s.position;
  const tris = trianglesInBox(world, Math.floor(px) - 2, Math.floor(py) - 1, Math.floor(pz) - 2, Math.floor(px) + 2, Math.floor(py + PLAYER.height) + 1, Math.floor(pz) + 2);
  const a = [px, py + PLAYER.radius, pz] as const;
  const b = [px, py + PLAYER.height - PLAYER.radius, pz] as const;
  for (const tri of tris) {
    for (let i = 0; i <= 4; i++) {
      const qx = a[0] + ((b[0] - a[0]) * i) / 4;
      const qy = a[1] + ((b[1] - a[1]) * i) / 4;
      const qz = a[2] + ((b[2] - a[2]) * i) / 4;
      const d = pointTriDist(qx, qy, qz, tri);
      if (d < PLAYER.radius - eps) {
        const nx = (tri.by - tri.ay) * (tri.cz - tri.az) - (tri.bz - tri.az) * (tri.cy - tri.ay);
        const ny = (tri.bz - tri.az) * (tri.cx - tri.ax) - (tri.bx - tri.ax) * (tri.cz - tri.az);
        const nz = (tri.bx - tri.ax) * (tri.cy - tri.ay) - (tri.by - tri.ay) * (tri.cx - tri.ax);
        if ((qx - tri.ax) * nx + (qy - tri.ay) * ny + (qz - tri.az) * nz < 0) return true;
      }
    }
  }
  return false;
}

const hinted = (y: number, top: number): { v: number; rho: number } => {
  const d = top - y - 0.5;
  return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) || 1 / 127 };
};
function world(fn: WorldFn, params: Partial<MeshParams>): MeshWorld {
  const w = new MeshWorld(fn, params);
  w.build(-1, 0, -1, 1, 0, 1);
  return w;
}
const EAST = { move: [0, 1] as [number, number], yaw: -Math.PI / 2 };

export interface BatteryResult { name: string; pass: boolean; detail: string }

export function battery(params: Partial<MeshParams>): BatteryResult[] {
  const out: BatteryResult[] = [];
  const add = (name: string, pass: boolean, detail: string): void => { out.push({ name, pass, detail }); };
  const f = (v: number): string => v.toFixed(2);

  // 1. walks up a built 1-block rise (binary ground)
  {
    const w = world((x, y) => (y < 8 ? { v: STONE } : y === 8 && x >= 8 ? { v: STONE, edited: true } : { v: AIR }), params);
    const s = run(w, spawn(4.5, 8.1, 4.5), EAST, 3);
    add('built 1-block rise: walks up', s.position[0] > 10 && s.position[1] > 8.6 && !insideSolid(w, s), `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 1b. built 1-block rise on hinted ground, at phases
  for (const phase of [0, 0.25, 0.45]) {
    const w = world((x, y) => (y === 7 && x >= 8 ? { v: STONE, edited: true } : hinted(y, 7 + phase)), params);
    const s = run(w, spawn(4.5, 7.2 + phase, 4.5), EAST, 3);
    add(`built 1-block rise on hinted ground φ${phase}: walks up`, s.position[0] > 10 && s.position[1] > 7.6 && !insideSolid(w, s), `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 2. blocked by a 2-block rise (binary ground)
  {
    const w = world((x, y) => (y < 8 ? { v: STONE } : (y === 8 || y === 9) && x >= 8 ? { v: STONE, edited: true } : { v: AIR }), params);
    const s = run(w, spawn(4.5, 8.1, 4.5), EAST, 3);
    add('built 2-block rise: blocked', s.position[0] < 8.0, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 2b. 2-block rise on hinted ground, phases; and a sprinting attempt
  for (const phase of [0, 0.25, 0.45]) {
    const w = world((x, y) => ((y === 7 || y === 8) && x >= 8 ? { v: STONE, edited: true } : hinted(y, 7 + phase)), params);
    const s = run(w, spawn(4.5, 7.2 + phase, 4.5), { ...EAST, sprint: true }, 3);
    add(`built 2-block rise on hinted ground φ${phase} (sprint): blocked`, s.position[0] < 8.0, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 2c. 2-block wall in a 1:1 built staircase context: steps 1 high then a 2-high riser
  {
    const w = world((x, y) => {
      if (y < 8) return { v: STONE };
      const h = x < 8 ? 0 : x < 10 ? 1 : 3; // 1-step, then +2
      return y < 8 + h ? { v: STONE, edited: true } : { v: AIR };
    }, params);
    const s = run(w, spawn(4.5, 8.1, 4.5), { ...EAST, sprint: true }, 4);
    add('1-step then 2-high riser (sprint): blocked at riser', s.position[0] < 10.0, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 3. pit dug into hinted ground: walks out
  {
    const w = world((x, y, z) => {
      const dug = x >= 3 && x < 6 && z >= 3 && z < 6 && y === 7;
      if (dug) return { v: AIR, edited: true };
      return hinted(y, 8);
    }, params);
    const s = run(w, spawn(4.5, 7.1, 4.5), EAST, 3);
    add('one-layer pit: walks out', s.position[0] > 7 && s.position[1] > 7.2, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 4. sharp 1-block wall blocks; a jump clears it
  {
    const w = world((x, y) => (y < 8 ? { v: STONE } : y === 8 && x === 8 ? { v: SHARP_BRICK } : { v: AIR }), params);
    const blocked = run(w, spawn(5.5, 8.1, 8.5), EAST, 2);
    let s = spawn(5.5, 8.1, 8.5);
    for (let t = 0; t < 3; t += 1 / 60) s = stepPlayer(w, s, { ...idle, ...EAST, jump: s.onGround }, 1 / 60);
    add('sharp 1-block wall: blocked, jump clears', blocked.position[0] < 7.8 && s.position[0] > 9 && !insideSolid(w, s), `blocked x ${f(blocked.position[0])}; jump x ${f(s.position[0])}`);
  }
  // 5. D-3 gate: 1×2 tunnel
  {
    const w = world((x, y, z) => {
      const sol = y >= 8 && y < 14 && x >= 6 && x < 14;
      const dug = (y === 8 || y === 9) && z === 4 && x >= 6 && x < 14;
      if (sol && !dug) return { v: STONE };
      if (y < 8) return { v: STONE };
      return { v: AIR, edited: dug };
    }, params);
    const s = run(w, spawn(3.5, 8.05, 4.5), EAST, 4);
    add('D-3: 1×2 tunnel walk-through', s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
  }
  // 6. D-3 gate: roof 2 above untouched ground at hint phases
  for (const phase of [0, 0.2, 0.45]) {
    const w = world((x, y, z) => {
      if (x >= 6 && x < 14 && z >= 3 && z < 7 && y === 10) return { v: PLANKS, edited: true };
      return hinted(y, 8 + phase);
    }, params);
    const s = run(w, spawn(3.5, 8.2 + phase, 4.5), EAST, 4);
    add(`D-3: roof 2 above ground φ${phase}`, s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
  }
  // 7. D-3 gate: 1-wide gap between a placed wall and a natural one
  {
    const w = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      if (y >= 8 && y < 11 && x >= 6 && x < 14 && z === 3) return { v: STONE };
      if (y >= 8 && y < 11 && x >= 6 && x < 14 && z === 5) return { v: PLANKS, edited: true };
      return { v: AIR };
    }, params);
    const s = run(w, spawn(3.5, 8.05, 4.5), EAST, 4);
    add('D-3: 1-wide gap placed|natural', s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
  }
  // 7b. 1-wide gap between two placed walls, and a 1-wide 2-high doorway in a placed wall
  {
    const w = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      if (y >= 8 && y < 11 && x >= 6 && x < 14 && (z === 3 || z === 5)) return { v: PLANKS, edited: true };
      return { v: AIR };
    }, params);
    const s = run(w, spawn(3.5, 8.05, 4.5), EAST, 4);
    add('1-wide gap placed|placed', s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
  }
  {
    const w = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      if (x === 8 && y >= 8 && y < 12 && z >= 0 && z < 10 && !(z === 4 && (y === 8 || y === 9))) return { v: PLANKS, edited: true };
      return { v: AIR };
    }, params);
    const s = run(w, spawn(3.5, 8.05, 4.5), EAST, 3);
    add('1×2 doorway in a placed wall', s.position[0] > 11 && !insideSolid(w, s), `x ${f(s.position[0])}`);
  }
  // 8. built staircases: walk up (1:1, 1:2, 1:4), and idle drift on them
  for (const n of [1, 2, 4]) {
    const w = world((x, y) => {
      if (y < 8) return { v: STONE };
      const h = x < 6 ? 0 : Math.min(12, Math.floor((x - 6) / n) + 1);
      return y < 8 + h ? { v: STONE, edited: true } : { v: AIR };
    }, params);
    const s = run(w, spawn(3.5, 8.1, 8.5), EAST, 4);
    const climbed = s.position[1] - 8;
    const want = Math.min(12, (s.position[0] - 6) / n) - 1.2;
    add(`built 1:${n} staircase: walks up`, climbed > want && s.position[0] > 12 && !insideSolid(w, s), `x ${f(s.position[0])} y ${f(s.position[1])}`);
    // idle drift at mid-ramp
    const x0 = 6 + 3 * n + 0.5;
    const settled = run(w, spawn(x0, 8 + 4 + 1.5, 8.5), {}, 1.5);
    const after = run(w, settled, {}, 5);
    const drift = Math.hypot(after.position[0] - settled.position[0], after.position[2] - settled.position[2]);
    add(`built 1:${n} staircase: idle drift`, settled.onGround && drift < 1e-3 && !insideSolid(w, after), `drift ${drift.toExponential(1)} onGround ${settled.onGround}`);
  }
  return out;
}
