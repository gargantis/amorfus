// Team gh physics battery: the REAL §9.3 controller and collision
// (controller-repo.mjs, bundled read-only from the repo) against meshes
// from an arbitrary mesh function, served per chunk exactly as the game
// does (chunk-local f32 positions, index data, CSR pick offsets).
//
// Scenarios follow controller.test.ts and the gs battery (work/gs), plus
// hint phases, diagonal approaches, 1:8 and diagonal built ramps, a placed
// floor's standing height, and idle drift everywhere a player can stand.
//
//   battery(meshFn, { apron })  meshFn(region) → raw MeshResult
import { stepPlayer, PLAYER, trianglesInBox, CHUNK, packChunkKey } from './controller-repo.mjs';

const AIR = 0, STONE = 3, PLANKS = 5, SHARP_BRICK = 6 | 256;
const idle = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
const spawn = (x, y, z) => ({ position: [x, y, z], velocity: [0, 0, 0], onGround: false, flying: false });
const EAST = { move: [0, 1], yaw: -Math.PI / 2 }; // forward = +x
const NE = { move: [0, 1], yaw: -Math.PI / 4 }; // forward = (+x, −z)·√½

export class MeshWorld {
  constructor(fn, meshFn, apron) {
    this.fn = fn;
    this.meshFn = meshFn;
    this.apron = apron;
    this.meshes = new Map();
  }
  build(cx0, cy0, cz0, cx1, cy1, cz1) {
    const A = this.apron, n = CHUNK + 2 * A;
    for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const blocks = new Uint16Array(n * n * n), rho = new Float32Array(n * n * n), shapeEdited = new Uint8Array(n * n * n);
      for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const c = this.fn(cx * CHUNK + x - A, cy * CHUNK + y - A, cz * CHUNK + z - A);
        const i = (y * n + z) * n + x;
        blocks[i] = c.v;
        rho[i] = c.rho ?? ((c.v & 0xff) === AIR ? -1 : 1);
        if (c.edited === true) shapeEdited[i] = 1;
      }
      const mesh = this.meshFn({ nx: n, ny: n, nz: n, apron: A, blocks, rho, shapeEdited });
      this.meshes.set(packChunkKey(cx, cy, cz), { mesh, origin: [cx * CHUNK, cy * CHUNK, cz * CHUNK] });
    }
    return this;
  }
  chunkAt(cx, cy, cz) {
    const e = this.meshes.get(packChunkKey(cx, cy, cz));
    if (e === undefined) return null;
    return { origin: e.origin, positions: e.mesh.positions, indexData: e.mesh.indexData, pickRecords: e.mesh.pickRecords, pickOffsets: e.mesh.pickOffsets };
  }
}

function run(w, s0, input, seconds, dt = 1 / 60) {
  let s = s0;
  const full = { ...idle, ...input };
  for (let t = 0; t < seconds; t += dt) s = stepPlayer(w, s, full, dt);
  return s;
}

// capsule-vs-triangle penetration test (same as the gs battery): any capsule
// axis sample closer than r − eps to a triangle and behind its plane
function pointTriDist(px, py, pz, t) {
  const d = (x, y, z) => Math.hypot(px - x, py - y, pz - z);
  const gx = (t.ax + t.bx + t.cx) / 3, gy = (t.ay + t.by + t.cy) / 3, gz = (t.az + t.bz + t.cz) / 3;
  return Math.min(d(t.ax, t.ay, t.az), d(t.bx, t.by, t.bz), d(t.cx, t.cy, t.cz), d(gx, gy, gz));
}
function insideSolid(world, s, eps = 0.05) {
  const [px, py, pz] = s.position;
  const tris = trianglesInBox(world, Math.floor(px) - 2, Math.floor(py) - 1, Math.floor(pz) - 2, Math.floor(px) + 2, Math.floor(py + PLAYER.height) + 1, Math.floor(pz) + 2);
  const a = [px, py + PLAYER.radius, pz], b = [px, py + PLAYER.height - PLAYER.radius, pz];
  for (const tri of tris) {
    for (let i = 0; i <= 4; i++) {
      const qx = a[0] + ((b[0] - a[0]) * i) / 4, qy = a[1] + ((b[1] - a[1]) * i) / 4, qz = a[2] + ((b[2] - a[2]) * i) / 4;
      if (pointTriDist(qx, qy, qz, tri) < PLAYER.radius - eps) {
        const nx = (tri.by - tri.ay) * (tri.cz - tri.az) - (tri.bz - tri.az) * (tri.cy - tri.ay);
        const ny = (tri.bz - tri.az) * (tri.cx - tri.ax) - (tri.bx - tri.ax) * (tri.cz - tri.az);
        const nz = (tri.bx - tri.ax) * (tri.cy - tri.ay) - (tri.by - tri.ay) * (tri.cx - tri.ax);
        if ((qx - tri.ax) * nx + (qy - tri.ay) * ny + (qz - tri.az) * nz < 0) return true;
      }
    }
  }
  return false;
}

