// vgn EXPERIMENT (review only): gn-best with the edit-zone ring gated —
// members whose unit area normal is more than acos(0.7071) from the start
// vertex's own neither contribute nor expand (work/vgn/src, ringGate).
import { meshRegion } from '../work/vgn/mesher-vgn.mjs';
import { PARAMS as BEST } from './gn-best.mjs';
export const name = 'vgn-gate70';
export const describe = 'gn-best + ring gate cos ≥ 0.7071 (review experiment).';
export const PARAMS = { ...BEST, ringGate: 0.7071 };
export function mesh(region, scene, core) { return core.decodeMesh(meshRegion({ ...region, params: PARAMS })); }
