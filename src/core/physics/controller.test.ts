import { describe, it, expect } from 'vitest';
import { stepPlayer, PLAYER, type PlayerState, type ControllerInput } from './controller';
import { MeshWorld } from './test-world';
import { trianglesInBox, type TriangleSource } from './collision';
import { makeBlock, AIR } from '../world/block';

// §14 physics battery, §9.3 constants. All scenes run through the REAL
// mesher; "hinted ground" uses controlled ρ ramps so every hint phase is
// exact.

const STONE = makeBlock(3, false);
const PLANKS = makeBlock(5, false);
const SHARP_BRICK = makeBlock(6, true);

const idleInput: ControllerInput = {
  move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false,
};

function spawn(x: number, y: number, z: number): PlayerState {
  return { position: [x, y, z], velocity: [0, 0, 0], onGround: false, flying: false };
}

/** Run the controller for `seconds` at 60 Hz with constant input. */
function run(
  world: TriangleSource,
  state: PlayerState,
  input: Partial<ControllerInput>,
  seconds: number,
  dt = 1 / 60,
): PlayerState {
  let s = state;
  const full: ControllerInput = { ...idleInput, ...input };
  for (let t = 0; t < seconds; t += dt) s = stepPlayer(world, s, full, dt);
  return s;
}

/** True when the capsule at `s` penetrates any triangle by more than eps. */
function insideSolid(world: TriangleSource, s: PlayerState, eps = 0.05): boolean {
  const [px, py, pz] = s.position;
  const tris = trianglesInBox(
    world,
    Math.floor(px) - 2, Math.floor(py) - 1, Math.floor(pz) - 2,
    Math.floor(px) + 2, Math.floor(py + PLAYER.height) + 1, Math.floor(pz) + 2,
  );
  const a = [px, py + PLAYER.radius, pz] as const;
  const b = [px, py + PLAYER.height - PLAYER.radius, pz] as const;
  for (const tri of tris) {
    // conservative: sample 5 points along the capsule axis
    for (let i = 0; i <= 4; i++) {
      const qx = a[0] + ((b[0] - a[0]) * i) / 4;
      const qy = a[1] + ((b[1] - a[1]) * i) / 4;
      const qz = a[2] + ((b[2] - a[2]) * i) / 4;
      const d = pointTriDist(qx, qy, qz, tri);
      if (d < PLAYER.radius - eps) {
        // Behind the face (inside the solid) counts; in front is contact.
        const nx = (tri.by - tri.ay) * (tri.cz - tri.az) - (tri.bz - tri.az) * (tri.cy - tri.ay);
        const ny = (tri.bz - tri.az) * (tri.cx - tri.ax) - (tri.bx - tri.ax) * (tri.cz - tri.az);
        const nz = (tri.bx - tri.ax) * (tri.cy - tri.ay) - (tri.by - tri.ay) * (tri.cx - tri.ax);
        const side = (qx - tri.ax) * nx + (qy - tri.ay) * ny + (qz - tri.az) * nz;
        if (side < 0) return true;
      }
    }
  }
  return false;
}

function pointTriDist(px: number, py: number, pz: number, t: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number }): number {
  // crude but adequate: distance to the three vertices and the centroid
  const d2 = (x: number, y: number, z: number): number =>
    Math.hypot(px - x, py - y, pz - z);
  const gx = (t.ax + t.bx + t.cx) / 3;
  const gy = (t.ay + t.by + t.cy) / 3;
  const gz = (t.az + t.bz + t.cz) / 3;
  return Math.min(d2(t.ax, t.ay, t.az), d2(t.bx, t.by, t.bz), d2(t.cx, t.cy, t.cz), d2(gx, gy, gz));
}

// ---- worlds ----

