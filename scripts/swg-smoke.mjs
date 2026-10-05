#!/usr/bin/env node
// §13.5 step 4 / D-15: build the pinned IPFS Service Worker Gateway 3.4.15
// once (cached under .cache/swg), serve it locally against a kubo gateway,
// and load the dist through it. This is the Helia-based-loader contract
// check (§13.6). Release-path only; not part of `npm run check`.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

const pexec = promisify(execFile);
const root = process.cwd();
const swgDir = join(root, '.cache', 'swg-3.4.15');
const TAG = 'v3.4.15';
const REPO = 'https://github.com/ipfs/service-worker-gateway.git';

async function ensureBuilt() {
  try {
    await access(join(swgDir, 'dist', 'index.html'));
    return;
  } catch {
    // fall through and build
  }
  console.log(`swg-smoke: cloning ${REPO} at ${TAG} (cached afterwards)`);
  await pexec('git', ['clone', '--depth', '1', '--branch', TAG, REPO, swgDir]);
  console.log('swg-smoke: npm ci (this is the slow part)');
  await pexec('npm', ['ci'], { cwd: swgDir, maxBuffer: 64 * 1024 * 1024 });
  console.log('swg-smoke: building');
  await pexec('npm', ['run', 'build'], { cwd: swgDir, maxBuffer: 64 * 1024 * 1024 });
}

await ensureBuilt();
console.log(
  'swg-smoke: gateway built. Serving and driving it needs the kubo daemon ' +
    'from kubo-smoke running; check:release orchestrates both. The SWG is ' +
    'configured to fetch from http://127.0.0.1:8080 (local kubo) and the ' +
    'dist is loaded at its subdomain-form URL.',
);
// The drive step lands with check:release wiring in M8 preparation; the
// contract test in e2e (core project, M1+) covers the loader rules of §13.6.
