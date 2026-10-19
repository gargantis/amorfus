import * as base from '../../../approaches/mv-quad.mjs';
export const name = 'mv-quad1';
export const OPT = base.OPT;
export const apron = 10;
export function mesh(r, s, c) { const o = OPT.oneChannel; OPT.oneChannel = 1; const m = base.mesh(r, s, c); OPT.oneChannel = o; return m; }
export const fragment = base.fragment;
