// Block configurations for the bubble study. Blocks are [x, y, z, material]
// (y up). Bubble-scene materials: A = 6 (red), B = 7 (blue), C = 1 (green),
// D = 4 (sand); terrain-like scenes use grass 1 / dirt 2 / stone 3.
// Flat configurations lie in the x–z plane (y = 0), so the default view
// looks down on them at an angle and `slice: {axis: 1, at: 0.5}` is a plan.
export const A = 6, B = 7, C = 1, D = 4, GRASS = 1, DIRT = 2, STONE = 3;

const plan = (rows, y = 0) => {
  // rows: strings, one per z; chars: A B C D = materials, '.' = air
  const M = { A, B, C, D, G: GRASS, R: DIRT, S: STONE };
  const out = [];
  rows.forEach((row, z) => [...row].forEach((ch, x) => { if (M[ch]) out.push([x, y, z, M[ch]]); }));
  return out;
};
const box = (x0, y0, z0, x1, y1, z1, m) => {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, y, z, m]);
  return out;
};
const ball = (r, mf) => {
  const out = [];
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
    if (x * x + y * y + z * z <= r * r) out.push([x, y, z, mf(x, y, z)]);
  }
  return out;
};

const PLAN = { axis: 1, at: 0.5 };

export const CONFIGS = [
  // ---- singles and pairs ----
  { name: 'single', desc: 'one block', blocks: [[0, 0, 0, A]], slice: PLAN },
  { name: 'pair-same', desc: 'two blocks, same material', blocks: plan(['AA']), slice: PLAN },
  { name: 'pair-diff', desc: 'two blocks, different materials (double bubble)', blocks: plan(['AB']), slice: PLAN },
  { name: 'line3-same', desc: 'row of three, same', blocks: plan(['AAA']), slice: PLAN },
  { name: 'line3-ABA', desc: 'row A B A', blocks: plan(['ABA']), slice: PLAN },
  { name: 'line3-ABC', desc: 'row A B C', blocks: plan(['ABC']), slice: PLAN },
  // ---- 2×2 layer: every partition type of four face-touching blocks ----
  { name: 'L3-same', desc: 'L tromino, same', blocks: plan(['AA', 'A.']), slice: PLAN },
  { name: 'L3-AAB', desc: 'L tromino, two A one B', blocks: plan(['AA', 'B.']), slice: PLAN },
  { name: 'L3-ABC', desc: 'L tromino, three materials (triple line + air)', blocks: plan(['AB', 'C.']), slice: PLAN },
  { name: 'sq2-same', desc: '2×2 square, same', blocks: plan(['AA', 'AA']), slice: PLAN },
  { name: 'sq2-AAAB', desc: '2×2, three A one B', blocks: plan(['AA', 'AB']), slice: PLAN },
  { name: 'sq2-AABB', desc: '2×2, halves', blocks: plan(['AA', 'BB']), slice: PLAN },
  { name: 'sq2-checker', desc: '2×2 checkerboard (diagonal pairs same: ambiguous edge)', blocks: plan(['AB', 'BA']), slice: PLAN },
  { name: 'sq2-AABC', desc: '2×2, A A / B C', blocks: plan(['AA', 'BC']), slice: PLAN },
  { name: 'sq2-ABCD', desc: '2×2, four materials (four films meet at an edge)', blocks: plan(['AB', 'CD']), slice: PLAN },
  // ---- diagonal contacts ----
  { name: 'diag-edge', desc: 'same material touching along an edge only', blocks: plan(['A.', '.A']), slice: PLAN },
  { name: 'diag-corner', desc: 'same material touching at a corner only', blocks: [[0, 0, 0, A], [1, 1, 1, A]] },
  { name: 'diag-edge-diff', desc: 'different materials touching along an edge only', blocks: plan(['A.', '.B']), slice: PLAN },
  // ---- 3D cubes ----
  { name: 'cube2-same', desc: '2×2×2, same', blocks: box(0, 0, 0, 1, 1, 1, A) },
  { name: 'cube2-oneB', desc: '2×2×2, seven A one B', blocks: box(0, 0, 0, 1, 1, 1, A).map((b) => (b[0] + b[1] + b[2] === 3 ? [...b.slice(0, 3), B] : b)) },
  { name: 'cube2-halves', desc: '2×2×2, A half and B half', blocks: box(0, 0, 0, 1, 1, 1, A).map((b) => (b[0] === 1 ? [...b.slice(0, 3), B] : b)), slice: { axis: 2, at: 0.5 } },
  { name: 'cube2-checker', desc: '2×2×2 3D checkerboard', blocks: box(0, 0, 0, 1, 1, 1, A).map((b) => ((b[0] + b[1] + b[2]) % 2 ? [...b.slice(0, 3), B] : b)), slice: { axis: 1, at: 0.5 } },
  { name: 'cube2-octants', desc: '2×2×2, four materials, two layers', blocks: [...plan(['AB', 'CD'], 0), ...plan(['CD', 'AB'], 1)], slice: { axis: 1, at: 0.5 } },
  // ---- shapes ----
  { name: 'plus5', desc: 'plus of five, same', blocks: plan(['.A.', 'AAA', '.A.']), slice: PLAN },
  { name: 'plus5-mixed', desc: 'plus: B centre, A arms', blocks: plan(['.A.', 'ABA', '.A.']), slice: PLAN },
  { name: 'ring8', desc: '3×3 ring, same (a torus?)', blocks: plan(['AAA', 'A.A', 'AAA']), slice: PLAN },
  { name: 'T-mixed', desc: 'T: A bar, B stem', blocks: plan(['AAA', '.B.', '.B.']), slice: PLAN },
  { name: 'pillar3', desc: '1×1×3 column', blocks: box(0, 0, 0, 0, 2, 0, A), slice: { axis: 2, at: 0.5 } },
  { name: 'stairs', desc: 'built 1:1 stair, 3 steps, 2 deep', blocks: [...box(0, 0, 0, 2, 0, 1, A), ...box(1, 1, 0, 2, 1, 1, A), ...box(2, 2, 0, 2, 2, 1, A)], slice: { axis: 2, at: 0.5 } },
  { name: 'ball-r2', desc: 'voxel ball r 2.2, same', blocks: ball(2.2, () => A), slice: { axis: 2, at: 0.5 } },
  { name: 'ball-AB', desc: 'voxel ball r 2.2, A half, B half', blocks: ball(2.2, (x) => (x < 0 ? A : B)), slice: { axis: 2, at: 0.5 } },
  // ---- painted and terrain-like ----
  { name: 'slab-dot', desc: '5×5 slab B with one A in the middle', blocks: plan(['BBBBB', 'BBBBB', 'BBABB', 'BBBBB', 'BBBBB']), slice: PLAN },
  { name: 'slab-line', desc: '6×6 slab B with a 1-wide diagonal line of A (painted)', blocks: plan(['ABBBBB', 'BABBBB', 'BBABBB', 'BBBABB', 'BBBBAB', 'BBBBBA']), slice: PLAN },
  { name: 'slab-stripe', desc: '6×6 slab B with a straight 1-wide line of A', blocks: plan(['BBABBB', 'BBABBB', 'BBABBB', 'BBABBB', 'BBABBB', 'BBABBB']), slice: PLAN },
  { name: 'terrain-step', desc: 'grass over dirt, a one-block step', blocks: (() => {
    const out = [];
    for (let z = 0; z < 5; z++) for (let x = 0; x < 6; x++) {
      const top = x < 3 ? 1 : 2;
      for (let y = 0; y <= top; y++) out.push([x, y, z, y === top ? GRASS : DIRT]);
    }
    return out;
  })(), slice: { axis: 2, at: 2.5 } },
  { name: 'tunnel', desc: '1×2 tunnel through stone (clearance check)', blocks: box(0, 0, 0, 2, 3, 2, STONE).filter((b) => !(b[0] === 1 && (b[1] === 1 || b[1] === 2))), slice: { axis: 2, at: 1.5 } },
];

export const byName = (name) => CONFIGS.find((c) => c.name === name);

/** A flat (single-y) configuration as a 2D one for `dims: 2`: (x, z) → (x, y). */
export const to2D = (blocks) => {
  const y0 = blocks[0][1];
  if (blocks.some((b) => b[1] !== y0)) throw new Error('to2D needs a single-layer configuration');
  return blocks.map(([x, , z, m]) => [x, z, 0, m]);
};

