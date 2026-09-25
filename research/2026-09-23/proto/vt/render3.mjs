import { chromium } from '@playwright/test';
const sets = [
  ['--enable-unsafe-webgpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--enable-features=Vulkan,SkiaGraphite', '--use-angle=swiftshader'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--disable-features=WebGPUSharedImageSupport'],
  ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--enable-dawn-features=allow_unsafe_apis', '--disable-dawn-features=disallow_unsafe_apis', '--use-angle=vulkan', '--enable-features=Vulkan', '--use-vulkan=swiftshader'],
];
for (const args of sets) {
  const b = await chromium.launch({ args, channel: 'chromium' }); const p = await b.newPage();
  await p.goto('http://127.0.0.1:4180/');
  const r = await p.evaluate(async () => {
    const out = {};
    try {
      const a = await navigator.gpu.requestAdapter(); const d = await a.requestDevice();
      // offscreen render to texture + readback
      const tex = d.createTexture({ size: [4, 4], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      const buf = d.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const e = d.createCommandEncoder();
      const pass = e.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', clearValue: { r: 1, g: 0, b: 0, a: 1 }, storeOp: 'store' }] }); pass.end();
      e.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: 256 }, [4, 4]); d.queue.submit([e.finish()]);
      await buf.mapAsync(GPUMapMode.READ); out.px = [...new Uint8Array(buf.getMappedRange(), 0, 4)]; buf.unmap();
      const c = document.getElementById('c'); const ctx = c.getContext('webgpu');
      ctx.configure({ device: d, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'opaque' }); out.configured = true;
      const e2 = d.createCommandEncoder();
      const p2 = e2.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 1, b: 0, a: 1 }, storeOp: 'store' }] }); p2.end();
      d.queue.submit([e2.finish()]); await d.queue.onSubmittedWorkDone(); out.canvas = true;
    } catch (e) { out.err = e.message.slice(0, 80); }
    return out;
  });
  console.log(JSON.stringify(args.slice(1)), JSON.stringify(r));
  await b.close();
}
