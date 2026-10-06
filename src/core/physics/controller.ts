// §9.3: the capsule controller. Collide-and-slide in substeps of ≤ 0.1
// block (dt clamped to 50 ms), up to 4 contact iterations per substep,
// bounded depenetration, provisional 50° slope limit and 0.6 step-up
// (re-derived from the M3 shapes; a 1-block auto-step is rejected — it
// would defeat sharp walls). Chunks that aren't ready count as solid.
import { CHUNK } from '../world/coords';
import { trianglesInBox, type TriangleSource, type Tri } from './collision';

export const PLAYER = {
  radius: 0.3,
  height: 1.8,
  eye: 1.62,
  walk: 4.3,
  sprint: 5.6,
  fly: 11,
  sprintFly: 22,
  gravity: 32,
  terminal: 50,
  jumpV: 9,
  stepUp: 0.6,
  slopeLimitDeg: 50,
  reach: 5,
} as const;

const SLOPE_NY = Math.cos((PLAYER.slopeLimitDeg * Math.PI) / 180);
const MAX_SUBSTEP = 0.1;
const MAX_DT = 0.05;
const CONTACT_ITERS = 4;
const MAX_PUSH = 0.5; // bounded depenetration per iteration

export interface ControllerInput {
  /** [strafe −1..1, forward −1..1] */
  move: [number, number];
  yaw: number;
  jump: boolean;
  sprint: boolean;
  descend: boolean;
  toggleFly: boolean;
}

export interface PlayerState {
  /** feet position */
  position: [number, number, number];
  velocity: [number, number, number];
  onGround: boolean;
  flying: boolean;
}

interface Contact {
  nx: number;
  ny: number;
  nz: number;
  depth: number;
}

export function stepPlayer(
  source: TriangleSource,
  state: PlayerState,
  input: ControllerInput,
  dtRaw: number,
): PlayerState {
  const dt = Math.min(dtRaw, MAX_DT);
  let [px, py, pz] = state.position;
  let vy = state.velocity[1];
  let vx: number;
  let vz: number;
  const flying = input.toggleFly ? !state.flying : state.flying;
  let onGround = state.onGround;

  // Desired horizontal velocity (§9.2: velocity model, not acceleration).
  const [strafe, forward] = input.move;
  const mlen = Math.hypot(strafe, forward);
  const speed = flying
    ? input.sprint ? PLAYER.sprintFly : PLAYER.fly
    : input.sprint ? PLAYER.sprint : PLAYER.walk;
  if (mlen > 1e-6) {
    const fx = -Math.sin(input.yaw);
    const fz = -Math.cos(input.yaw);
    const sx = Math.cos(input.yaw);
    const sz = -Math.sin(input.yaw);
    vx = ((fx * forward + sx * strafe) / Math.max(1, mlen)) * speed;
    vz = ((fz * forward + sz * strafe) / Math.max(1, mlen)) * speed;
  } else {
    vx = 0;
    vz = 0;
  }
  if (flying) {
    vy = (input.jump ? 1 : 0) * speed - (input.descend ? 1 : 0) * speed;
    onGround = false;
  } else if (input.jump && onGround) {
    vy = PLAYER.jumpV;
    onGround = false;
  }

  const travel = Math.hypot(vx, vy, vz) * dt;
  const nSub = Math.max(1, Math.ceil(travel / MAX_SUBSTEP));
  const subDt = dt / nSub;

  for (let sub = 0; sub < nSub; sub++) {
    if (!flying) {
      vy -= PLAYER.gravity * subDt;
      if (vy < -PLAYER.terminal) vy = -PLAYER.terminal;
    }
    const preX = px;
    const preZ = pz;
    px += vx * subDt;
    py += vy * subDt;
    pz += vz * subDt;

    let grounded = false;
    let steepBlock = false;

    for (let iter = 0; iter < CONTACT_ITERS; iter++) {
      const contact = deepestContact(source, px, py, pz);
      if (contact === null) break;
      const push = Math.min(contact.depth + 1e-4, MAX_PUSH);
      px += contact.nx * push;
      py += contact.ny * push;
      pz += contact.nz * push;
      let { nx, ny, nz } = contact;
      if (Math.abs(ny) < SLOPE_NY) {
        // Steeper than the slope limit: treat as a vertical WALL — slide
        // only against the horizontal normal, so speed never converts
        // into climb (the C-9 residual face must stay unclimbable).
        const hl = Math.hypot(nx, nz) || 1;
        nx /= hl;
        ny = 0;
        nz /= hl;
        steepBlock = true;
      }
      const vn = vx * nx + vy * ny + vz * nz;
      if (vn < 0) {
        vx -= nx * vn;
        vy -= ny * vn;
        vz -= nz * vn;
      }
      if (contact.ny >= SLOPE_NY) grounded = true;
    }

    // Step-up (§9.3): steep contact while grounded → try lifting by up to
    // 0.6 and repeating the horizontal move.
    if (steepBlock && (onGround || grounded) && !flying) {
      const wantDx = vx * subDt;
      const wantDz = vz * subDt;
      for (const lift of [0.2, 0.4, PLAYER.stepUp]) {
        const tryX = preX + wantDx;
        const tryY = py + lift;
        const tryZ = preZ + wantDz;
        if (deepestContact(source, tryX, tryY, tryZ) === null) {
          px = tryX;
          py = tryY;
          pz = tryZ;
          break;
        }
      }
    }
    onGround = grounded || (onGround && Math.abs(vy) < 1e-6 && !flying);
    if (grounded && vy < 0) vy = 0;
  }

  return { position: [px, py, pz], velocity: [vx, vy, vz], onGround, flying };
}

