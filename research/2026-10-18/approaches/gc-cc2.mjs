// gc: Catmull-Clark x2 (16x quads, ceiling check); area-weighted normals; AO bilinear.
import { buildCC } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc2';
export const describe = 'Catmull-Clark x2 (16x quads, ceiling check); area-weighted normals; AO bilinear.';
export const apron = 13;
export function mesh(region) { return buildCC(region, { levels: 2, normals: 'area' }); }
