// gc: adaptive Catmull-Clark x1 (edited regions only) with CC vertex points
// clamped to the thin-feature guard (not the D-3 caps).
import { buildCCAdaptive } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1eg';
export const describe = 'Catmull-Clark x1 on edited regions only (quads touching R), vertex points clamped to the thin-feature guard (±hw), crack-free fans at the border; production normals interpolated; generated terrain unchanged.';
export const apron = 11; // edited chunks: 10 + the CC 1-ring; generated chunks keep 3 (no refinement)
export function mesh(region) { return buildCCAdaptive(region, { guard: 'hw' }); }
