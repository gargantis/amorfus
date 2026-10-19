// vgn (adversarial review of gn-best): gn-best's mesh() unchanged, under the
// vgn prefix so bench/timing outputs land in out/vgn-gnbest/ (apron 10).
import { mesh as gnMesh, PARAMS } from './gn-best.mjs';
export { PARAMS };
export const name = 'vgn-gnbest';
export const describe = 'gn-best mesh() re-exported (review wrapper), apron 10.';
export function mesh(region, scene, core) { return gnMesh(region, scene, core); }
