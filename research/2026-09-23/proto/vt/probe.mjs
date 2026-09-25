import { chromium } from '@playwright/test';
const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const flagsets = { none: [], unsafe: ['--enable-unsafe-webgpu'],
  swiftshader: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader'],
  swiftshaderVk: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-angle=swiftshader'] };
for (const channel of [undefined, 'chromium']) {
 for (const [name, args] of Object.entries(flagsets)) {
  const browser = await chromium.launch({ args, channel });
  for (const url of ['http://127.0.0.1:4180/', `http://127.0.0.1:4180/ipfs/${CID}`]) {
    const page = await browser.newPage(); const bad = [];
    page.on('requestfailed', r => bad.push('FAILED ' + r.url()));
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    page.on('pageerror', e => bad.push('PAGEERROR ' + e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__workerResult && window.__lazy, null, { timeout: 5000 }).catch(e => bad.push('TIMEOUT'));
    const r = await page.evaluate(async () => {
      let adapter = null, info = null;
      if (navigator.gpu) { try { adapter = await navigator.gpu.requestAdapter(); info = adapter && (adapter.info ? { vendor: adapter.info.vendor, arch: adapter.info.architecture, desc: adapter.info.description, fallback: adapter.info.isFallbackAdapter } : 'no info'); } catch (e) { info = 'ERR ' + e.message; } }
      return { href: location.href, gpu: !!navigator.gpu, adapter: !!adapter, info, worker: window.__workerResult, lazy: window.__lazy, base: window.__base, coi: self.crossOriginIsolated, sab: typeof SharedArrayBuffer };
    });
    console.log(channel ?? 'headless-shell', name, JSON.stringify(r), bad.length ? bad : 'no failed requests');
    await page.close();
  }
  await browser.close();
 }
}
