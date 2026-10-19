// Test scenes. Every scene RASTERISES a known smooth shape into blocks
// (a block takes the shape's value at its centre), so each approach can be
// measured against the shape the blocks came from. Scene coordinates are
// chunk-local for the chunk at [0,32)³; block (x,y,z) spans [x,x+1)×….
import { AIR, GRASS, DIRT, STONE, SAND, PLANKS, BRICK, SHARP_BIT } from './core.mjs';

export const clampRho = (d) => {
  const q = Math.max(-1, Math.min(1, d / 4));
  return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q;
};
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- materials
// Flat generated (hinted) ground with its top at y = 8. The top layer
// (y = 7) carries the plan material; 3 dirt below it, then stone — the
// generator's layering, so 3-D kernels meet real neighbours.
export const GROUND = 8;
function flatGround(plan) {
  return (x, y, z) => {
    const d = GROUND - (y + 0.5);
    if (d <= 0) return { v: AIR, rho: clampRho(d) };
    const depth = GROUND - 1 - y;
    return { v: depth === 0 ? plan(x, z) : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
  };
}
const P0 = [16.13, 16.37];
const halfPlane = (thetaDeg, feature = STONE, bg = GRASS, p0 = P0) => {
  const t = thetaDeg * DEG;
  const n = [-Math.sin(t), Math.cos(t)];
  return (x, z) => ((x + 0.5 - p0[0]) * n[0] + (z + 0.5 - p0[1]) * n[1] > 0 ? feature : bg);
};
const MAT_CAMERA = { eye: [16, GROUND + 17, 16 + 21], target: [16, GROUND, 15] };
const WIN = [4, 4, 28, 28];

function edgeScene(label, thetaDeg) {
  const plan = halfPlane(thetaDeg);
  return {
    name: `edge-${label}`, kind: 'material', group: 'straight edges',
    plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA,
    ideals: [{ label: `grass|stone ${label}`, pair: [GRASS, STONE], kind: 'line', p0: P0, theta: thetaDeg * DEG, window: [6, 6, 26, 26] }],
  };
}
function discScene(r) {
  const c = P0;
  const plan = (x, z) => (Math.hypot(x + 0.5 - c[0], z + 0.5 - c[1]) < r ? STONE : GRASS);
  return {
    name: `disc-r${r}`, kind: 'material', group: 'curves',
    plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA,
    ideals: [{ label: `disc r=${r}`, pair: [GRASS, STONE], kind: 'disc', c, r }],
  };
}
/** One-cell-per-column line (Bresenham, nearest centre), slope s ≤ 1. The
 *  ideal centre line is refitted through the chosen blocks' centres (the
 *  generating line can sit up to ~0.2 off them, which is rasterisation
 *  phase, not something an approach could recover). */
function thinLine(label, s, c0, xa = 3, xb = 29) {
  const pick = (x) => Math.round(s * (x + 0.5) + c0 - 0.5);
  let off = 0, n = 0;
  for (let x = xa; x < xb; x++) { off += pick(x) + 0.5 - (s * (x + 0.5) + c0); n++; }
  const c = c0 + off / n;
  const plan = (x, z) => (x >= xa && x < xb && z === pick(x) ? STONE : GRASS);
  const theta = Math.atan(s);
  return {
    name: `line1-${label}`, kind: 'material', group: 'thin lines',
    plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA,
    ideals: [{ label: `1-wide ${label}`, pair: [GRASS, STONE], kind: 'band', p0: [0, c], theta, hw: Math.cos(theta) / 2, window: [6, 6, 26, 26] }],
    band: { p0: [0, c], theta, hw: Math.cos(theta) / 2, xRange: [6, 26] },
  };
}

export const MATERIAL_SCENES = [
  edgeScene('0deg', 0),
  edgeScene('1:8', Math.atan(1 / 8) / DEG),
  edgeScene('1:5', Math.atan(1 / 5) / DEG),
  edgeScene('1:3', Math.atan(1 / 3) / DEG),
  edgeScene('1:2', Math.atan(1 / 2) / DEG),
  edgeScene('2:3', Math.atan(2 / 3) / DEG),
  edgeScene('1:1', 45),
  discScene(2.4),
  discScene(4.3),
  discScene(7.6),
  thinLine('0deg', 0, 16.5),
  thinLine('1:1', 1, 0),
  thinLine('1:2', 0.5, 8.3),
  (() => {
    // two cells per column on a 45° diagonal: a 2-wide band
    const plan = (x, z) => (x >= 3 && x < 29 && (x - z === 0 || x - z === 1) ? STONE : GRASS);
    const theta = 45 * DEG;
    return {
      name: 'line2-1:1', kind: 'material', group: 'thin lines',
      plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA,
      ideals: [{ label: '2-wide 1:1', pair: [GRASS, STONE], kind: 'band', p0: [0.5, 0], theta, hw: Math.cos(theta), window: [6, 6, 26, 26] }],
      band: { p0: [0.5, 0], theta, hw: Math.cos(theta), xRange: [6, 26] },
    };
  })(),
  (() => {
    const plan = (x, z) => (x >= 13 && x < 19 && z >= 13 && z < 19 ? STONE : GRASS);
    return {
      name: 'square-6', kind: 'material', group: 'corners',
      plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA,
      ideals: [{ label: 'square 6×6', pair: [GRASS, STONE], kind: 'rect', lo: [13, 13], hi: [19, 19] }],
    };
  })(),
  (() => {
    const plan = (x, z) => (x === 16 && z === 16 ? STONE : GRASS);
    return { name: 'single', kind: 'material', group: 'misc', plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA, ideals: [] };
  })(),
  (() => {
    const plan = (x, z) => (x >= 13 && x < 19 && z >= 13 && z < 19 && (x + z) % 2 === 1 ? STONE : GRASS);
    return { name: 'checker', kind: 'material', group: 'misc', plan, cell: flatGround(plan), feature: STONE, window: WIN, camera: MAT_CAMERA, ideals: [] };
  })(),
  (() => {
    // three materials meeting at P0: stone in [−30°, 90°), sand in
    // [90°, 210°), grass elsewhere; rays measured beyond 3 blocks out
    const c = P0;
    const plan = (x, z) => {
      let a = Math.atan2(z + 0.5 - c[1], x + 0.5 - c[0]) / DEG;
      if (a < -30) a += 360;
      return a < 90 ? STONE : a < 210 ? SAND : GRASS;
    };
    const ray = (label, pair, deg) => ({ label, pair, kind: 'line', p0: c, theta: deg * DEG, ray: { c, dir: deg * DEG, min: 3 }, window: [5, 5, 27, 27] });
    return {
      name: 'junction3', kind: 'material', group: 'junctions',
      plan, cell: flatGround(plan), feature: SAND, window: WIN, camera: MAT_CAMERA,
      ideals: [ray('stone|sand 90°', [STONE, SAND], 90), ray('sand|grass 210°', [SAND, GRASS], 210), ray('grass|stone 330°', [GRASS, STONE], 330)],
    };
  })(),
];

// Materials on a generated (hinted) hill: a stone disc and a 1:2 sand edge.
const hillH = (x, z) => 9 + 5 * Math.exp(-((x - 16) ** 2 + (z - 16) ** 2) / (2 * 5.5 ** 2));
const hillPlan = (x, z) => {
  if (Math.hypot(x + 0.5 - 12.6, z + 0.5 - 14.2) < 4.1) return STONE;
  if (z + 0.5 > 0.5 * (x + 0.5) + 19.2) return SAND;
  return GRASS;
};
const hillCell = (withMaterials) => (x, y, z) => {
  const d = hillH(x + 0.5, z + 0.5) - (y + 0.5);
  if (d <= 0) return { v: AIR, rho: clampRho(d) };
  const depth = Math.floor(d);
  const top = withMaterials ? hillPlan(x, z) : GRASS;
  return { v: depth <= 1 ? top : depth <= 4 ? DIRT : STONE, rho: clampRho(d) };
};
MATERIAL_SCENES.push({
  name: 'hill-materials', kind: 'material', group: 'curved surface',
  plan: hillPlan, cell: hillCell(true), feature: STONE, window: WIN,
  camera: { eye: [16, 26, 38], target: [15, 10, 15] },
  ideals: [
    { label: 'stone disc on hill', pair: [GRASS, STONE], kind: 'disc', c: [12.6, 14.2], r: 4.1 },
    { label: 'sand 1:2 edge on hill', pair: [GRASS, SAND], kind: 'line', p0: [0, 19.2], theta: Math.atan(0.5), window: [6, 6, 27, 30] },
  ],
});

// ---------------------------------------------------------------- geometry
// Built shapes (placed blocks: shape-edited, binary) standing on flat
// generated ground whose top is at y = BASE.
export const BASE = 6;
function hintedFlat(top) {
  return (x, y, z) => {
    const d = top - (y + 0.5);
    if (d <= 0) return { v: AIR, rho: clampRho(d) };
    const depth = top - 1 - y;
    return { v: depth === 0 ? GRASS : depth <= 3 ? DIRT : STONE, rho: clampRho(d) };
  };
}
const ground = hintedFlat(BASE);
const built = (inside, v = STONE) => (x, y, z) => (y >= BASE && inside(x, y, z) ? { v, edited: true } : ground(x, y, z));

function rampScene(n) {
  const L = Math.min(24, 12 * n);
  const h = (x) => BASE + Math.min(L, Math.max(0, x - 4)) / n;
  const t = Math.atan(1 / n);
  const inWin = (p) => p[0] > 6.5 && p[0] < 4 + L - 2.5 && p[2] > 8 && p[2] < 24 && p[1] > BASE + 0.4;
  return {
    name: `ramp-1:${n}`, kind: 'geometry', group: 'built slopes',
    cell: built((x, y, z) => x >= 4 && z >= 4 && z < 28 && y + 0.5 < h(x + 0.5)),
    camera: { eye: [33, BASE + 13, 40], target: [15, BASE + 3, 15] },
    ideal: {
      sdf: (p) => (p[1] - h(p[0])) * Math.cos(t),
      normal: () => [-Math.sin(t), Math.cos(t), 0],
      inWindow: inWin,
    },
  };
}
export const GEOMETRY_SCENES = [
  rampScene(1), rampScene(2), rampScene(4), rampScene(8),
  (() => {
    const h = (x, z) => BASE + Math.min(10, Math.max(0, (x + z - 8) / 4));
    const g = [0.25, 1, 0.25];
    const gl = Math.hypot(...g);
    return {
      name: 'ramp-diag-1:2.8', kind: 'geometry', group: 'built slopes',
      cell: built((x, y, z) => x >= 4 && x < 28 && z >= 4 && z < 28 && y + 0.5 < h(x + 0.5, z + 0.5)),
      camera: { eye: [36, BASE + 16, 36], target: [15, BASE + 4, 15] },
      ideal: {
        sdf: (p) => (p[1] - h(p[0], p[2])) / gl,
        normal: () => [-0.25 / gl, 1 / gl, -0.25 / gl],
        inWindow: (p) => p[0] > 7 && p[0] < 25 && p[2] > 7 && p[2] < 25 && p[1] > BASE + 1.2 && p[1] < BASE + 8.8,
      },
    };
  })(),
  (() => {
    const C = [16.2, BASE, 15.9], r = 6.4;
    return {
      name: 'mound-r6.4', kind: 'geometry', group: 'built curves',
      cell: built((x, y, z) => Math.hypot(x + 0.5 - C[0], y + 0.5 - C[1], z + 0.5 - C[2]) < r),
      camera: { eye: [30, BASE + 11, 34], target: [16, BASE + 2, 16] },
      ideal: {
        sdf: (p) => Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) - r,
        normal: (p) => { const d = [p[0] - C[0], p[1] - C[1], p[2] - C[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); },
        inWindow: (p) => p[1] > BASE + 1 && Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) < r + 1.5,
      },
    };
  })(),
  (() => {
    const top = 10, C = [16.2, top, 15.9], r = 5.4;
    const g = hintedFlat(top);
    return {
      name: 'pit-r5.4', kind: 'geometry', group: 'built curves',
      cell: (x, y, z) => (y < top && Math.hypot(x + 0.5 - C[0], y + 0.5 - C[1], z + 0.5 - C[2]) < r ? { v: AIR, edited: true } : g(x, y, z)),
      camera: { eye: [27, top + 13, 30], target: [16, top - 3, 16] },
      ideal: {
        sdf: (p) => r - Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]),
        normal: (p) => { const d = [C[0] - p[0], C[1] - p[1], C[2] - p[2]]; const l = Math.hypot(...d); return d.map((v) => v / l); },
        inWindow: (p) => p[1] < top - 1 && Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) > r - 1.5,
      },
    };
  })(),
  (() => {
    const C = [16.2, 15.9], r = 6.3;
    return {
      name: 'terrace-disc', kind: 'geometry', group: 'built outlines',
      cell: built((x, y, z) => y === BASE && Math.hypot(x + 0.5 - C[0], z + 0.5 - C[1]) < r),
      camera: { eye: [16, BASE + 16, 33], target: [16, BASE, 16] },
      ideal: { outline: { y: BASE + 0.5, kind: 'disc', c: C, r, window: [4, 4, 28, 28] } },
    };
  })(),
  (() => {
    const t = Math.atan(0.5);
    const n = [-Math.sin(t), Math.cos(t)];
    return {
      name: 'terrace-1:2', kind: 'geometry', group: 'built outlines',
      cell: built((x, y, z) => y === BASE && (x + 0.5 - P0[0]) * n[0] + (z + 0.5 - P0[1]) * n[1] < 0),
      camera: { eye: [16, BASE + 16, 33], target: [16, BASE, 16] },
      ideal: { outline: { y: BASE + 0.5, kind: 'line', p0: P0, theta: t, window: [6, 6, 26, 26] } },
    };
  })(),
  (() => {
    const C = [16.2, 15.9], r = 4.6;
    return {
      name: 'tower-r4.6', kind: 'geometry', group: 'built outlines',
      cell: built((x, y, z) => y < BASE + 6 && Math.hypot(x + 0.5 - C[0], z + 0.5 - C[1]) < r),
      camera: { eye: [31, BASE + 10, 33], target: [16, BASE + 3, 16] },
      ideal: { outline: { y: BASE + 3, kind: 'disc', c: C, r, window: [4, 4, 28, 28] } },
    };
  })(),
  (() => {
    // control: a generated (hinted) 1:4 slope — smooth under the hints rule
    const h = (x) => BASE + Math.min(24, Math.max(0, x - 4)) / 4;
    const t = Math.atan(0.25);
    return {
      name: 'hinted-slope-1:4', kind: 'geometry', group: 'generated (control)',
      cell: (x, y, z) => {
        const d = h(x + 0.5) - (y + 0.5);
        if (d <= 0) return { v: AIR, rho: clampRho(d) };
        return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) };
      },
      camera: { eye: [33, BASE + 13, 40], target: [15, BASE + 3, 15] },
      ideal: {
        sdf: (p) => (p[1] - h(p[0])) * Math.cos(t),
        normal: () => [-Math.sin(t), Math.cos(t), 0],
        inWindow: (p) => p[0] > 6.5 && p[0] < 25.5 && p[2] > 8 && p[2] < 24,
      },
    };
  })(),
  {
    name: 'hinted-hill', kind: 'geometry', group: 'generated (control)',
    cell: hillCell(false),
    camera: { eye: [16, 26, 38], target: [15, 10, 15] },
    ideal: {
      sdf: (p) => {
        // vertical distance scaled by the gradient (first-order distance)
        const e = 1e-3;
        const gx = (hillH(p[0] + e, p[2]) - hillH(p[0] - e, p[2])) / (2 * e);
        const gz = (hillH(p[0], p[2] + e) - hillH(p[0], p[2] - e)) / (2 * e);
        return (p[1] - hillH(p[0], p[2])) / Math.hypot(gx, 1, gz);
      },
      normal: (p) => {
        const e = 1e-3;
        const gx = (hillH(p[0] + e, p[2]) - hillH(p[0] - e, p[2])) / (2 * e);
        const gz = (hillH(p[0], p[2] + e) - hillH(p[0], p[2] - e)) / (2 * e);
        const l = Math.hypot(gx, 1, gz);
        return [-gx / l, 1 / l, -gz / l];
      },
      inWindow: (p) => p[0] > 6 && p[0] < 26 && p[2] > 6 && p[2] < 26,
    },
  },
];

