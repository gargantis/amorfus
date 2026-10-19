// vmf (adversarial review): a pass-through wrapper of the target mf-iso so
// that tools which write to out/<name>/ (bench.mjs, run.mjs) never touch the
// target team's out/mf-iso folder. Behaviour is identical to mf-iso.
import * as T from './mf-iso.mjs';
export const name = 'vmf-iso';
export const describe = 'pass-through of mf-iso (review copy)';
export const apron = T.apron;
export const mesh = T.mesh;
export const fragment = T.fragment;
