#!/usr/bin/env node
// §13.7: scan tracked text files for absolute home paths and (locally) for
// terms from a denylist file kept OUTSIDE the repo via $AMORFUS_PRIVATE_TERMS.
// CI has no denylist and runs the built-in patterns only.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { scanText, isProbablyBinary } from './lib/public-scan-core.mjs';

const extraTerms = [];
const termsPath = process.env.AMORFUS_PRIVATE_TERMS;
if (termsPath && existsSync(termsPath)) {
  for (const line of readFileSync(termsPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) extraTerms.push(t);
  }
}

// Tracked files plus untracked-but-not-ignored, so a finding is caught
// before its first commit, not after.
const files = execFileSync('git', ['ls-files', '-z', '-c', '-o', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

let findings = [];
for (const path of files) {
  const buf = readFileSync(path);
  if (isProbablyBinary(buf)) continue;
  findings = findings.concat(scanText(path, buf.toString('utf8'), extraTerms));
}

if (findings.length > 0) {
  for (const f of findings) {
    console.error(`public-scan: ${f.path}:${f.line}: ${f.why} (${f.match})`);
  }
  process.exit(1);
}
console.log(`public-scan: ${files.length} tracked files clean`);
