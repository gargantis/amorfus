// gc: Catmull-Clark x1 with vertex points clamped to the mesher constraint box (guard, D-3 caps, pins); area normals.
import { buildCC } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1g';
export const describe = 'Catmull-Clark x1 with vertex points clamped to the mesher constraint box (guard, D-3 caps, pins); area normals.';
export const apron = 13;
export function mesh(region) { return buildCC(region, { levels: 1, guard: true, normals: 'area' }); }
