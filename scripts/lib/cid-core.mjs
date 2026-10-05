// §13.5: pack a directory into a CAR with ipfs-car and return the root CID.
// ipfs-car's output is byte-identical to kubo's unixfs-v1-2025 profile,
// which check:release re-verifies independently.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const pexecFile = promisify(execFile);
const BIN = join(fileURLToPath(new URL('../..', import.meta.url)), 'node_modules/.bin/ipfs-car');

export async function packDirToCar(dir, outFile) {
  const { stdout } = await pexecFile(BIN, ['pack', dir, '--output', outFile]);
  const cid = stdout.trim().split('\n').pop()?.trim();
  if (!cid || !/^ba[a-z2-7]{20,}$/.test(cid)) {
    throw new Error(`ipfs-car pack did not print a CID (got: ${JSON.stringify(stdout)})`);
  }
  return cid;
}
