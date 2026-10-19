// stack (study): as stack-base-q with the LINEAR AO onset (gn-ao's curve,
// production's 1 − 1.2·max(0, F − ½)).
import { makeStack } from '../work/stack/stack-core.mjs';
import { ownZone } from '../work/stack/zones.mjs';
export const name = 'stack-base-l';
export const describe = 'gh-cc8b geometry + gn box AO (linear onset) + production normals + gm-hint materials on generated blocks; edited blocks show their own material.';
export const apron = 10;
const S = makeStack({ aoCurve: 'linear', genRule: 'none', zone: ownZone(0) });
export const mesh = S.mesh, fragment = S.fragment;
