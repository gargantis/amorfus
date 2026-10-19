// vmf: field-pass cost on built (edited, apron 10) stress chunks: a grid of
// 1-thick walls, a field of 1×1 pillars (scaffolding / forest), a checker
// floor; min of N, field pass alone vs the hints mesh.
import * as core from '../../harness/core.mjs';
import { makeFast } from '../mf/fast.mjs';
import { flatGround } from './adv-scenes.mjs';
const { GRASS, STONE, PLANKS, BRICK } = core;
const add = makeFast({ sigma: 1.2, trunc: 2.5, tau: 0.55, bits: 5, R: 0.5, flipTwist: 0.03 });
const N = 7;
const g = flatGround((x, z) => ((x + z) & 1 ? STONE : GRASS));
const SC = {
  'wall-grid (1-thick walls every 4, 6 high)': (x, y, z) => (y >= 8 && y < 14 && (((x % 4) + 4) % 4 === 0 || ((z % 4) + 4) % 4 === 0) ? { v: (x + y) & 1 ? PLANKS : BRICK, edited: true } : g(x, y, z)),
  'pillars (1x1 every 2, 12 high)': (x, y, z) => (y >= 8 && y < 20 && ((x & 1) === 0 && (z & 1) === 0) ? { v: (x + z + y) % 3 ? PLANKS : BRICK, edited: true } : g(x, y, z)),
  'flat checker floor (no build)': (x, y, z) => g(x, y, z),
};
const clone = (m) => ({ ...m, pos: m.pos.slice(), nrm: m.nrm.slice(), mat: m.mat.slice(), flags: m.flags.slice(), ao: m.ao.slice(), tri: m.tri.slice(), triQuad: m.triQuad.slice(), corner: m.corner.slice() });
for (const [n, cell] of Object.entries(SC)) {
  const region = core.buildRegion(cell, 10);
  let bm = Infinity, bf = Infinity, V = 0, T = 0, st = null;
  for (let r = 0; r < N; r++) {
    let t0 = performance.now();
    const raw = core.meshRegion({ ...region, params: {} });
    bm = Math.min(bm, performance.now() - t0);
    const m = clone(core.decodeMesh(raw));
    V = m.V; T = m.T;
    t0 = performance.now();
    add(m, region);
    bf = Math.min(bf, performance.now() - t0);
    st = m.mfStats; st.Tafter = m.T;
  }
  console.log(`${n}: hints mesh ${bm.toFixed(1)} ms, mf field ${bf.toFixed(1)} ms (+${(100 * bf / bm).toFixed(0)}%), ${V} verts, ${T} → ${st.Tafter} tris (+${(100 * (st.Tafter - T) / T).toFixed(1)}%), fans ${st.fans}, flips ${st.flipped}`);
}
