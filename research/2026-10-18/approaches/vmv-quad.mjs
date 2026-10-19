// vmv (adversarial review): a pass-through wrapper of the target mv-quad so
// that tools which write to out/<name>/ (bench.mjs, run.mjs) never touch the
// target team's out/mv-quad folder. Behaviour is identical to mv-quad.
import * as T from './mv-quad.mjs';
export const name = 'vmv-quad';
export const describe = 'pass-through of mv-quad (review copy)';
export const apron = T.apron;
export const mesh = T.mesh;
export const fragment = T.fragment;
export const OPT = T.OPT;
