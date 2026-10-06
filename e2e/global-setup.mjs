// Packs dist/ to get its real CID, then starts the strict gateway mounts on
// fixed ports. State goes to e2e/.gateway.json for the specs.
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { packDirToCar } from '../scripts/lib/cid-core.mjs';
import { startGateway } from './lib/serve-gateway.mjs';

const PORTS = { plain: 4731, csp: 4732, headers: 4733 };

export default async function globalSetup() {
  const root = process.cwd();
  const dist = join(root, 'dist');
  try {
    await access(join(dist, 'index.html'));
  } catch {
    throw new Error('e2e needs dist/ — run `npm run build` first (check runs it before e2e)');
  }
  await mkdir(join(root, '.cache'), { recursive: true });
  const cid = await packDirToCar(dist, join(root, '.cache', 'e2e-dist.car'));
  // A second, distinct cid-shaped origin for the handoff pair (§12.5): the
  // same dist under another subdomain origin.
  const cid2 = cid.slice(0, -1) + (cid.endsWith('a') ? 'b' : 'a');
  const gw = await startGateway({ distDir: dist, cid, cid2, ports: PORTS });
  const state = {
    cid,
    cid2,
    plainPort: gw.plainPort,
    cspPort: gw.cspPort,
    headersPort: gw.headersPort,
    dist,
  };
  await writeFile(join(root, 'e2e', '.gateway.json'), JSON.stringify(state, null, 2));
  return async () => {
    await gw.close();
  };
}
