#!/usr/bin/env node
// §13.4/§13.5: after a deploy or publish, verify what the world actually
// serves. amorf.us HTML must hash-match dist/index.html (catches injected
// analytics, C-15); a delegated routing endpoint must list a provider for
// the CID and a trustless gateway must return the root block.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
let failed = false;

// 1. amorf.us HTML hash.
try {
  const live = Buffer.from(await (await fetch('https://amorf.us/', { redirect: 'error' })).arrayBuffer());
  const local = await readFile(join(root, 'dist', 'index.html'));
  const h = (b) => createHash('sha256').update(b).digest('hex');
  if (h(live) === h(local)) console.log('verify-live: amorf.us serves exactly dist/index.html');
  else {
    console.error('verify-live: amorf.us HTML differs from dist/index.html — investigate before announcing');
    failed = true;
  }
} catch (e) {
  console.error(`verify-live: amorf.us fetch failed: ${e.message}`);
  failed = true;
}

// 2. IPFS routing + block availability for the released CID.
const cid = process.argv[2];
if (!cid) {
  console.log('verify-live: pass the released CID to also check IPFS routing');
} else {
  try {
    const r = await fetch(`https://delegated-ipfs.dev/routing/v1/providers/${cid}`);
    const body = r.ok ? await r.json() : null;
    const n = body?.Providers?.length ?? 0;
    if (n > 0) console.log(`verify-live: delegated routing lists ${n} provider(s)`);
    else {
      console.error('verify-live: no providers listed (yet) — fallback: ipfs routing findprovs from the release kubo');
      failed = true;
    }
  } catch (e) {
    console.error(`verify-live: routing endpoint failed (${e.message}) — operator undetermined after 2026-09-30; update third-party.json if it moved`);
    failed = true;
  }
  try {
    const b = await fetch(`https://trustless-gateway.net/ipfs/${cid}?format=raw`, {
      headers: { accept: 'application/vnd.ipld.raw' },
    });
    if (b.ok) console.log('verify-live: trustless gateway returned the root block');
    else {
      console.error(`verify-live: trustless gateway -> ${b.status}`);
      failed = true;
    }
  } catch (e) {
    console.error(`verify-live: trustless gateway failed: ${e.message}`);
    failed = true;
  }
  console.log('verify-live: finally, eyeball https://inbrowser.link/ipfs/' + cid + ' by hand (best effort, C-4)');
}

process.exit(failed ? 1 : 0);
