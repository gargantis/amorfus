// gc: Catmull-Clark x1 only where shapes were edited (built), the deployable
// form. Generated terrain is the production mesh unchanged.
import { buildCCAdaptive } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1e';
export const describe = 'Catmull-Clark x1 on quads touching the relaxation set R (shape-edited cells) only, crack-free fans at the border; production normals interpolated; generated terrain = production mesh (0 extra triangles).';
export const apron = 11; // edited chunks: 10 + the CC 1-ring; generated chunks keep 3 (no refinement)
export function mesh(region) { return buildCCAdaptive(region, {}); }
