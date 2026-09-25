import { chromium } from '@playwright/test';
const sets = [
  ['--enable-unsafe-webgpu'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader'],
  ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'],
];
for (const channel of [undefined, 'chromium']) for (const args of sets) {
  const b = await chromium.launch({ args, channel }); const p = await b.newPage();
  const logs = []; p.on('console', m => logs.push(m.text()));
  await p.goto('http://127.0.0.1:4180/');
  const r = await p.evaluate(async () => {
    const out = {};
    try {
      const a = await navigator.gpu?.requestAdapter(); if (!a) return 'no-adapter';
      out.adapter = a.info?.architecture;
      const d = await a.requestDevice(); out.device = true;
      d.lost.then(i => console.log('LOST', i.reason, i.message));
      const buf = d.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const src = d.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
      new Uint32Array(src.getMappedRange()).set([1,2,3,4]); src.unmap();
      const e = d.createCommandEncoder(); e.copyBufferToBuffer(src, 0, buf, 0, 16); d.queue.submit([e.finish()]);
      await buf.mapAsync(GPUMapMode.READ); out.copy = [...new Uint32Array(buf.getMappedRange())];
      const c = document.getElementById('c'); c.width = 64; c.height = 64;
      const ctx = c.getContext('webgpu'); out.fmt = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device: d, format: out.fmt, alphaMode: 'opaque' });
      const enc = d.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 1, g: 0, b: 0, a: 1 }, storeOp: 'store' }] });
      pass.end(); d.queue.submit([enc.finish()]); await d.queue.onSubmittedWorkDone(); out.rendered = true;
    } catch (e) { out.err = e.name + ': ' + e.message; }
    return out;
  });
  let px = null;
  if (r.rendered) { await new Promise(r => setTimeout(r, 300)); const png = await p.locator('#c').screenshot(); px = png.length; }
  console.log(channel ?? 'shell', JSON.stringify(args.slice(1)), JSON.stringify(r), 'png', px, logs.filter(l => /LOST|WebGPU|error/i.test(l)).slice(0,3));
  await b.close();
}
