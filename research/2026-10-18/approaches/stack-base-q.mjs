// stack (study): gh-cc8b geometry + gn box AO, QUADRATIC onset + gm-hint
// materials on generated terrain; edit zones = production block materials
// (placeholder zone method 'own', reach 0). See work/stack/stack-core.mjs.
import { makeStack } from '../work/stack/stack-core.mjs';
import { ownZone } from '../work/stack/zones.mjs';
export const name = 'stack-base-q';
export const describe = 'gh-cc8b geometry (contour crossings at edited edges, k 0, narrow caps) + gn box AO (quadratic onset) + production normals + gm-hint materials on generated blocks; edited blocks show their own material.';
export const apron = 10;
const S = makeStack({ aoCurve: 'quad', genRule: 'none', zone: ownZone(0) });
export const mesh = S.mesh, fragment = S.fragment;
