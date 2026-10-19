// configs view of VARIANTS (decoded meshes); optional filter via GH_V env
import { VARIANTS } from './variants.mjs';
const only = process.env.GH_V ? process.env.GH_V.split(',') : null;
export const configs = Object.entries(VARIANTS).filter(([l]) => !only || only.includes(l)).map(([label, v]) => ({ label, apron: v.apron, mesh: (r, core) => core.decodeMesh(v.raw(r)) }));
