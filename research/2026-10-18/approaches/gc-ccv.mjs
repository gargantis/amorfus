// gc: No refinement: every hints vertex pushed to its CC limit position (1-ring stencil), area normals; 0 extra triangles.
import { buildCC } from '../work/gc/lib-gc.mjs';
export const name = 'gc-ccv';
export const describe = 'No refinement: every hints vertex pushed to its CC limit position (1-ring stencil), area normals; 0 extra triangles.';
export const apron = 13;
export function mesh(region) { return buildCC(region, { levels: 0, limit: true, normals: 'area' }); }
