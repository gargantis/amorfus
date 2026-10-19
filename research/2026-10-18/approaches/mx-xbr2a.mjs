// mx: xBR-lv2 (noblend, corner rule A: no restriction) on material ids, per fragment in the dominant plane of the
// smooth normal, over surface-followed blocks from a per-chunk 3-D texture.
import { makeApproach, xbrDecide, xbrEval } from '../work/mx/mxlib.mjs';
export const name = 'mx-xbr2a';
export const describe = 'Fragment material by xBR-lv2 (noblend, corner rule A: no restriction) with categorical df, in the dominant plane of the smooth normal; 21-cell surface-followed neighbourhood (axis window ±2) from a per-chunk 38³ texture; hints geometry.';
const A = makeApproach({ name, ta: 3, W: 2, decide: (nb) => xbrDecide(nb, { corner: 'A', lv3: false }), evalc: xbrEval });
export const mesh = A.mesh;
export const fragment = A.fragment;
