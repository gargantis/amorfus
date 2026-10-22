// Attack configurations (v-union). 2D coordinates [x, y, material]; to3D puts
// them in the x-z plane at y = 0 (one layer), as the study's flat configs.
import { A, B, C } from './vu.mjs';

const rect = (x0, y0, x1, y1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push([x, y, m]); return o; };
export const to2 = (cells) => cells.map(([x, y, m]) => [x, y, 0, m]);
export const to3 = (cells) => cells.map(([x, y, m]) => [x, 0, y, m]);
const dedupe = (cells) => { const m = new Map(); for (const c of cells) m.set(`${c[0]},${c[1]}`, c); return [...m.values()]; };

// W1: X at lattice point (0,0). A pair = 1-wide bars that leave the 4x4 window
// and join a blob just outside it (big, low-pressure clusters); B pair = 2x2
// squares (small, higher pressure) filling the other two window quadrants.
// Window count: A 4, B 8 -> rule4 says A. Cluster size: A (bar+blob) > B 4 -> pressure says B.
export function W1({ bar = 3, blob = 3 } = {}) {
  const c = [];
  c.push(...rect(-2, 0, -1, 1, B), ...rect(0, -2, 1, -1, B));
  for (let t = 0; t < bar; t++) c.push([0, t, A], [-1, -1 - t, A]);
  c.push(...rect(0, bar, blob - 1, bar + blob - 1, A));
  c.push(...rect(-blob, -bar - blob, -1, -bar - 1, A));
  return dedupe(c);
}

// L2: a diagonal line of A dominoes (slope 1/2) crossing a diagonal line of
// single B blocks, in air. Crossing X at (2,1): A dominoes (2 each) vs B singles.
// Window 4x4: A 4, B 4 -> rule4 tie (none). Size: B (1) < A (2) -> pressure says B.
export function L2({ kA = [-2, 2], tB = [-3, 2] } = {}) {
  const c = [];
  for (let k = kA[0]; k <= kA[1]; k++) c.push([2 * k, k, A], [2 * k + 1, k, A]);
  for (let t = tB[0]; t <= tB[1]; t++) c.push([2 + t, -t, B]);
  return dedupe(c);
}

// LX: two straight-diagonal lines of single blocks crossing in air: A on x=y
// (length nA centred), B on the anti-diagonal through the same X.
export function LX({ nA = 6, nB = 6 } = {}) {
  const c = [];
  // X at lattice (0,0): A at (-1,-1),(0,0) on x=y ; B at (-1,0),(0,-1) on x+y=-1
  const hA = nA / 2, hB = nB / 2;
  for (let t = -hA; t < hA; t++) c.push([t, t, A]);
  for (let t = -hB; t < hB; t++) c.push([t, -1 - t, B]);
  return dedupe(c);
}

// SL: the owner's painted 1-wide diagonal line of A in a B slab (slab-line),
// with the line's lower end touching a big A blob outside the slab corner.
export function lineToBlob({ L = 6, blob = 3 } = {}) {
  const c = [];
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) c.push([x, y, x === y ? A : B]);
  // blob below-left, corner-touching the line's first block (0,0) at lattice (0,0)
  c.push(...rect(-blob, -blob, -1, -1, A));
  return dedupe(c);
}

// LC: a diagonal A line in B (x<4 or y<4 region) running into a 4x4 checker of
// single blocks (x>=4 and y>=4).
export function lineIntoChecker({ L = 8, k = 4 } = {}) {
  const c = [];
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
    const inChk = x >= k && y >= k;
    c.push([x, y, x === y || (inChk && (x + y) % 2 === 0) ? A : B]);
  }
  return dedupe(c);
}

// ABAC-big: A pair = W1 bars-to-blob (big, low pressure); the other diagonal is
// a single B and a single C (high pressure). Tension: A-A film 0 < B-C film g,
// so the tension rule says A connects whatever the sizes.
export function ABACbig({ bar = 3, blob = 3 } = {}) {
  const c = [[-1, 0, B], [0, -1, C]];
  for (let t = 0; t < bar; t++) c.push([0, t, A], [-1, -1 - t, A]);
  c.push(...rect(0, bar, blob - 1, bar + blob - 1, A));
  c.push(...rect(-blob, -bar - blob, -1, -bar - 1, A));
  return dedupe(c);
}

export const checkerSmallA = [[0, 0, A], [1, 0, B], [2, 0, B], [0, 1, B], [0, 2, B], [1, 1, A]];
export const diagEdge = [[0, 0, A], [1, 1, A]];
export const diagEdgeDiff = [[0, 1, A], [1, 0, B]];
export const L3ABC = [[0, 0, A], [1, 0, B], [0, 1, C]];
export const sq2checker = [[0, 0, A], [1, 0, B], [0, 1, B], [1, 1, A]];
export { A, B, C };
