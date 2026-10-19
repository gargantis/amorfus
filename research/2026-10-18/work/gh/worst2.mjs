// Stress inputs for the crossing pass (min of 7): whole-region built shapes.
import * as core from '../../harness/core.mjs';
import { contourCross6 } from './syn2.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
const BASE = 6;
const ground = (x, y, z) => (y < BASE ? { v: 3, rho: Math.max(-1, Math.min(1, (BASE - y - 0.5) / 4)) } : { v: 0, rho: Math.max(-1, Math.min(1, (BASE - y - 0.5) / 4)) });
const hash = (x, y, z) => { let h = Math.imul(x * 374761393 + y * 668265263 + z * 2147483647, 1274126177) >>> 0; h ^= h >>> 13; return (Math.imul(h, 1274126177) >>> 8) / 16777216; };
const cases = {
  platform: (x, y, z) => (y >= BASE && y < BASE + 3 ? { v: 3, edited: true } : ground(x, y, z)),
  bighill: (x, y, z) => (y >= BASE && y + 0.5 < BASE + 10 - ((x - 16) ** 2 + (z - 16) ** 2) / 60 ? { v: 3, edited: true } : ground(x, y, z)),
  maze: (x, y, z) => (y >= BASE - 3 && y < BASE - 1 && ((x & 1) === 0 || (z % 6) === 0) ? { v: 0, edited: true } : ground(x, y, z)),
  rubble: (x, y, z) => (y >= BASE && y < BASE + 8 && hash(x, y, z) < 0.3 ? { v: 3, edited: true } : ground(x, y, z)),
  stairs1to8: (x, y, z) => (y >= BASE && y < BASE + Math.floor((x + 10) / 8) + Math.floor((z + 10) / 8) ? { v: 3, edited: true } : ground(x, y, z)),
};
for (const [name, cell] of Object.entries(cases)) {
  const r = core.buildRegion(cell, 10);
  let bc = 1e9, bm = 1e9, br = 1e9, edges = 0;
  for (let i = 0; i < 7; i++) {
    let t0 = performance.now(); const c = contourCross6(r, cc8b.CFG); bc = Math.min(bc, performance.now() - t0); edges = c.stats.edges;
    t0 = performance.now(); ghMesh({ ...r, crossT: c.crossT, params: cc8b.PARAMS }); bm = Math.min(bm, performance.now() - t0);
    t0 = performance.now(); repoMesh({ ...r, params: {} }); br = Math.min(br, performance.now() - t0);
  }
  console.log(`${name.padEnd(11)} edited edges ${String(edges).padStart(6)}: crossings ${bc.toFixed(1)} ms + gh mesher ${bm.toFixed(1)} ms = ${(bc + bm).toFixed(1)} vs repo ${br.toFixed(1)} ms`);
}
