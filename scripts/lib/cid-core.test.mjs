import { describe, it, expect } from 'vitest';
import { packDirToCar } from './cid-core.mjs';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// §13.5: the release CID comes from ipfs-car pack (byte-identical to kubo's
// unixfs-v1-2025 profile). The same helper feeds the e2e gateway mounts.
describe('packDirToCar', () => {
  it('packs a directory and returns a CIDv1 string, deterministically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amorfus-cid-'));
    const outDir = await mkdtemp(join(tmpdir(), 'amorfus-car-'));
    await writeFile(join(dir, 'index.html'), 'hello');
    const out1 = join(outDir, 'a.car');
    const out2 = join(outDir, 'b.car');
    const cid1 = await packDirToCar(dir, out1);
    const cid2 = await packDirToCar(dir, out2);
    expect(cid1).toMatch(/^bafy[a-z2-7]{50,}$/);
    expect(cid1).toBe(cid2);
    expect((await stat(out1)).size).toBeGreaterThan(0);
    await rm(dir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }, 60000);
});
