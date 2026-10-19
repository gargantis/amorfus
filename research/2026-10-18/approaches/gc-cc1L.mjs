// gc: Catmull-Clark x1 then pushed to the limit surface; area-weighted normals; AO bilinear.
import { buildCC } from '../work/gc/lib-gc.mjs';
export const name = 'gc-cc1L';
export const describe = 'Catmull-Clark x1 then pushed to the limit surface; area-weighted normals; AO bilinear.';
export const apron = 13;
export function mesh(region) { return buildCC(region, { levels: 1, limit: true, normals: 'area' }); }
