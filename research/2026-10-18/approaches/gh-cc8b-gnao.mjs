// Team gh — gh-cc8b geometry (contour crossings, k = 0, narrow caps) shaded
// with gn-best's AO: a 4-wide box at the vertex's ACTUAL quantised position
// over partial volume (clamp(½ + 4ρ) generated, occupancy edited), quadratic
// onset. work/gh/gnao.mjs re-implements gn's AO as a post-pass over the
// decoded mesh; it is byte-identical to gn-best's own AO bytes on 44 meshes
// (work/gh/gnao-check.mjs). In production it lives in the mesher (gn's fast
// path) and costs what gn measured (+0.6–1.2 ms per chunk). Normals stay
// gh-cc8b's own area-weighted normals, so the geometry is judged as is.
import { contourCross6 } from '../work/gh/syn2.mjs';
import { meshRegion } from '../work/gh/mesher-gh.mjs';
import { withGnAo } from '../work/gh/gnao.mjs';
import { CFG, PARAMS } from './gh-cc8b.mjs';
export const name = 'gh-cc8b-gnao';
export const describe = 'gh-cc8b geometry + gn-best AO (box at the actual vertex position over partial volume, quadratic onset).';
export const apron = 10;
export function mesh(region, scene, core) {
  const r = contourCross6(region, CFG);
  return withGnAo(core.decodeMesh(meshRegion({ ...region, crossT: r?.crossT, params: PARAMS })), region);
}
