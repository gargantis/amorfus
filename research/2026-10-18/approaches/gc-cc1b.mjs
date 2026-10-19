// gc: Catmull-Clark x1 on the hints mesh; shading normals = coarse normals interpolated bilinearly; AO bilinear.
import { buildCC } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1b';
export const describe = 'Catmull-Clark x1 on the hints mesh; shading normals = coarse normals interpolated bilinearly; AO bilinear.';
export const apron = 13;
export function mesh(region) { return buildCC(region, { levels: 1, normals: 'bilinear' }); }
