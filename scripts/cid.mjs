#!/usr/bin/env node
// Pack dist/ into a CAR (§13.5) and print the root CID.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { packDirToCar } from './lib/cid-core.mjs';

const root = process.cwd();
await mkdir(join(root, '.cache'), { recursive: true });
const out = join(root, '.cache', 'release.car');
const cid = await packDirToCar(join(root, 'dist'), out);
console.log(cid);
console.error(`car: ${out}`);
