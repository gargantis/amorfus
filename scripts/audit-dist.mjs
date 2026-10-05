#!/usr/bin/env node
// CLI for the §14 dist audit; the logic and its planted-failure self-test
// live in scripts/lib/audit-dist-core.mjs.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auditDist } from './lib/audit-dist-core.mjs';

const root = process.cwd();
const thirdParty = JSON.parse(await readFile(join(root, 'third-party.json'), 'utf8'));
const expected = JSON.parse(await readFile(join(root, 'scripts/expected-licenses.json'), 'utf8'));

const { findings } = await auditDist(join(root, 'dist'), {
  allowedHosts: thirdParty.map((e) => e.host),
  expectedLicensePackages: expected,
});

if (findings.length > 0) {
  for (const f of findings) {
    console.error(`audit-dist: ${f.file}: ${f.why}${f.detail ? ` (${f.detail})` : ''}`);
  }
  process.exit(1);
}
console.log('audit-dist: dist/ is clean');
