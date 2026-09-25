import { chromium } from '@playwright/test';
for (const args of [['--enable-unsafe-webgpu'], []]) {
  const b = await chromium.launch({ args }); const p = await b.newPage();
  await p.goto('http://127.0.0.1:4180/');
  const t0 = Date.now();
  const r = await p.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter(); if (!a) return 'no-adapter';
    const d = await a.requestDevice(); const c = document.getElementById('c'); c.width = 64; c.height = 64;
    const ctx = c.getContext('webgpu'); const fmt = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: d, format: fmt, alphaMode: 'opaque' });
    const enc = d.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 1, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
    pass.end(); d.queue.submit([enc.finish()]); await d.queue.onSubmittedWorkDone();
    return { fmt, limits: { maxBufferSize: a.limits.maxBufferSize, maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxComputeWorkgroupSizeX: a.limits.maxComputeWorkgroupSizeX }, features: [...a.features] };
  });
  await new Promise(r => setTimeout(r, 200));
  const png = await p.locator('#c').screenshot();
  console.log(JSON.stringify(args), JSON.stringify(r), 'screenshot bytes', png.length, 'ms', Date.now() - t0);
  await b.close();
}
