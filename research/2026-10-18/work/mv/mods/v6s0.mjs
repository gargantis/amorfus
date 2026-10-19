import * as base from '../../../approaches/mv-v6.mjs';
export const name = 'mv-v6s0';
export const OPT = base.OPT;
export const apron = 10;
export function mesh(r, s, c) { const o = OPT.stepShift; OPT.stepShift = 0; const m = base.mesh(r, s, c); OPT.stepShift = o; return m; }
export const fragment = base.fragment;
