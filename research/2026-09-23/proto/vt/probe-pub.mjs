import { chromium } from '@playwright/test';
const C = 'bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq';
const b = await chromium.launch({ channel: 'chromium' });
for (const url of [`https://ipfs.io/ipfs/${C}/`, `https://dweb.link/ipfs/${C}/`, `https://inbrowser.link/ipfs/${C}/`]) {
  const ctx = await b.newContext(); const p = await ctx.newPage(); const hdrs = [];
  p.on('response', async r => { if (r.request().resourceType() === 'document') { const h = await r.allHeaders(); hdrs.push([r.status(), r.url().slice(0, 90), h['content-type'], h['cross-origin-opener-policy'] ?? '-', h['cross-origin-embedder-policy'] ?? '-', (h['content-security-policy'] ?? '-').slice(0, 120), r.fromServiceWorker()]); } });
  try { await p.goto(url, { timeout: 45000, waitUntil: 'load' }); await p.waitForTimeout(8000); } catch (e) { hdrs.push('ERR ' + e.message.slice(0, 80)); }
  const r = await p.evaluate(() => ({ href: location.href, title: document.title.slice(0, 60), coi: crossOriginIsolated, sw: navigator.serviceWorker?.controller?.scriptURL ?? null })).catch(e => e.message);
  console.log(url.slice(0, 40), JSON.stringify(r)); for (const h of hdrs) console.log('   ', JSON.stringify(h));
  await ctx.close();
}
await b.close();
