import * as base from '../../../approaches/mv-quad.mjs';
export const name = 'mv-quadnf';
export const OPT = base.OPT;
export const apron = 10;
const set = (o) => { const old = { conf: OPT.conf, noFade: OPT.noFade }; Object.assign(OPT, o); return old; };
export function mesh(r, s, c) { const o = set({ conf: Number(process.env.CONF ?? 0), noFade: 1 }); const m = base.mesh(r, s, c); Object.assign(OPT, o); return m; }
export const fragment = base.fragment;
