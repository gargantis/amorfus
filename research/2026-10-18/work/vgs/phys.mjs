// VGS adversarial physics harness: the REPO's real §9.3 controller and
// collision (bundled read-only into physics-real.mjs) against meshes from
// the lib mesher (hints/cubes baselines) or the gs patched mesher.
import * as P from './physics-real.mjs';
import { meshRegion as libMesh } from '../../lib/mesher.mjs';
import { meshRegion as gsMesh } from '../gs/mesher-gs.mjs';
import { params as ctxParams } from '../../approaches/gs-ctx.mjs';
import { params as mlsParams } from '../../approaches/gs-mls.mjs';

export const { stepPlayer, PLAYER } = P;
export const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, PLANKS = 5, BRICK = 6;
export const SHARP = 256;

export const VARIANTS = {
  cubes: { mesh: libMesh, params: { k: 0, forceZeroOffsets: true } },
  hints: { mesh: libMesh, params: {} },
  'gs-ctx': { mesh: gsMesh, params: ctxParams },
  'gs-mls': { mesh: gsMesh, params: mlsParams },
};

export const clampRho = (d) => {
  const q = Math.max(-1, Math.min(1, d / 4));
  return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q;
};
/** natural (hinted) cell for a surface height `top` (continuous). */
export const natural = (y, top, mat = STONE) => {
  const d = top - (y + 0.5);
  return { v: d > 0 ? mat : AIR, rho: clampRho(d) };
};
export const placed = (mat = STONE) => ({ v: mat, edited: true });
export const dug = () => ({ v: AIR, edited: true });
export const binary = (y, top = 8) => ({ v: y < top ? STONE : AIR });

export class MeshWorld {
  constructor(fn, variant, apron = 10) {
    this.fn = fn;
    this.variant = typeof variant === 'string' ? VARIANTS[variant] : variant;
    this.apron = apron;
    this.meshes = new Map();
    this.meshMs = 0;
  }
  build(cx0, cy0, cz0, cx1 = cx0, cy1 = cy0, cz1 = cz0) {
    const A = this.apron;
    const n = 32 + 2 * A;
    for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const blocks = new Uint16Array(n * n * n);
      const rho = new Float32Array(n * n * n);
      const shapeEdited = new Uint8Array(n * n * n);
      for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const c = this.fn(cx * 32 + x - A, cy * 32 + y - A, cz * 32 + z - A);
        const i = (y * n + z) * n + x;
        blocks[i] = c.v;
        rho[i] = c.rho ?? ((c.v & 0xff) === AIR ? -1 : 1);
        if (c.edited) shapeEdited[i] = 1;
      }
      const t0 = performance.now();
      const mesh = this.variant.mesh({ nx: n, ny: n, nz: n, apron: A, blocks, rho, shapeEdited, params: this.variant.params });
      this.meshMs += performance.now() - t0;
      this.meshes.set(P.packChunkKey(cx, cy, cz), { mesh, origin: [cx * 32, cy * 32, cz * 32] });
    }
    return this;
  }
  chunkAt(cx, cy, cz) {
    const e = this.meshes.get(P.packChunkKey(cx, cy, cz));
    if (e === undefined) return null;
    return { origin: e.origin, positions: e.mesh.positions, indexData: e.mesh.indexData, pickRecords: e.mesh.pickRecords, pickOffsets: e.mesh.pickOffsets };
  }
}

