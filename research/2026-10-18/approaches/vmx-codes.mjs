// vmx (adversarial review of mx-codes): a pass-through wrapper of the target
// module approaches/mx-codes.mjs. Behaviour is the target's own code (same
// mesh(), same fragment(), same env switches). Two side effects are removed
// so the review never writes into the target team's folders:
//  - mx-codes registers process.on('exit') that writes
//    work/mx/stats/mx-codes-<tool>.json; that one listener is dropped here;
//  - the name differs, so harness tools that write out/<name>/ write
//    out/vmx-codes/ instead of out/mx-codes/.
import * as T from './mx-codes.mjs';
for (const f of process.listeners('exit')) {
  const src = f.toString();
  if (src.includes("'stats'") && src.includes('LOG')) process.removeListener('exit', f);
}
export const name = 'vmx-codes';
export const describe = 'pass-through of mx-codes (review copy, no stats writer)';
export const apron = T.apron;
export const OPTS = T.OPTS;
export const mesh = T.mesh;
export const fragment = T.fragment;