/** Hinted flat ground: surface at y = 8 + phase. */
function hintedGround(phase: number): MeshWorld {
  const w = new MeshWorld((_x, y) => {
    const d = 8 + phase - y - 0.5;
    return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) || 1 / 127 };
  });
  w.build(-1, 0, -1, 1, 0, 1);
  return w;
}

describe('capsule controller (§9.3)', () => {
  it('stands on hinted ground and does not sink', () => {
    const w = hintedGround(0);
    const s = run(w, spawn(4.5, 9.4, 4.5), {}, 1.5);
    expect(s.onGround).toBe(true);
    expect(s.position[1]).toBeGreaterThan(7.2);
    expect(insideSolid(w, s)).toBe(false);
  });

  it('walks up a built smooth 1-block rise', () => {
    const w = new MeshWorld((x, y) => {
      if (y < 8) return { v: STONE };
      if (y === 8 && x >= 8) return { v: STONE, edited: true };
      return { v: AIR };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    const s = run(w, spawn(4.5, 8.1, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 3);
    // yaw −π/2 walks +x; after 3 s at 4.3 b/s it must be on the upper level
    expect(s.position[0]).toBeGreaterThan(10);
    expect(s.position[1]).toBeGreaterThan(8.6);
    expect(insideSolid(w, s)).toBe(false);
  });

  it('walks out of a one-layer pit dug into hinted ground', () => {
    const w = new MeshWorld((x, y, z) => {
      const dug = x >= 3 && x < 6 && z >= 3 && z < 6 && y === 7;
      const d = 8 - y - 0.5;
      if (dug) return { v: AIR, edited: true };
      return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) || 1 / 127 };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    const s = run(w, spawn(4.5, 7.1, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 3);
    expect(s.position[0]).toBeGreaterThan(7);
    expect(s.position[1]).toBeGreaterThan(7.2);
  });

  it('is blocked by a 2-block rise', () => {
    const w = new MeshWorld((x, y) => {
      if (y < 8) return { v: STONE };
      if ((y === 8 || y === 9) && x >= 8) return { v: STONE, edited: true };
      return { v: AIR };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    const s = run(w, spawn(4.5, 8.1, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 3);
    expect(s.position[0]).toBeLessThan(8.0);
  });

  it('is blocked by a sharp 1-block wall, and a jump clears it', () => {
    const w = new MeshWorld((x, y) => {
      if (y < 8) return { v: STONE };
      if (y === 8 && x === 8) return { v: SHARP_BRICK };
      return { v: AIR };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    const blocked = run(w, spawn(5.5, 8.1, 8.5), { move: [0, 1], yaw: -Math.PI / 2 }, 2);
    expect(blocked.position[0]).toBeLessThan(7.8);
    // With jumping it gets over (apex ≈ 1.27 > 1.0).
    let s = spawn(5.5, 8.1, 8.5);
    const input = { ...idleInput, move: [0, 1] as [number, number], yaw: -Math.PI / 2 };
    for (let t = 0; t < 3; t += 1 / 60) {
      s = stepPlayer(w, s, { ...input, jump: s.onGround }, 1 / 60);
    }
    expect(s.position[0]).toBeGreaterThan(9);
    expect(insideSolid(w, s)).toBe(false);
  });

  it('digs a 1×2 tunnel and walks through it (D-3 gate test)', () => {
    const w = new MeshWorld((x, y, z) => {
      const solid = y >= 8 && y < 14 && x >= 6 && x < 14;
      const dug = (y === 8 || y === 9) && z === 4 && x >= 6 && x < 14;
      if (solid && !dug) return { v: STONE };
      if (y < 8) return { v: STONE };
      return { v: AIR, edited: dug };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    const s = run(w, spawn(3.5, 8.05, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4);
    expect(s.position[0]).toBeGreaterThan(14.5); // out the far side
    expect(insideSolid(w, s)).toBe(false);
  });

  it('walks under a roof placed 2 above untouched ground, at several hint phases', () => {
    for (const phase of [0, 0.2, 0.45]) {
      const gy = 7; // topmost solid cell at surface 8 + phase
      const w = new MeshWorld((x, y, z) => {
        if (x >= 6 && x < 14 && z >= 3 && z < 7 && y === gy + 3) {
          return { v: PLANKS, edited: true }; // roof: two air cells below it
        }
        const d = 8 + phase - y - 0.5;
        return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) || 1 / 127 };
      });
      w.build(-1, 0, -1, 1, 0, 1);
      const s = run(w, spawn(3.5, 8.2 + phase, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4);
      expect(s.position[0]).toBeGreaterThan(14.5);
      expect(insideSolid(w, s)).toBe(false);
    }
  });

  it('walks through a 1-wide gap between a placed wall and a natural one', () => {
    const w = new MeshWorld((x, y, z) => {
      if (y < 8) return { v: STONE };
      // natural wall at z=3 (unedited), placed wall at z=5 (edited): gap z=4
      if (y >= 8 && y < 11 && x >= 6 && x < 14 && z === 3) return { v: STONE };
      if (y >= 8 && y < 11 && x >= 6 && x < 14 && z === 5) return { v: PLANKS, edited: true };
      return { v: AIR };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    const s = run(w, spawn(3.5, 8.05, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 4);
    expect(s.position[0]).toBeGreaterThan(14.5);
    expect(insideSolid(w, s)).toBe(false);
  });

  it('sprint-flies into a wall with 100 ms hitches and never ends inside solid', () => {
    const w = new MeshWorld((x, y) => {
      if (y < 8) return { v: STONE };
      if (x >= 20 && x < 22 && y < 30) return { v: STONE };
      return { v: AIR };
    });
    w.build(-1, 0, -1, 1, 0, 1);
    let s: PlayerState = { position: [2.5, 14, 4.5], velocity: [0, 0, 0], onGround: false, flying: true };
    for (let i = 0; i < 30; i++) {
      s = stepPlayer(w, s, { ...idleInput, move: [0, 1], yaw: -Math.PI / 2, sprint: true }, 0.1);
      expect(insideSolid(w, s)).toBe(false);
    }
    expect(s.position[0]).toBeLessThan(20);
  });

  it('a fall at terminal velocity lands', () => {
    const w = hintedGround(0);
    let s: PlayerState = { position: [4.5, 400, 4.5], velocity: [0, -PLAYER.terminal, 0], onGround: false, flying: false };
    for (let t = 0; t < 12 && !s.onGround; t += 1 / 60) {
      s = stepPlayer(w, s, idleInput, 1 / 60);
      expect(s.velocity[1]).toBeGreaterThanOrEqual(-PLAYER.terminal - 1e-6);
    }
    expect(s.onGround).toBe(true);
    expect(insideSolid(w, s)).toBe(false);
  });

  it('collides across chunk borders', () => {
    const w = new MeshWorld((_x, y) => ({ v: y < 32 ? STONE : AIR }));
    w.build(-1, 0, -1, 1, 1, 1); // ground plane at y=32 = a cy border
    const s = run(w, spawn(0.5, 33, 0.5), { move: [1, 1], yaw: Math.PI / 4 }, 2);
    expect(s.onGround).toBe(true);
    expect(s.position[1]).toBeGreaterThan(31.2);
    expect(insideSolid(w, s)).toBe(false);
  });

  it('treats unready chunks as solid (§9.3)', () => {
    const w = new MeshWorld((_x, y) => ({ v: y < 8 ? STONE : AIR }));
    w.build(0, 0, 0, 0, 0, 0); // ONLY chunk (0,0,0) is loaded
    const s = run(w, spawn(29.5, 8.05, 4.5), { move: [0, 1], yaw: -Math.PI / 2 }, 2);
    // chunk (1,0,0) is unready: the border at x=32 must stop the player
    expect(s.position[0]).toBeLessThan(31.8);
  });
});