// ---- exact capsule-vs-triangle distance (same construction as the controller) ----
function cpPointTri(px, py, pz, t) {
  const abx = t.bx - t.ax, aby = t.by - t.ay, abz = t.bz - t.az;
  const acx = t.cx - t.ax, acy = t.cy - t.ay, acz = t.cz - t.az;
  const apx = px - t.ax, apy = py - t.ay, apz = pz - t.az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [t.ax, t.ay, t.az];
  const bpx = px - t.bx, bpy = py - t.by, bpz = pz - t.bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [t.bx, t.by, t.bz];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [t.ax + abx * v, t.ay + aby * v, t.az + abz * v]; }
  const cpx = px - t.cx, cpy = py - t.cy, cpz = pz - t.cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [t.cx, t.cy, t.cz];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [t.ax + acx * w, t.ay + acy * w, t.az + acz * w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return [t.bx + (t.cx - t.bx) * w, t.by + (t.cy - t.by) * w, t.bz + (t.cz - t.bz) * w]; }
  const den = 1 / (va + vb + vc); const v = vb * den, w = vc * den;
  return [t.ax + abx * v + acx * w, t.ay + aby * v + acy * w, t.az + abz * v + acz * w];
}
/** distance from the vertical segment (px, ay..by, pz) to triangle t, by
 *  dense sampling refined with ternary search (accurate to ~1e-6). */
function segTriDist(px, ay, by, pz, t) {
  const f = (y) => { const c = cpPointTri(px, y, pz, t); return Math.hypot(px - c[0], y - c[1], pz - c[2]); };
  let best = Infinity, bi = 0;
  const N = 24;
  for (let i = 0; i <= N; i++) { const d = f(ay + ((by - ay) * i) / N); if (d < best) { best = d; bi = i; } }
  let lo = ay + ((by - ay) * Math.max(0, bi - 1)) / N, hi = ay + ((by - ay) * Math.min(N, bi + 1)) / N;
  for (let k = 0; k < 40; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  return Math.min(best, f((lo + hi) / 2));
}
/** deepest overlap of the capsule with any triangle (0 = clear). */
export function penetration(world, s) {
  const r = PLAYER.radius;
  const [px, py, pz] = s.position;
  const ay = py + r, by = py + PLAYER.height - r;
  const tris = P.trianglesInBox(world, Math.floor(px - r) - 1, Math.floor(py) - 1, Math.floor(pz - r) - 1, Math.floor(px + r) + 1, Math.floor(py + PLAYER.height) + 1, Math.floor(pz + r) + 1);
  let worst = 0;
  for (const t of tris) {
    const d = segTriDist(px, ay, by, pz, t);
    if (r - d > worst) worst = r - d;
  }
  return worst;
}

export const spawn = (x, y, z) => ({ position: [x, y, z], velocity: [0, 0, 0], onGround: false, flying: false });
const IDLE = { move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false };
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

/** Run at 60 Hz. `input(state, t)` → partial ControllerInput. Returns the
 *  final state plus a log: max penetration, min/max y, path length. */
export function run(world, s0, input, seconds, { dt = 1 / 60, probe = true, onStep } = {}) {
  let s = s0;
  let maxPen = 0, maxPenAt = null, minY = Infinity, maxY = -Infinity;
  for (let t = 0; t < seconds; t += dt) {
    const inp = { ...IDLE, ...(typeof input === 'function' ? input(s, t) : input) };
    s = stepPlayer(world, s, inp, dt);
    if (probe) {
      const p = penetration(world, s);
      if (p > maxPen) { maxPen = p; maxPenAt = s.position.slice(); }
    }
    if (s.position[1] < minY) minY = s.position[1];
    if (s.position[1] > maxY) maxY = s.position[1];
    if (onStep) onStep(s, t);
  }
  return { s, maxPen, maxPenAt, minY, maxY };
}

/** Waypoint follower: walk (or sprint) to each [x, z] in turn. */
export function follow(points, { sprint = false, tol = 0.25, jumpWhenGrounded = false } = {}) {
  let k = 0;
  const f = (s) => {
    while (k < points.length) {
      const [tx, tz] = points[k];
      const dx = tx - s.position[0], dz = tz - s.position[2];
      if (Math.hypot(dx, dz) < tol) { k++; continue; }
      return { move: [0, 1], yaw: yawTo(dx, dz), sprint, jump: jumpWhenGrounded && s.onGround };
    }
    return {};
  };
  f.progress = () => k;
  return f;
}
export const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