/** The deepest penetration contact of the capsule at feet (px,py,pz). */
function deepestContact(
  source: TriangleSource,
  px: number, py: number, pz: number,
): Contact | null {
  const r = PLAYER.radius;
  const ay = py + r;
  const by = py + PLAYER.height - r;

  let best: Contact | null = null;

  // Unready chunks are solid (§9.3): overlap test against their AABBs.
  const minCx = Math.floor((px - r) / CHUNK);
  const maxCx = Math.floor((px + r) / CHUNK);
  const minCy = Math.floor(py / CHUNK);
  const maxCy = Math.floor((py + PLAYER.height) / CHUNK);
  const minCz = Math.floor((pz - r) / CHUNK);
  const maxCz = Math.floor((pz + r) / CHUNK);
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (cy < -8 || cy > 15) continue; // outside the world: void
        if (source.chunkAt(cx, cy, cz) !== null) continue;
        const c = boxContact(px, ay, by, pz, r, cx * CHUNK, cy * CHUNK, cz * CHUNK);
        if (c !== null && (best === null || c.depth > best.depth)) best = c;
      }
    }
  }

  const x0 = Math.floor(px - r) - 1;
  const x1 = Math.floor(px + r) + 1;
  const y0 = Math.floor(py) - 1;
  const y1 = Math.floor(py + PLAYER.height) + 1;
  const z0 = Math.floor(pz - r) - 1;
  const z1 = Math.floor(pz + r) + 1;
  const tris = trianglesInBox(source, x0, y0, z0, x1, y1, z1);
  for (const tri of tris) {
    const { dist, cx: ccx, cy: ccy, cz: ccz, sx, sy, sz } = segTriClosest(px, ay, by, pz, tri);
    if (dist >= r) continue;
    let nx: number;
    let ny: number;
    let nz: number;
    if (dist > 1e-9) {
      nx = (sx - ccx) / dist;
      ny = (sy - ccy) / dist;
      nz = (sz - ccz) / dist;
    } else {
      const n = triNormal(tri);
      nx = n[0];
      ny = n[1];
      nz = n[2];
    }
    // Contacts must push OUT of the surface: reject normals opposing the
    // triangle's outward face (grazing the back side).
    const fn = triNormal(tri);
    if (nx * fn[0] + ny * fn[1] + nz * fn[2] < 0) {
      nx = fn[0];
      ny = fn[1];
      nz = fn[2];
    }
    const depth = r - dist;
    if (best === null || depth > best.depth) best = { nx, ny, nz, depth };
  }
  return best;
}

function boxContact(
  px: number, ay: number, by: number, pz: number, r: number,
  bx: number, byy: number, bz: number,
): Contact | null {
  // capsule AABB vs chunk AABB, minimal push axis
  const capMinX = px - r;
  const capMaxX = px + r;
  const capMinY = ay - r;
  const capMaxY = by + r;
  const capMinZ = pz - r;
  const capMaxZ = pz + r;
  const oMinX = Math.max(capMinX, bx);
  const oMaxX = Math.min(capMaxX, bx + CHUNK);
  const oMinY = Math.max(capMinY, byy);
  const oMaxY = Math.min(capMaxY, byy + CHUNK);
  const oMinZ = Math.max(capMinZ, bz);
  const oMaxZ = Math.min(capMaxZ, bz + CHUNK);
  if (oMinX >= oMaxX || oMinY >= oMaxY || oMinZ >= oMaxZ) return null;
  const ox = oMaxX - oMinX;
  const oy = oMaxY - oMinY;
  const oz = oMaxZ - oMinZ;
  if (ox <= oy && ox <= oz) {
    const dir = px < bx + CHUNK / 2 ? -1 : 1;
    return { nx: dir, ny: 0, nz: 0, depth: ox };
  }
  if (oy <= oz) {
    const dir = (ay + by) / 2 < byy + CHUNK / 2 ? -1 : 1;
    return { nx: 0, ny: dir, nz: 0, depth: oy };
  }
  const dir = pz < bz + CHUNK / 2 ? -1 : 1;
  return { nx: 0, ny: 0, nz: dir, depth: oz };
}

