// gc: Catmull-Clark x1 on the hints mesh (pure CC rules): 4x quads; area-weighted normals of the refined mesh; AO bilinear.
import { buildCC } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1';
export const describe = 'Catmull-Clark x1 on the hints mesh (pure CC rules): 4x quads; area-weighted normals of the refined mesh; AO bilinear.';
export const apron = 13;
export function mesh(region) { return buildCC(region, { levels: 1, normals: 'area' }); }