const hinted = (y, top) => {
  const d = top - y - 0.5;
  return { v: d > 0 ? STONE : AIR, rho: Math.max(-1, Math.min(1, d / 4)) || 1 / 127 };
};

/** Run the battery. Returns [{ name, pass, detail }]. */
export function battery(meshFn, { apron = 10, only = null } = {}) {
  const out = [];
  const world = (fn) => new MeshWorld(fn, meshFn, apron).build(-1, 0, -1, 1, 0, 1);
  const want = (name) => !only || only.some((o) => name.includes(o));
  const add = (name, pass, detail) => out.push({ name, pass, detail });
  const f = (v) => v.toFixed(2);
  const drift = (w, x0, y0, z0) => {
    const settled = run(w, spawn(x0, y0, z0), {}, 1.5);
    const after = run(w, settled, {}, 5);
    return { settled, after, d: Math.hypot(after.position[0] - settled.position[0], after.position[2] - settled.position[2]) };
  };

  // 1. built 1-block rise (binary ground): walks up, also diagonally
  if (want('1-block rise')) {
    const w = world((x, y) => (y < 8 ? { v: STONE } : y === 8 && x >= 8 ? { v: STONE, edited: true } : { v: AIR }));
    const s = run(w, spawn(4.5, 8.1, 8.5), EAST, 3);
    add('built 1-block rise: walks up', s.position[0] > 10 && s.position[1] > 8.6 && !insideSolid(w, s), `x ${f(s.position[0])} y ${f(s.position[1])}`);
    const sd = run(w, spawn(4.5, 8.1, 12.5), NE, 3);
    add('built 1-block rise, diagonal approach: walks up', sd.position[0] > 9.5 && sd.position[1] > 8.6 && !insideSolid(w, sd), `x ${f(sd.position[0])} y ${f(sd.position[1])}`);
  }
  // 1b. built 1-block rise on hinted ground at phases
  if (want('1-block rise')) for (const phase of [0, 0.25, 0.45]) {
    const w = world((x, y) => (y === 7 && x >= 8 ? { v: STONE, edited: true } : hinted(y, 7 + phase)));
    const s = run(w, spawn(4.5, 7.2 + phase, 8.5), EAST, 3);
    add(`built 1-block rise on hinted ground φ${phase}: walks up`, s.position[0] > 10 && s.position[1] > 7.6 && !insideSolid(w, s), `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 2. 2-block rises: blocked (binary; hinted at phases, sprinting; diagonal)
  if (want('2-block rise')) {
    const w = world((x, y) => (y < 8 ? { v: STONE } : (y === 8 || y === 9) && x >= 8 ? { v: STONE, edited: true } : { v: AIR }));
    const s = run(w, spawn(4.5, 8.1, 8.5), { ...EAST, sprint: true }, 3);
    add('built 2-block rise (sprint): blocked', s.position[0] < 8.0, `x ${f(s.position[0])} y ${f(s.position[1])}`);
    const sd = run(w, spawn(4.5, 8.1, 12.5), { ...NE, sprint: true }, 3);
    add('built 2-block rise, diagonal approach (sprint): blocked', sd.position[0] < 8.0, `x ${f(sd.position[0])} y ${f(sd.position[1])}`);
  }
  if (want('2-block rise')) for (const phase of [0, 0.25, 0.45]) {
    const w = world((x, y) => ((y === 7 || y === 8) && x >= 8 ? { v: STONE, edited: true } : hinted(y, 7 + phase)));
    const s = run(w, spawn(4.5, 7.2 + phase, 8.5), { ...EAST, sprint: true }, 3);
    add(`built 2-block rise on hinted ground φ${phase} (sprint): blocked`, s.position[0] < 8.0, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  if (want('2-block rise')) {
    // a 2-high wall whose plan outline is a 1:2 staircase (diagonal wall)
    const w = world((x, y, z) => (y < 8 ? { v: STONE } : (y === 8 || y === 9) && x >= 8 + Math.floor(z / 2) ? { v: STONE, edited: true } : { v: AIR }));
    const s = run(w, spawn(4.5, 8.1, 4.5), { ...EAST, sprint: true }, 3);
    const s2 = run(w, spawn(4.5, 8.1, 4.5), { ...NE, sprint: true }, 3);
    add('2-high wall with a 1:2 staircase outline (sprint): blocked', s.position[1] < 9.0 && s2.position[1] < 9.0, `east y ${f(s.position[1])}; NE y ${f(s2.position[1])}`);
  }
  // 2d. (extra, not a PLAN invariant) jumping at a 2-block rise: apex 1.27,
  //     so a block world keeps 2-block rises unjumpable; smoothing must too
  if (want('2-block rise')) for (const phase of [null, 0, 0.45]) {
    const w = world((x, y) => (phase === null
      ? (y < 8 ? { v: STONE } : (y === 8 || y === 9) && x >= 8 ? { v: STONE, edited: true } : { v: AIR })
      : ((y === 7 || y === 8) && x >= 8 ? { v: STONE, edited: true } : hinted(y, 7 + phase))));
    const top = phase === null ? 10 : 9;
    let s = spawn(4.5, (phase === null ? 8 : 7 + phase) + 0.1, 8.5);
    for (let t = 0; t < 4; t += 1 / 60) s = stepPlayer(w, s, { ...idle, ...EAST, sprint: true, jump: s.onGround }, 1 / 60);
    add(`2-block rise${phase === null ? '' : ` on hinted φ${phase}`}: sprint-jumping does not get on top (extra)`, s.position[1] < top - 0.5, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 2c. one 1-high step then a 2-high riser (sprint): blocked at the riser
  if (want('2-block rise')) {
    const w = world((x, y) => {
      if (y < 8) return { v: STONE };
      const h = x < 8 ? 0 : x < 10 ? 1 : 3;
      return y < 8 + h ? { v: STONE, edited: true } : { v: AIR };
    });
    const s = run(w, spawn(4.5, 8.1, 8.5), { ...EAST, sprint: true }, 4);
    add('1-step then 2-high riser (sprint): blocked at riser', s.position[0] < 10.0, `x ${f(s.position[0])} y ${f(s.position[1])}`);
  }
  // 3. one-layer pit dug into hinted ground: walks out
  if (want('pit')) {
    const w = world((x, y, z) => (x >= 3 && x < 6 && z >= 3 && z < 6 && y === 7 ? { v: AIR, edited: true } : hinted(y, 8)));
    const s = run(w, spawn(4.5, 7.1, 4.5), EAST, 3);
    add('one-layer pit: walks out', s.position[0] > 7 && s.position[1] > 7.2, `x ${f(s.position[0])} y ${f(s.position[1])}`);
    // a 2-deep pit: cannot walk out (needs a jump... a 2-deep shaft is a trap by design)
    const w2 = world((x, y, z) => (x >= 3 && x < 6 && z >= 3 && z < 6 && (y === 7 || y === 6) ? { v: AIR, edited: true } : hinted(y, 8)));
    const s2 = run(w2, spawn(4.5, 6.1, 4.5), { ...EAST, sprint: true }, 3);
    add('two-layer pit (sprint): cannot walk out', s2.position[0] < 6.5 && s2.position[1] < 7.5, `x ${f(s2.position[0])} y ${f(s2.position[1])}`);
  }
  // 4. sharp 1-block wall: blocked; a jump clears it
  if (want('sharp')) {
    const w = world((x, y) => (y < 8 ? { v: STONE } : y === 8 && x === 8 ? { v: SHARP_BRICK } : { v: AIR }));
    const blocked = run(w, spawn(5.5, 8.1, 8.5), EAST, 2);
    let s = spawn(5.5, 8.1, 8.5);
    for (let t = 0; t < 3; t += 1 / 60) s = stepPlayer(w, s, { ...idle, ...EAST, jump: s.onGround }, 1 / 60);
    add('sharp 1-block wall: blocked, jump clears', blocked.position[0] < 7.8 && s.position[0] > 9 && !insideSolid(w, s), `blocked x ${f(blocked.position[0])}; jump x ${f(s.position[0])}`);
  }
  // 5. D-3: dug 1×2 tunnel (binary rock), and into hinted rock
  if (want('D-3')) {
    const w = world((x, y, z) => {
      const sol = y >= 8 && y < 14 && x >= 6 && x < 14;
      const dug = (y === 8 || y === 9) && z === 4 && x >= 6 && x < 14;
      if (sol && !dug) return { v: STONE };
      if (y < 8) return { v: STONE };
      return { v: AIR, edited: dug };
    });
    const s = run(w, spawn(3.5, 8.05, 4.5), EAST, 4);
    add('D-3: 1×2 tunnel walk-through', s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
    for (const phase of [0, 0.3]) {
      // a hill of hinted rock (top 14 + φ) with a 1×2 tunnel dug at floor 8
      const w2 = world((x, y, z) => {
        const dug = (y === 8 || y === 9) && z === 4 && x >= 6 && x < 14;
        if (dug) return { v: AIR, edited: true };
        if (x >= 6 && x < 14) return hinted(y, 14 + phase);
        return hinted(y, 8);
      });
      const s2 = run(w2, spawn(3.5, 8.05, 4.5), EAST, 4);
      add(`D-3: 1×2 tunnel in hinted rock φ${phase}`, s2.position[0] > 14.5 && !insideSolid(w2, s2), `x ${f(s2.position[0])}`);
    }
  }
  // 6. D-3: roof 2 above untouched hinted ground at phases
  if (want('D-3')) for (const phase of [0, 0.2, 0.45]) {
    const w = world((x, y, z) => (x >= 6 && x < 14 && z >= 3 && z < 7 && y === 10 ? { v: PLANKS, edited: true } : hinted(y, 8 + phase)));
    const s = run(w, spawn(3.5, 8.2 + phase, 4.5), EAST, 4);
    add(`D-3: roof 2 above ground φ${phase}`, s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
  }
  // 7. D-3: 1-wide gaps (placed|natural, placed|placed) and a 1×2 doorway
  if (want('D-3')) {
    const w = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      if (y < 11 && x >= 6 && x < 14 && z === 3) return { v: STONE };
      if (y < 11 && x >= 6 && x < 14 && z === 5) return { v: PLANKS, edited: true };
      return { v: AIR };
    });
    const s = run(w, spawn(3.5, 8.05, 4.5), EAST, 4);
    add('D-3: 1-wide gap placed|natural', s.position[0] > 14.5 && !insideSolid(w, s), `x ${f(s.position[0])}`);
    const w2 = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      if (y < 11 && x >= 6 && x < 14 && (z === 3 || z === 5)) return { v: PLANKS, edited: true };
      return { v: AIR };
    });
    const s2 = run(w2, spawn(3.5, 8.05, 4.5), EAST, 4);
    add('D-3: 1-wide gap placed|placed', s2.position[0] > 14.5 && !insideSolid(w2, s2), `x ${f(s2.position[0])}`);
    const w3 = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      if (x === 8 && y < 12 && z >= 0 && z < 10 && !(z === 4 && (y === 8 || y === 9))) return { v: PLANKS, edited: true };
      return { v: AIR };
    });
    const s3 = run(w3, spawn(3.5, 8.05, 4.5), EAST, 3);
    add('D-3: 1×2 doorway in a placed wall', s3.position[0] > 11 && !insideSolid(w3, s3), `x ${f(s3.position[0])}`);
    // a 1-wide, 2-high corridor dug on a DIAGONAL (1:1 staircase in plan)
    const w4 = world((x, y, z) => {
      const dug = (y === 8 || y === 9) && x >= 4 && x < 16 && (z === x || z === x + 1);
      if (dug) return { v: AIR, edited: true };
      return y < 14 ? { v: STONE } : { v: AIR };
    });
    const s4 = run(w4, spawn(4.6, 8.05, 5.4), { move: [0, 1], yaw: -3 * Math.PI / 4 }, 4);
    add('D-3: diagonal 2-wide (1:1) dug corridor', s4.position[0] > 12 && !insideSolid(w4, s4), `x ${f(s4.position[0])} z ${f(s4.position[2])}`);
  }
  // 8. built staircases / ramps: walk up and idle drift
  if (want('staircase')) for (const n of [1, 2, 4, 8]) {
    const w = world((x, y) => {
      if (y < 8) return { v: STONE };
      const h = x < 6 ? 0 : Math.min(12, Math.floor((x - 6) / n) + 1);
      return y < 8 + h ? { v: STONE, edited: true } : { v: AIR };
    });
    const s = run(w, spawn(3.5, 8.1, 8.5), EAST, n === 8 ? 6 : 4);
    const climbed = s.position[1] - 8;
    const wantH = Math.min(12, (s.position[0] - 6) / n) - 1.2;
    add(`built 1:${n} staircase: walks up`, climbed > wantH && s.position[0] > 12 && !insideSolid(w, s), `x ${f(s.position[0])} y ${f(s.position[1])}`);
    let worst = 0, notGround = 0, inside = 0;
    for (const dx of [0, 0.25, 0.5, 0.75]) {
      const x0 = 6 + 3 * n + 0.13 + dx * n;
      const r = drift(w, x0, 8 + 4 + 1.5, 8.37);
      if (r.d > worst) worst = r.d;
      if (!r.settled.onGround) notGround++;
      if (insideSolid(w, r.after)) inside++;
    }
    add(`built 1:${n} staircase: idle drift (4 spots)`, worst < 1e-3 && notGround === 0 && inside === 0, `max drift ${worst.toExponential(1)} notGround ${notGround} inside ${inside}`);
  }
  if (want('staircase')) {
    // a diagonal built ramp (1:2.8 along the diagonal) as in ramp-diag
    const w = world((x, y, z) => {
      if (y < 8) return { v: STONE };
      const h = Math.min(10, Math.max(0, (x + 0.5 + z + 0.5 - 8) / 4));
      return y + 0.5 < 8 + h ? { v: STONE, edited: true } : { v: AIR };
    });
    let worst = 0, notGround = 0;
    for (const [x0, z0] of [[12.3, 12.6], [14.7, 13.2], [10.1, 16.4]]) {
      const r = drift(w, x0, 16, z0);
      if (r.d > worst) worst = r.d;
      if (!r.settled.onGround) notGround++;
    }
    add('built diagonal ramp: idle drift (3 spots)', worst < 1e-3 && notGround === 0, `max drift ${worst.toExponential(1)} notGround ${notGround}`);
  }
  // 9. placed floor: standing height on a placed 1-high layer far from its
  //    edge (binary ground and hinted ground φ0.45)
  if (want('floor')) {
    for (const phase of [null, 0.45]) {
      const w = world((x, y, z) => {
        if (y === 8 && x >= 4 && x < 20 && z >= 4 && z < 20) return { v: PLANKS, edited: true };
        return phase === null ? (y < 8 ? { v: STONE } : { v: AIR }) : hinted(y, 8 + phase);
      });
      const r = drift(w, 12.3, 10.5, 11.6);
      add(`placed floor${phase === null ? '' : ` on hinted φ${phase}`}: stands at 9.00`, Math.abs(r.after.position[1] - 9) < 0.02 && r.d < 1e-3, `y ${r.after.position[1].toFixed(3)} drift ${r.d.toExponential(1)}`);
    }
  }
  return out;
}

export function printTable(results) {
  // results: [[label, rows]]
  const names = results[0][1].map((r) => r.name);
  const w0 = Math.max(...names.map((n) => n.length)) + 2;
  console.log('test'.padEnd(w0) + results.map(([l]) => l.padEnd(34)).join(''));
  for (let i = 0; i < names.length; i++) console.log(names[i].padEnd(w0) + results.map(([, r]) => `${r[i].pass ? 'PASS' : 'FAIL'} ${r[i].detail}`.padEnd(34)).join(''));
  for (const [l, r] of results) console.log(`${l}: ${r.filter((x) => x.pass).length}/${r.length} pass`);
}
