#!/usr/bin/env node
// Rebuild the esbuild bundles the study's modules import. They are generated
// files and are not kept in the repo (see .gitignore here). Uses the repo's
// own esbuild, so run `npm install` at the repo root first.
//   node build-bundles.mjs            (from this folder or anywhere)
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const esbuild = createRequire(join(REPO, 'package.json'))('esbuild');

// [output, entry]; "repo:" entries are repo-relative, the rest are relative to this folder.
export const BUNDLES = [
  ['lib/mesher.mjs', 'lib/src/core/mesh/mesher.ts'], // the repo mesher plus a `corners` output
  ['lib/mesher-repo.mjs', 'repo:src/core/mesh/mesher.ts'], // the repo mesher, untouched
  ['lib/gen-mesh.mjs', 'repo:src/core/mesh/gen-mesh.ts'], // generator + GEN_MESH input builder
  ['work/gc/mesher-gc.mjs', 'work/gc/src/core/mesh/mesher-gc.ts'],
  ['work/gh/mesher-gh.mjs', 'work/gh/src/core/mesh/mesher.ts'],
  ['work/gh/mesher-gh-r1.mjs', 'work/gh/src/core/mesh/mesher-r1.ts'], // round 1 (same-r1.mjs, ab-mesher.mjs)
  ['work/gh/mesher-ghgs.mjs', 'work/gh/src-gs/core/mesh/mesher.ts'],
  ['work/gh/phys/controller-repo.mjs', 'work/gh/phys/entry.ts'],
  ['work/gn/mesher-gn.mjs', 'work/gn/src/core/mesh/mesher.ts'],
  ['work/gs/mesher-gs.mjs', 'work/gs/src/core/mesh/mesher.ts'],
  ['work/gs/physics-gs.mjs', 'work/gs/src/core/physics/battery.ts'],
  ['work/vgn/mesher-vgn.mjs', 'work/vgn/src/core/mesh/mesher.ts'],
  ['work/vgs/mesher-gs-rebuilt.mjs', 'work/gs/src/core/mesh/mesher.ts'],
  ['work/vgs/physics-real.mjs', 'lib/physics-entry.ts'],
  ['work/vgh/physics-real-check.mjs', 'lib/physics-entry.ts'],
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
