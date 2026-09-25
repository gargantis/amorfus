import { chromium } from '@playwright/test';
for (const headless of [true]) {
  const b = await chromium.launch({ headless, channel: 'chromium', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.goto('http://127.0.0.1:4180/');
  const r = await p.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter(); const d = await a.requestDevice();
    const c = document.getElementById('c'); c.width = 64; c.height = 64;
    const ctx = c.getContext('webgpu'); ctx.configure({ device: d, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const e = d.createCommandEncoder();
    const ps = e.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 1, b: 0, a: 1 }, storeOp: 'store' }] }); ps.end();
    d.queue.submit([e.finish()]);
    const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64; const g = c2.getContext('2d'); g.drawImage(c, 0, 0);
    const px = [...g.getImageData(10, 10, 1, 1).data];
    return px;
  });
  console.log('headless', headless, 'drawImage pixel', JSON.stringify(r));
  await b.close();
}
