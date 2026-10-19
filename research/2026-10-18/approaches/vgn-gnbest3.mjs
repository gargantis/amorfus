// vgn: gn-best at the production short apron 3 (unedited GEN_MESH regions).
import { mesh as gnMesh } from './gn-best.mjs';
export const name = 'vgn-gnbest3';
export const apron = 3;
export const describe = 'gn-best mesh() at apron 3 (review wrapper).';
export function mesh(region, scene, core) { return gnMesh(region, scene, core); }
