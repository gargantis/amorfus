#!/usr/bin/env node
// §13.5 check:release: the full gate, then kubo's independent re-chunking
// and gateway smoke, then the Service Worker Gateway smoke. Any red step
// stops the release.
import { spawnSync } from 'node:child_process';

const steps = [
  ['npm', ['run', 'check']],
  ['node', ['scripts/kubo-smoke.mjs']],
  ['node', ['scripts/swg-smoke.mjs']],
];

for (const [cmd, args] of steps) {
  console.log(`\ncheck-release: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`check-release: FAILED at ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}
console.log('\ncheck-release: all steps green');
