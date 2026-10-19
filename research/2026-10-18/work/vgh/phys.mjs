// VGH: the vgs physics harness (REPO controller + collision, bundled
// read-only; work/vgh/physics-real-check.mjs re-bundled and diffed identical)
// plus the target variant gh-cc8b: work/gh/syn2.mjs contourCross6 crossings
// into work/gh/mesher-gh.mjs with gh-cc8b's CFG/PARAMS (approaches/gh-cc8b.mjs).
export * from '../vgs/phys.mjs';
import { VARIANTS } from '../vgs/phys.mjs';
import { contourCross6 } from '../gh/syn2.mjs';
import { meshRegion as ghMesh } from '../gh/mesher-gh.mjs';
import { CFG, PARAMS } from '../../approaches/gh-cc8b.mjs';
export const ghCc8bMesh = (r, cfg = CFG) => { const c = contourCross6(r, cfg); return ghMesh({ ...r, crossT: c?.crossT }); };
VARIANTS['gh-cc8b'] = { mesh: (r) => ghCc8bMesh(r), params: PARAMS };
// ablations used by the gh-specific probes (not the target itself)
VARIANTS['gh-noCliffY'] = { mesh: (r) => ghCc8bMesh(r, { ...CFG, cliffY: false }), params: PARAMS };
VARIANTS['gh-R12'] = { mesh: (r) => ghCc8bMesh(r, { ...CFG, R: 12 }), params: PARAMS };
VARIANTS['gh-nocross'] = { mesh: (r) => ghMesh({ ...r }), params: PARAMS }; // narrow caps, k 0, plain rho crossings
export { CFG, PARAMS };
