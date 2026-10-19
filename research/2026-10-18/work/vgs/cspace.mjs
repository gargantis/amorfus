// VGS: is there ANY capsule path? Configuration-space flood fill of the
// player capsule (r 0.3, h 1.8) at a fixed feet height over a fine plan
// grid, using the exact capsule-triangle distance against the render
// triangles (what collision uses). Also prints the turn-corner vertices.
//   node work/vgs/cspace.mjs <scene> [variants] [feetY] [step]
import { MeshWorld, natural, placed, dug, binary, PLANKS, penetration } from './phys.mjs';

const ROCK = (y) => natural(y, 16);
const tunnel = (isAir, h = 2) => (x, y, z) => (y >= 8 && y < 8 + h && isAir(x, z) ? dug() : ROCK(y));
const SCENES = {
  // L-turn: arm A along x at z = 8 (x 4..16), arm B along z at x = 16 (z 8..27)
  'L-dug': { fn: tunnel((x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28)), start: [8.5, 8.5], goal: [16.5, 20.5], box: [12, 6, 19, 14] },
  'L-dug-3high': { fn: tunnel((x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28), 3), start: [8.5, 8.5], goal: [16.5, 20.5], box: [12, 6, 19, 14] },
  'L-dug-2wide': { fn: tunnel((x, z) => ((z === 8 || z === 9) && x >= 4 && x <= 17) || ((x === 16 || x === 17) && z >= 8 && z < 28)), start: [8.5, 9], goal: [17, 20.5], box: [12, 6, 20, 14] },
  'L-built': {
    fn: (() => {
      const band = (x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28);
      return (x, y, z) => {
        if (y < 8) return binary(y);
        if (y === 10 && x >= 2 && x < 30 && z >= 2 && z < 30) return placed(PLANKS);
        if (y < 10 && !band(x, z)) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (band(x + a, z + b)) return placed(PLANKS); }
        return { v: 0 };
      };
    })(), start: [8.5, 8.5], goal: [16.5, 20.5], box: [12, 6, 19, 14],
  },
  'L-built-open': { // no roof: walls 3 high (a 1-wide maze corridor)
    fn: (() => {
      const band = (x, z) => (z === 8 && x >= 4 && x <= 16) || (x === 16 && z >= 8 && z < 28);
      return (x, y, z) => {
        if (y < 8) return binary(y);
        if (y < 11 && !band(x, z)) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (band(x + a, z + b)) return placed(PLANKS); }
        return { v: 0 };
      };
    })(), start: [8.5, 8.5], goal: [16.5, 20.5], box: [12, 6, 19, 14],
  },
  'straight-dug': { fn: tunnel((x, z) => z === 8 && x >= 4 && x < 28), start: [8.5, 8.5], goal: [24.5, 8.5], box: [6, 6, 27, 11] },
};

const [sceneName = 'L-dug', vs = 'cubes,hints,gs-ctx,gs-mls', feetArg, stepArg] = process.argv.slice(2);
const sc = SCENES[sceneName];
const feet = Number(feetArg ?? 8.06);
const step = Number(stepArg ?? 0.02);
for (const v of vs.split(',')) {
  const w = new MeshWorld(sc.fn, v).build(0, 0, 0);
  // corner vertices of the L (outer corner column at plan (17, 8); inner at (16, 9))
  const m = w.meshes.values().next().value.mesh;
  const pos = m.positions, cor = m.corners;
  const show = (cx, cz) => {
    const out = [];
    for (let i = 0; i < m.vertexCount; i++) if (cor[i * 3] === cx && cor[i * 3 + 2] === cz && cor[i * 3 + 1] >= 8 && cor[i * 3 + 1] <= 10) out.push(`y${cor[i * 3 + 1]}:(${(pos[i * 3] - cx).toFixed(2)},${(pos[i * 3 + 1] - cor[i * 3 + 1]).toFixed(2)},${(pos[i * 3 + 2] - cz).toFixed(2)})`);
    return out.join(' ');
  };
  // flood fill
  const [x0, z0, x1, z1] = sc.box;
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const free = new Uint8Array(nx * nz);
  let nFree = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const p = penetration(w, { position: [x0 + i * step, feet, z0 + j * step] });
    if (p <= 0.005) { free[j * nx + i] = 1; nFree++; }
  }
  const idx = (x, z) => Math.round((z - z0) / step) * nx + Math.round((x - x0) / step);
  const seen = new Uint8Array(nx * nz);
  // start: any free cell on the start arm's line near sc.start (search a small window)
  const q = [];
  const s0 = Math.round((sc.start[1] - z0) / step), i0 = Math.round((sc.start[0] - x0) / step);
  for (let dj = -15; dj <= 15; dj++) { const k = (s0 + dj) * nx + Math.max(0, Math.min(nx - 1, i0)); if (free[k]) { q.push(k); seen[k] = 1; } }
  // clamp start into the box
  while (q.length) {
    const k = q.pop();
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const kk = b * nx + a;
      if (free[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk); }
    }
  }
  // goal reached? any seen cell within 0.5 of the goal (inside box)
  let reached = false, best = Infinity;
  const gx = Math.min(sc.goal[0], x1), gz = Math.min(sc.goal[1], z1);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (seen[j * nx + i]) {
    const d = Math.hypot(x0 + i * step - gx, z0 + j * step - gz);
    if (d < best) best = d;
  }
  reached = best < 0.6;
  // narrowest free width across the corner diagonal, for the record
  console.log(`${sceneName} ${v.padEnd(7)} feet ${feet}: free ${nFree} cells; reachable-from-start closest to goal ${best.toFixed(2)} → ${reached ? 'PATH EXISTS' : 'NO PATH'}`);
  console.log(`   outer corner (17,·,8): ${show(17, 8)}`);
  console.log(`   inner corner (16,·,9): ${show(16, 9)}`);
  if (process.env.MAP) {
    // ascii map of free space around the corner at 0.1 resolution
    const r = Math.round(0.1 / step);
    for (let j = nz - 1; j >= 0; j -= r) {
      let line = (z0 + j * step).toFixed(1).padStart(5) + ' ';
      for (let i = 0; i < nx; i += r) line += seen[j * nx + i] ? 'o' : free[j * nx + i] ? '.' : '#';
      console.log(line);
    }
  }
}