// ---------------------------------------------------------------- constraints
// The §14 / D-3 invariants a geometry rule must keep.
export const CONSTRAINT_SCENES = [
  {
    name: 'floating-block', kind: 'constraint', camera: { eye: [20, 19, 21], target: [16.5, 16.5, 16.5] },
    cell: (x, y, z) => (x === 16 && y === 16 && z === 16 ? { v: STONE, edited: true } : { v: AIR }),
    check: 'floating', want: 'min extent ≥ 0.40',
  },
  {
    name: 'pillar', kind: 'constraint', camera: { eye: [22, BASE + 5, 24], target: [16.5, BASE + 3, 16.5] },
    cell: built((x, y, z) => x === 16 && z === 16 && y < BASE + 6),
    check: 'pillar', want: 'width ≥ 0.40',
  },
  {
    name: 'tunnel-1x2', kind: 'constraint', camera: { eye: [16.5, 9, 31], target: [16.5, 9, 16] },
    cell: (x, y, z) => {
      const dug = x === 16 && (y === 8 || y === 9) && z >= 4 && z < 28;
      return y < 12 && !dug ? { v: STONE } : { v: AIR, edited: dug };
    },
    check: 'tunnel', want: 'width ≥ 0.70, height ≥ 1.90',
  },
  {
    name: 'roof-2-high', kind: 'constraint', camera: { eye: [16, BASE + 4, 30], target: [16, BASE + 1, 16] },
    cell: (x, y, z) => {
      if (y === BASE + 2 && x >= 10 && x < 22 && z >= 10 && z < 22) return { v: PLANKS, edited: true };
      const d = BASE + 0.45 - (y + 0.5); // generated ground 0.45 above its grid plane (C-9)
      if (d <= 0) return { v: AIR, rho: clampRho(d) };
      return { v: GRASS, rho: clampRho(d) };
    },
    check: 'roof', want: 'gap ≥ 1.90 everywhere under the roof',
  },
  {
    name: 'sharp-wall', kind: 'constraint', camera: { eye: [26, BASE + 6, 28], target: [16.5, BASE + 2, 16] },
    cell: (x, y, z) => (y >= BASE && y < BASE + 4 && x === 16 && z >= 10 && z < 22 ? { v: BRICK | SHARP_BIT } : ground(x, y, z)),
    check: 'sharp', want: 'every sharp vertex on its integer plane',
  },
];

export const ALL_SCENES = [...MATERIAL_SCENES, ...GEOMETRY_SCENES, ...CONSTRAINT_SCENES];
