// vgn: production 'hints' rule at apron 3 (reference).
import { meshRegion } from '../work/gn/mesher-gn.mjs';
export const name = 'vgn-ref3';
export const apron = 3;
export const describe = 'Production hints (reference for review timings), apron 3.';
export function mesh(region, scene, core) { return core.decodeMesh(meshRegion({ ...region, params: {} })); }
