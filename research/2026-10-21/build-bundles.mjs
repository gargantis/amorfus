#!/usr/bin/env node
// Rebuild the esbuild bundles of repo source that some study scripts import.
// They are generated files and are not kept in the repo (see .gitignore
// here). Uses the repo's own esbuild, so run `npm install` at the repo root
// first.
//   node build-bundles.mjs            (from this folder or anywhere)
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const esbuild = createRequire(join(REPO, 'package.json'))('esbuild');

// [output, entry]; "repo:" entries are repo-relative, the rest are relative to this folder.
export const BUNDLES = [
  ['teams/table/gen.mjs', 'repo:src/core/gen/v1/index.ts'], // generator v1
  ['teams/table/mesher.mjs', 'repo:src/core/mesh/mesher.ts'], // the repo mesher, untouched
  ['teams/fast/src/repo-bundle.mjs', 'teams/fast/src/repo-entry.ts'], // generator + GEN_MESH input + mesher
  ['teams/v-table/src/repo.mjs', 'teams/v-table/src/repo-entry.ts'], // generator + mesher with bevelOffset
];

const outBase = process.argv[2] ? resolve(process.argv[2]) : HERE;
for (const [out, entry] of BUNDLES) {
  const entryPath = entry.startsWith('repo:') ? join(REPO, entry.slice(5)) : join(HERE, entry);
  esbuild.buildSync({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: join(outBase, out),
    absWorkingDir: REPO,
    logLevel: 'warning',
  });
  console.log(`built ${out}`);
}
