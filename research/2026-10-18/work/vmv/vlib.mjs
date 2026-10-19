// vmv review helpers (adversarial review of mv-quad). Reuses the vmf
// helpers (work/vmf/lib.mjs, read-only) and adds: plan sets from block
// lists, a shape-fidelity score against the painted blocks, and a
// triangle-edge zoom renderer. Every render meshes then rasterises at once,
// because mv-quad's fragment reads the module's last mesh (CUR).
import * as core from '../../harness/core.mjs';
import { flatGround, GROUND } from '../vmf/adv-scenes.mjs';
import { loadApproach, planRaster, planRgb, matStats, hcat, vcat, save, renderShaded, cropRgb, ROOT } from '../vmf/lib.mjs';
export { core, flatGround, GROUND, loadApproach, planRaster, planRgb, matStats, hcat, vcat, save, renderShaded, cropRgb, ROOT };

export const frag = (A) => (A.fragment ? (a, i) => A.fragment(a, i, null) : null);

/** Set of "x,z" keys → plan(x,z) returning fg inside, bg outside. */
export function setPlan(cells, fg = core.STONE, bg = core.GRASS) {
  const s = new Set(cells.map(([x, z]) => `${x},${z}`));
  return (x, z) => (s.has(`${x},${z}`) ? fg : bg);
}

/** Mesh `cell` with approach A and rasterise a plan window [x0,z0,x1,z1] at S px/block. */
export function plan(A, cell, win, S = 32, apron = null) {
  const m = A.mesh(core.buildRegion(cell, apron ?? A.apron ?? 10), null, core);
  const img = planRaster(m, { x0: win[0], z0: win[1], w: win[2] - win[0], h: win[3] - win[1], S, fragment: frag(A) });
  return { m, img };
}

/** Pixel disagreement between the displayed material and the painted
 *  block material (plan(x,z) of the sample's block), inside win:
 *  returns { wrong: blocks² shown ≠ painted, fgArea, fgCells, parts }. */
export function fidelity(img, planFn, win, fg = core.STONE) {
  const { W, S, mat, x0, z0 } = img;
  let wrong = 0, fgA = 0;
  const i0 = Math.round((win[0] - x0) * S), i1 = Math.round((win[2] - x0) * S);
  const j0 = Math.round((win[1] - z0) * S), j1 = Math.round((win[3] - z0) * S);
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const x = Math.floor(x0 + (i + 0.5) / S), z = Math.floor(z0 + (j + 0.5) / S);
    const m = mat[j * W + i];
    if (m !== (planFn(x, z) & 0xff)) wrong++;
    if (m === fg) fgA++;
  }
  let cells = 0;
  for (let z = win[1]; z < win[3]; z++) for (let x = win[0]; x < win[2]; x++) if ((planFn(x, z) & 0xff) === fg) cells++;
  return { wrong: wrong / (S * S), fgArea: fgA / (S * S), fgCells: cells };
}

/** Plan zoom with triangle edges of up-facing triangles and the block grid. */
export function zoomRgb(img, mesh, { edges = true, grid = true } = {}) {
  const im = planRgb(img, { grid, edges: false });
  if (!edges) return im;
  const { S, x0, z0 } = img;
  const W = im.width, H = im.height, rgb = im.rgb;
  const put = (i, j, c, a) => { if (i < 0 || j < 0 || i >= W || j >= H) return; const k = (j * W + i) * 3; for (let t = 0; t < 3; t++) rgb[k + t] = rgb[k + t] * (1 - a) + c[t] * a; };
  const { pos, tri, T } = mesh;
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const area = (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]) - (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3]);
    if (area >= -1e-12) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const ax = (pos[p * 3] - x0) * S, az = (pos[p * 3 + 2] - z0) * S, bx = (pos[q * 3] - x0) * S, bz = (pos[q * 3 + 2] - z0) * S;
      const n = Math.ceil(Math.hypot(bx - ax, bz - az));
      for (let s = 0; s <= n; s++) put(Math.round(ax + (bx - ax) * s / n), Math.round(az + (bz - az) * s / n), [255, 255, 255], 0.3);
    }
  }
  return im;
}
