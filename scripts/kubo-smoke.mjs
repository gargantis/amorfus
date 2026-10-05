#!/usr/bin/env node
// §13.5 check:release steps 2–3: an independent re-chunking by kubo must
// reproduce ipfs-car's CID, then the dist must load through kubo's path and
// subdomain gateway forms from the imported CAR. kubo runs via a single
// `npx -p kubo@0.43.1` shell so the daemon's lifetime is owned by that
// shell, not by this script.
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { packDirToCar } from './lib/cid-core.mjs';

const root = process.cwd();
const dist = join(root, 'dist');
await mkdir(join(root, '.cache'), { recursive: true });
const car = join(root, '.cache', 'release.car');
const carCid = await packDirToCar(dist, car);
console.log(`ipfs-car root: ${carCid}`);

const shell = `
set -eu
export IPFS_PATH="$(mktemp -d)"
trap 'ipfs shutdown >/dev/null 2>&1 || true; rm -rf "$IPFS_PATH"' EXIT

ipfs init --profile unixfs-v1-2025 >/dev/null

KUBO_CID="$(ipfs add -r -Q --only-hash "${dist}")"
echo "kubo only-hash: $KUBO_CID"
if [ "$KUBO_CID" != "${carCid}" ]; then
  echo "CID mismatch: kubo re-chunking disagrees with ipfs-car (13.5 step 2)" >&2
  exit 1
fi

ipfs dag import --pin-roots "${car}" >/dev/null
ipfs daemon --offline &
DAEMON=$!

for i in $(seq 1 60); do
  if curl -fso /dev/null "http://127.0.0.1:8080/ipfs/${carCid}/"; then break; fi
  if ! kill -0 "$DAEMON" 2>/dev/null; then echo "daemon died" >&2; exit 1; fi
  sleep 1
done

curl -fso /tmp/amorfus-kubo-path.html "http://127.0.0.1:8080/ipfs/${carCid}/"
cmp -s /tmp/amorfus-kubo-path.html "${dist}/index.html" || { echo "path form bytes differ" >&2; exit 1; }
echo "ok path form"

curl -fso /tmp/amorfus-kubo-sub.html -H "Host: ${carCid}.ipfs.localhost:8080" "http://127.0.0.1:8080/"
cmp -s /tmp/amorfus-kubo-sub.html "${dist}/index.html" || { echo "subdomain form bytes differ" >&2; exit 1; }
echo "ok subdomain form"

kill "$DAEMON" 2>/dev/null || true
wait "$DAEMON" 2>/dev/null || true
`;

const r = spawnSync('npx', ['-y', '-p', 'kubo@0.43.1', 'bash', '-c', shell], {
  stdio: 'inherit',
  timeout: 10 * 60 * 1000,
});
if (r.status !== 0) {
  console.error('kubo-smoke: FAILED');
  process.exit(r.status ?? 1);
}
console.log('kubo-smoke: CID cross-check and both gateway forms pass');
