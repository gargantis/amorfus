// gc: adaptive Catmull-Clark x1 made D-3 compliant: vertex points clamped to
// the mesher's full box (guard + clearance caps + pins) and edge points not
// allowed to move toward air where a clearance cap applies.
import { buildCCAdaptive } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1ed';
export const describe = 'Catmull-Clark x1 on edited regions only, vertex points clamped to the full mesher box (guard, D-3 caps, pins), capped edge points kept off the air side; production normals interpolated.';
export const apron = 11;
export function mesh(region) { return buildCCAdaptive(region, { guard: 'box', capEdges: true }); }
