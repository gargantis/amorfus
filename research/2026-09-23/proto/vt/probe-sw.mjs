import { chromium } from '@playwright/test';
const CID = process.argv[2];
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
const ctx = await b.newContext(); const p = await ctx.newPage(); const bad = []; const seen = [];
ctx.on('requestfailed', r => bad.push('FAILED ' + r.url() + ' ' + r.failure()?.errorText));
ctx.on('response', r => { seen.push([r.status(), r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 60), r.headers()['content-type'], r.fromServiceWorker()]); if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
p.on('pageerror', e => bad.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error') bad.push('CONSOLE ' + m.text().slice(0, 200)); });
await p.goto(`http://localhost:3000/ipfs/${CID}/`);
await p.waitForFunction(() => window.__workerResult && window.__lazy, null, { timeout: 60000 }).catch(() => bad.push('TIMEOUT'));
const r = await p.evaluate(() => ({ href: location.href, worker: window.__workerResult, lazy: window.__lazy, v: window.__v, sw: navigator.serviceWorker.controller?.scriptURL, coi: crossOriginIsolated })).catch(e => e.message);
console.log(JSON.stringify(r)); console.log(bad.length ? bad.slice(0, 10) : 'no failed requests');
for (const s of seen.filter(s => /assets|\/$|favicon|manifest/.test(s[1]))) console.log('  ', JSON.stringify(s));
// wasm streaming check through SW
const w = await p.evaluate(async () => { try { const r = await fetch(new URL('./assets/mod-BYieBQW-.wasm', location.href)); const ct = r.headers.get('content-type'); try { await WebAssembly.compileStreaming(r); return ct + ' compileStreaming ok'; } catch (e) { return ct + ' compileStreaming ERR ' + e.message; } } catch (e) { return 'ERR ' + e.message; } }).catch(e => e.message);
console.log('wasm:', w);
await b.close();
