// mx: xBR-lv3 (noblend, corner rule C, 15°/75° lines) on material ids, per fragment in the dominant plane of the
// smooth normal, over surface-followed blocks from a per-chunk 3-D texture.
import { makeApproach, xbrDecide, xbrEval } from '../work/mx/mxlib.mjs';
export const name = 'mx-xbr3';
export const describe = 'Fragment material by xBR-lv3 (noblend, corner rule C, 15°/75° lines) with categorical df, in the dominant plane of the smooth normal; 21-cell surface-followed neighbourhood (axis window ±2) from a per-chunk 38³ texture; hints geometry.';
const A = makeApproach({ name, ta: 3, W: 2, decide: (nb) => xbrDecide(nb, { corner: 'C', lv3: true }), evalc: xbrEval });
export const mesh = A.mesh;
export const fragment = A.fragment;