function triNormal(t: Tri): [number, number, number] {
  const nx = (t.by - t.ay) * (t.cz - t.az) - (t.bz - t.az) * (t.cy - t.ay);
  const ny = (t.bz - t.az) * (t.cx - t.ax) - (t.bx - t.ax) * (t.cz - t.az);
  const nz = (t.bx - t.ax) * (t.cy - t.ay) - (t.by - t.ay) * (t.cx - t.ax);
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

interface ClosestResult {
  dist: number;
  sx: number; // closest point on segment
  sy: number;
  sz: number;
  cx: number; // closest point on triangle
  cy: number;
  cz: number;
}

/** Closest points between the capsule's vertical axis segment and a
 *  triangle (Ericson-style: vertex regions, edge pairs, interior). */
function segTriClosest(px: number, ay: number, by: number, pz: number, t: Tri): ClosestResult {
  let best: ClosestResult = { dist: Infinity, sx: 0, sy: 0, sz: 0, cx: 0, cy: 0, cz: 0 };

  const consider = (sxp: number, syp: number, szp: number, cxp: number, cyp: number, czp: number): void => {
    const d = Math.hypot(sxp - cxp, syp - cyp, szp - czp);
    if (d < best.dist) best = { dist: d, sx: sxp, sy: syp, sz: szp, cx: cxp, cy: cyp, cz: czp };
  };

  // Segment endpoints vs triangle.
  for (const sy of [ay, by]) {
    const [cx, cy, cz] = closestPtPointTriangle(px, sy, pz, t);
    consider(px, sy, pz, cx, cy, cz);
  }
  // Segment vs each triangle edge.
  const edges: Array<[number, number, number, number, number, number]> = [
    [t.ax, t.ay, t.az, t.bx, t.by, t.bz],
    [t.bx, t.by, t.bz, t.cx, t.cy, t.cz],
    [t.cx, t.cy, t.cz, t.ax, t.ay, t.az],
  ];
  for (const [ex0, ey0, ez0, ex1, ey1, ez1] of edges) {
    const [s, q] = closestPtSegmentSegment(px, ay, pz, px, by, pz, ex0, ey0, ez0, ex1, ey1, ez1);
    consider(s[0], s[1], s[2], q[0], q[1], q[2]);
  }
  // Segment crossing the triangle plane inside → true distance may be 0.
  const n = triNormal(t);
  const da = (px - t.ax) * n[0] + (ay - t.ay) * n[1] + (pz - t.az) * n[2];
  const db = (px - t.ax) * n[0] + (by - t.ay) * n[1] + (pz - t.az) * n[2];
  if (da * db < 0) {
    const f = da / (da - db);
    const iy = ay + (by - ay) * f;
    const [cx, cy, cz] = closestPtPointTriangle(px, iy, pz, t);
    consider(px, iy, pz, cx, cy, cz);
  }
  return best;
}

function closestPtPointTriangle(px: number, py: number, pz: number, t: Tri): [number, number, number] {
  const abx = t.bx - t.ax;
  const aby = t.by - t.ay;
  const abz = t.bz - t.az;
  const acx = t.cx - t.ax;
  const acy = t.cy - t.ay;
  const acz = t.cz - t.az;
  const apx = px - t.ax;
  const apy = py - t.ay;
  const apz = pz - t.az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [t.ax, t.ay, t.az];
  const bpx = px - t.bx;
  const bpy = py - t.by;
  const bpz = pz - t.bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [t.bx, t.by, t.bz];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [t.ax + abx * v, t.ay + aby * v, t.az + abz * v];
  }
  const cpx = px - t.cx;
  const cpy = py - t.cy;
  const cpz = pz - t.cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [t.cx, t.cy, t.cz];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [t.ax + acx * w, t.ay + acy * w, t.az + acz * w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [t.bx + (t.cx - t.bx) * w, t.by + (t.cy - t.by) * w, t.bz + (t.cz - t.bz) * w];
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return [t.ax + abx * v + acx * w, t.ay + aby * v + acy * w, t.az + abz * v + acz * w];
}

function closestPtSegmentSegment(
  p1x: number, p1y: number, p1z: number,
  q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number,
  q2x: number, q2y: number, q2z: number,
): [[number, number, number], [number, number, number]] {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number;
  let tt: number;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    tt = 0;
  } else if (a <= 1e-12) {
    s = 0;
    tt = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) {
      tt = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      tt = (b * s + f) / e;
      if (tt < 0) {
        tt = 0;
        s = clamp01(-c / a);
      } else if (tt > 1) {
        tt = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return [
    [p1x + d1x * s, p1y + d1y * s, p1z + d1z * s],
    [p2x + d2x * tt, p2y + d2y * tt, p2z + d2z * tt],
  ];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
