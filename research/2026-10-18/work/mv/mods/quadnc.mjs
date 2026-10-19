import * as base from '../../../approaches/mv-quad.mjs';
export const name = 'mv-quadnc';
export const OPT = base.OPT;
export const apron = 10;
export function mesh(r, s, c) { const o = OPT.conf; OPT.conf = 0; const m = base.mesh(r, s, c); OPT.conf = o; return m; }
export const fragment = base.fragment;
