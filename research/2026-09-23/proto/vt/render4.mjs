import { chromium } from '@playwright/test'; import { PNG } from 'pngjs';
const sets = [
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--enable-features=Vulkan', '--use-angle=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
];
for (const channel of [undefined, 'chromium']) for (const args of sets) {
  const b = await chromium.launch({ args, channel }); const p = await b.newPage({ viewport: { width: 200, height: 200 } });
  await p.goto('http://127.0.0.1:4180/');
  const r = await p.evaluate(async () => {
    try {
      const a = await navigator.gpu.requestAdapter(); const d = await a.requestDevice();
      const c = document.getElementById('c'); c.width = 64; c.height = 64; c.style.width='64px'; c.style.height='64px';
      const ctx = c.getContext('webgpu'); ctx.configure({ device: d, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' });
      for (let i = 0; i < 3; i++) { const e = d.createCommandEncoder();
        const ps = e.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 1, b: 0, a: 1 }, storeOp: 'store' }] }); ps.end();
        d.queue.submit([e.finish()]); await new Promise(r => requestAnimationFrame(r)); }
      await d.queue.onSubmittedWorkDone(); return 'ok';
    } catch (e) { return 'ERR ' + e.message.slice(0, 60); }
  });
  let px = null;
  if (r === 'ok') { const png = PNG.sync.read(await p.locator('#c').screenshot()); const i = (png.width * 10 + 10) * 4; px = [...png.data.slice(i, i + 4)]; }
  console.log(channel ?? 'shell', JSON.stringify(args.slice(1)), r, 'pixel', JSON.stringify(px));
  await b.close();
}
