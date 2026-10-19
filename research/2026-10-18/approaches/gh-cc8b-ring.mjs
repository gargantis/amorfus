// Team gh (study) — gh-cc8b geometry + gn-best AO + gn-style edit-zone
// shading normals (mean unit face normal over the 3-ring, cells within 2 of a
// non-sharp edit). Shading only; needs apron 13 in production (positions
// reach 9 + 3 rings + 1); rendered here at apron 10 on single scenes.
import { contourCross6 } from '../work/gh/syn2.mjs';
import { meshRegion } from '../work/gh/mesher-gh.mjs';
import { withGnAo } from '../work/gh/gnao.mjs';
import { ringNormals } from '../work/gh/ringnormals.mjs';
import { CFG, PARAMS } from './gh-cc8b.mjs';
export const name = 'gh-cc8b-ring';
export const describe = 'gh-cc8b + gn AO + 3-ring edit-zone shading normals (study; apron 13 needed).';
export const apron = 10;
export function mesh(region, scene, core) {
  const r = contourCross6(region, CFG);
  const m = withGnAo(core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: PARAMS })), region);
  return ringNormals(m, region);
}
