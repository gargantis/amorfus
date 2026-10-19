import * as base from '../../../approaches/mv-quad.mjs';
export const name = 'mv-quadx';
export const OPT = base.OPT;
export const apron = 10;
export function mesh(r, s, c) { const o = OPT.opCross; OPT.opCross = 1; const m = base.mesh(r, s, c); OPT.opCross = o; return m; }
export const fragment = base.fragment;
