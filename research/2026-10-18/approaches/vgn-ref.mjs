// vgn: production 'hints' rule from the gn study bundle with default params
// (byte-identical to the repo mesher per work/gn/same.mjs; re-checked in work/vgn/same.mjs).
import { meshRegion } from '../work/gn/mesher-gn.mjs';
export const name = 'vgn-ref';
export const describe = 'Production hints (reference for review timings), apron 10.';
export function mesh(region, scene, core) { return core.decodeMesh(meshRegion({ ...region, params: {} })); }
