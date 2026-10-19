// vgn: the untouched repo mesher bundle at apron 10 — timing reference.
import { meshRegion } from '../lib/mesher-repo.mjs';
export const name = 'vgn-repo';
export const describe = 'Untouched repo mesher bundle, apron 10.';
export function mesh(region, scene, core) { return core.decodeMesh(meshRegion({ ...region, params: {} })); }
