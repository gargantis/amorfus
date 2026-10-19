import * as core from '../../harness/core.mjs';
import { contourCross2, contourCross3, contourCross4 } from './syn.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
const BASE = 6;
const ground = (x, y, z) => (y < BASE ? { v: 3, rho: Math.max(-1, Math.min(1, (BASE - y - 0.5) / 4)) } : { v: 0, rho: Math.max(-1, Math.min(1, (BASE - y - 0.5) / 4)) });
const cases = {
  // a 52×52 built platform 3 high over the whole region: every top edge is a plateau edge
  platform: (x, y, z) => (y >= BASE && y < BASE + 3 ? { v: 3, edited: true } : ground(x, y, z)),
  // a big built hill covering the whole chunk (gentle dome r = 30)
  bighill: (x, y, z) => (y >= BASE && y + 0.5 < BASE + 10 - ((x - 16) ** 2 + (z - 16) ** 2) / 60 ? { v: 3, edited: true } : ground(x, y, z)),
  // a dug maze: 1-wide corridors every 2 blocks, 2 high, everywhere
  maze: (x, y, z) => (y >= BASE - 3 && y < BASE - 1 && ((x & 1) === 0 || (z % 6) === 0) ? { v: 0, edited: true } : ground(x, y, z)),
};
for (const [name, cell] of Object.entries(cases)) {
  const r = core.buildRegion(cell, 10);
  let best = { syn: Infinity, gh: Infinity, repo: Infinity }, edges = 0;
  for (let i = 0; i < 5; i++) {
    let t0 = performance.now(); const c = contourCross4(r, { R: 8, w0: 1 }); best.syn = Math.min(best.syn, performance.now() - t0); edges = c.edges;
    t0 = performance.now(); ghMesh({ ...r, crossT: c.crossT, params: { k: 0, clearance: 'narrow', aoMode: 'position' } }); best.gh = Math.min(best.gh, performance.now() - t0);
    t0 = performance.now(); repoMesh({ ...r, params: {} }); best.repo = Math.min(best.repo, performance.now() - t0);
  }
  console.log(`${name}: synthetic edges ${edges}, synth ${best.syn.toFixed(1)} ms + mesher ${best.gh.toFixed(1)} ms vs repo mesher ${best.repo.toFixed(1)} ms`);
}
