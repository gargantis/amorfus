// vgn: the untouched repo bundle (lib/mesher-repo.mjs) at apron 3 — timing reference that shares no code with gn.
import { meshRegion } from '../lib/mesher-repo.mjs';
export const name = 'vgn-repo3';
export const apron = 3;
export const describe = 'Untouched repo mesher bundle, apron 3.';
export function mesh(region, scene, core) { return core.decodeMesh(meshRegion({ ...region, params: {} })); }
