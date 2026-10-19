// Team gh: named raw mesh functions (region → MeshResult) for the physics
// battery, edit bench, seam and image tools. `raw` must read only the region.
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { meshRegion as studyMesh } from '../../lib/mesher.mjs';
import { meshRegion as ghMesh } from './mesher-gh.mjs';
import { meshRegion as gsMesh } from '../gs/mesher-gs.mjs';
import { meshRegion as ghgsMesh } from './mesher-ghgs.mjs';
import { contourCross4 } from './syn.mjs';
import { contourCross5, contourCross6 } from './syn2.mjs';
import * as gsMls from '../../approaches/gs-mls.mjs';
import * as gsCtx from '../../approaches/gs-ctx.mjs';
import * as cc8b from '../../approaches/gh-cc8b.mjs';
import * as ccmls from '../../approaches/gh-ccmls.mjs';
import * as ccj6 from '../../approaches/gh-ccj6.mjs';

const cc5 = (cfg, params, mesher = ghMesh) => (r) => {
  const c = contourCross6(r, cfg);
  return mesher({ ...r, crossT: c?.crossT, params });
};
const N0 = { k: 0, clearance: 'narrow' };

export const VARIANTS = {
  cubes: { apron: 10, raw: (r) => studyMesh({ ...r, params: { forceZeroOffsets: true } }) },
  hints: { apron: 10, raw: (r) => studyMesh({ ...r, params: {} }) },
  'hints-repo': { apron: 10, raw: (r) => repoMesh({ ...r, params: {} }) },
  'gh-narrow': { apron: 10, raw: (r) => ghMesh({ ...r, params: { clearance: 'narrow' } }) },
  'gh-cc8': {
    apron: 10,
    raw: (r) => { const c = contourCross4(r, { R: 8, w0: 1 }); return ghMesh({ ...r, crossT: c?.crossT, params: N0 }); },
  },
  'cc-mirror': { apron: 10, raw: cc5({ mirror: true }, N0) },
  'cc-cliffH-m': { apron: 10, raw: cc5({ cliffH: true, mirror: true }, N0) },
  'cc-cliffHY-m': { apron: 10, raw: cc5({ cliffH: true, cliffY: true, mirror: true }, N0) },
  'gh-cc8b': { apron: 10, raw: cc5(cc8b.CFG, cc8b.PARAMS) },
  'gh-cc8b-w05': { apron: 10, raw: cc5({ ...cc8b.CFG, w0: 0.5 }, cc8b.PARAMS) },
  'gh-cc8b-w2': { apron: 10, raw: cc5({ ...cc8b.CFG, w0: 2 }, cc8b.PARAMS) },
  'cc8b-pair': { apron: 10, raw: cc5({ ...cc8b.CFG, pair: true }, cc8b.PARAMS) },
  'cc8b-pair0': { apron: 10, raw: cc5({ ...cc8b.CFG, pair: true, pairCos: 0 }, cc8b.PARAMS) },
  // combinations (gh crossings into the patched gs mesher copy)
  'ccC': { apron: 10, raw: cc5({ cliffH: true, mirror: true }, { k: 0, capMode: 'context' }, ghgsMesh) },
  'ccC-d1': { apron: 10, raw: cc5({ cliffH: true, mirror: true }, { k: 0, capMode: 'context', rDilate: 1 }, ghgsMesh) },
  'ccC-j6': { apron: 16, raw: cc5({ cliffH: true, mirror: true }, { capMode: 'context', rDilate: 1 }, ghgsMesh) },
  'ccC-mls': { apron: 16, raw: cc5({ cliffH: true, mirror: true }, { ...gsMls.params, editMid: false }, ghgsMesh) },
  'ccN-mls': { apron: 16, raw: cc5({ cliffH: true, mirror: true }, { ...gsMls.params, editMid: false, capMode: 'narrow' }, ghgsMesh) },
  'ccC-mls-R4': { apron: 12, raw: cc5({ R: 4, cliffH: true, mirror: true }, { ...gsMls.params, editMid: false }, ghgsMesh) },
  'ccN-R7-k1': { apron: 10, raw: cc5({ ...cc8b.CFG, R: 7 }, { k: 1, capMode: 'narrow' }, ghgsMesh) },
  'ccN-R6-k2': { apron: 10, raw: cc5({ ...cc8b.CFG, R: 6 }, { k: 2, capMode: 'narrow' }, ghgsMesh) },
  'ccN-R6-k2d': { apron: 10, raw: cc5({ ...cc8b.CFG, R: 6 }, { k: 2, capMode: 'narrow', rDilate: 1 }, ghgsMesh) },
  'ccN-R8-k2': { apron: 12, raw: cc5(cc8b.CFG, { k: 2, capMode: 'narrow' }, ghgsMesh) },
  'ccN-R8-k6': { apron: 16, raw: cc5(cc8b.CFG, { k: 6, capMode: 'narrow' }, ghgsMesh) },
  'gh-ccmls': { apron: 16, raw: cc5(cc8b.CFG, ccmls.PARAMS, ghgsMesh) },
  'gh-ccj6': { apron: 16, raw: cc5(cc8b.CFG, ccj6.PARAMS, ghgsMesh) },
  'gs-ctx': { apron: 10, raw: (r) => gsMesh({ ...r, params: gsCtx.params }) },
  'gs-mls': { apron: 10, raw: (r) => gsMesh({ ...r, params: gsMls.params }) },
};

export function register(name, v) { VARIANTS[name] = v; }
export { cc5 };
