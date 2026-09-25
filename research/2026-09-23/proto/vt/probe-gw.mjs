import { chromium } from '@playwright/test';
const CID = process.argv[2];
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
for (const url of [`http://127.0.0.1:8089/ipfs/${CID}`, `http://${CID}.ipfs.localhost:8089/`]) {
  const p = await b.newPage(); const bad = [];
  p.on('requestfailed', r => bad.push('FAILED ' + r.url()));
  p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  p.on('pageerror', e => bad.push('PAGEERROR ' + e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__workerResult && window.__lazy, null, { timeout: 8000 }).catch(() => bad.push('TIMEOUT'));
  const r = await p.evaluate(() => ({ href: location.href, origin: location.origin, worker: !!window.__workerResult, lazy: !!window.__lazy, coi: crossOriginIsolated, sab: typeof SharedArrayBuffer, sw: 'serviceWorker' in navigator }));
  console.log(JSON.stringify(r), bad.length ? bad : 'no failed requests');
}
await b.close();
