#!/usr/bin/env node
// §13.2: merge Vite's npm licence JSON with worker-only and vendored
// notices into dist/THIRD-PARTY-LICENSES.txt, then delete the JSON so
// audit-dist never sees it. The audit cross-checks the result against
// scripts/expected-licenses.json.
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const licenseJson = join(dist, '.license-npm.json');

// Dependencies that ship in workers only (invisible to the HTML entry's
// graph) and vendored sources, each { name, version, license, file }.
const EXTRA = [];

const parts = [];
try {
  await access(licenseJson);
  const raw = JSON.parse(await readFile(licenseJson, 'utf8'));
  // Vite (Rolldown) emits an array of { name, version, license, licenseText? }.
  const list = Array.isArray(raw) ? raw : (raw.dependencies ?? []);
  for (const dep of list) {
    parts.push(
      `## ${dep.name}@${dep.version}\n\n${dep.license ?? ''}\n\n${dep.licenseText ?? ''}`.trim(),
    );
  }
  await rm(licenseJson);
} catch {
  // No bundled npm dependencies yet.
}

for (const extra of EXTRA) {
  const text = await readFile(extra.file, 'utf8');
  parts.push(`## ${extra.name}@${extra.version}\n\n${extra.license}\n\n${text}`.trim());
}

const header =
  'Third-party notices for the Amorfus distribution.\n' +
  'Each section is one bundled package.\n';
await writeFile(join(dist, 'THIRD-PARTY-LICENSES.txt'), `${header}\n${parts.join('\n\n')}\n`);
console.log(`licenses: wrote THIRD-PARTY-LICENSES.txt with ${parts.length} entries`);
