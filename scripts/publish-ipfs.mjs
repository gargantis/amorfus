#!/usr/bin/env node
// §13.5 publish: upload the release CAR to Filebase (S3-compatible, CAR
// import), verify the CID, then walk the operator through the manual
// DNSLink update (D-6) and record the release. EVERY first-time external
// action needs the owner's explicit go-ahead: this script refuses to run
// without AMORFUS_CONFIRM=yes.
import { spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

if (process.env.AMORFUS_CONFIRM !== 'yes') {
  console.error(
    'publish-ipfs: refusing to publish without AMORFUS_CONFIRM=yes.\n' +
      'This uploads to Filebase and changes what amorf.us users can load.\n' +
      'Run check:release and probe:relays first; both must be green.',
  );
  process.exit(1);
}

const key = process.env.FILEBASE_KEY;
const secret = process.env.FILEBASE_SECRET;
const bucket = process.env.FILEBASE_BUCKET;
if (!key || !secret || !bucket) {
  console.error('publish-ipfs: FILEBASE_KEY, FILEBASE_SECRET and FILEBASE_BUCKET must be set (D-6).');
  process.exit(1);
}

for (const step of [['run', 'check:release'], ['run', 'probe:relays']]) {
  const r = spawnSync('npm', step, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const cidOut = spawnSync('node', ['scripts/cid.mjs'], { encoding: 'utf8' });
if (cidOut.status !== 0) process.exit(1);
const cid = cidOut.stdout.trim();
const car = join(root, '.cache', 'release.car');
const objectName = `amorfus-${cid}.car`;

// curl --aws-sigv4 signs the S3 PUT; the metadata header asks Filebase to
// import the object as a CAR.
const put = spawnSync('curl', [
  '--fail-with-body', '--silent', '--show-error',
  '--aws-sigv4', 'aws:amz:us-east-1:s3',
  '--user', `${key}:${secret}`,
  '-T', car,
  '-H', 'x-amz-meta-import: car',
  `https://s3.filebase.com/${bucket}/${objectName}`,
], { stdio: 'inherit' });
if (put.status !== 0) {
  console.error('publish-ipfs: upload failed');
  process.exit(1);
}

// Verify Filebase computed the same root CID. The header that carries it is
// confirmed in the M0 pipeline spike; HEAD prints all of them for the eye.
const head = spawnSync('curl', [
  '--silent', '--head',
  '--aws-sigv4', 'aws:amz:us-east-1:s3',
  '--user', `${key}:${secret}`,
  `https://s3.filebase.com/${bucket}/${objectName}`,
], { encoding: 'utf8' });
process.stdout.write(head.stdout);
const m = head.stdout.match(/x-amz-meta-cid:\s*(\S+)/i);
if (!m) {
  console.error('publish-ipfs: no x-amz-meta-cid header found — verify the CID in the Filebase console before updating DNSLink.');
} else if (m[1] !== cid) {
  console.error(`publish-ipfs: CID MISMATCH — local ${cid}, Filebase ${m[1]}. Do not update DNSLink.`);
  process.exit(1);
} else {
  console.log(`publish-ipfs: Filebase confirms ${cid}`);
}

const tag = spawnSync('git', ['describe', '--always', '--tags'], { encoding: 'utf8' }).stdout.trim();
await appendFile(
  join(root, 'RELEASES.md'),
  `- ${new Date().toISOString().slice(0, 10)} — \`${cid}\` — git ${tag}\n`,
).catch(async () => {
  const header = '# Releases\n\nEach line: date — root CID — git ref.\n\n';
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(root, 'RELEASES.md'), `${header}- ${new Date().toISOString().slice(0, 10)} — \`${cid}\` — git ${tag}\n`);
});

console.log(
  `\nManual DNSLink step (D-6): set the TXT record\n` +
    `  _dnslink.amorf.us  ->  dnslink=/ipfs/${cid}\n` +
    `then run scripts/verify-live.mjs once it propagates.`,
);
