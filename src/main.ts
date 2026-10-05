import './style.css';
import { gpuInit } from './render/gpu-init';
import { messageFor } from './ui/gpu-messages';
import { showMessage } from './ui/show-message';
import testShaderSrc from './render/shaders/test.wgsl?raw';

// M0 entry: boot checks passed (boot.js), so initialise WebGPU, draw the
// test shader, and prove the module worker path. The world arrives in M1+.

window.__amorfusBootReady?.();

const TEST_MODE = /(^|[#&])test=/.test(location.hash);

async function start(): Promise<void> {
  const init = await gpuInit();
  if (init.kind !== 'ok') {
    showMessage(messageFor(init));
    return;
  }
  if (init.isFallback) showMessage(messageFor({ kind: 'fallback-adapter' }));

  const { device } = init;
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') {
      showMessage(messageFor({ kind: 'device-lost', storage: 'stable' }));
    }
  });

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu');
  if (context === null) {
    showMessage(messageFor({ kind: 'device-rejected', reason: 'no webgpu canvas context' }));
    return;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const module = device.createShaderModule({ code: testShaderSrc });
  // §8.2: every pipeline is created async before the first frame.
  const pipeline = await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const fallback = document.getElementById('fallback');
  if (fallback) fallback.hidden = true;
  canvas.hidden = false;

  const hooks = TEST_MODE ? installTestHooks(device) : null;

  const frame = (): void => {
    const view = context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' }],
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    if (hooks) hooks.frames += 1;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Worker probe: a module worker with a nested dynamic import (§13.2).
  const worker = new Worker(new URL('./workers/gen-mesh.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; nested?: string };
    if (data.type === 'pong' && data.nested === 'nested-import-ok' && hooks) {
      hooks.workerOk = true;
    }
  };
  worker.postMessage({ type: 'ping' });
}

function installTestHooks(device: GPUDevice): AmorfusTestHooks {
  const hooks: AmorfusTestHooks = {
    frames: 0,
    workerOk: false,
    // Offscreen render-to-texture readback (§14): the e2e webgpu project
    // checks pixels without screenshotting SwiftShader's canvas path.
    readCenterPixel: async () => {
      const size = 16;
      const tex = device.createTexture({
        size: [size, size],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const module = device.createShaderModule({ code: testShaderSrc });
      const p = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      });
      const buf = device.createBuffer({
        size: 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { view: tex.createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' },
        ],
      });
      pass.setPipeline(p);
      pass.draw(3);
      pass.end();
      encoder.copyTextureToBuffer(
        { texture: tex, origin: [size / 2, size / 2] },
        { buffer: buf, bytesPerRow: 256 },
        [1, 1],
      );
      device.queue.submit([encoder.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(buf.getMappedRange(0, 4)).slice();
      buf.unmap();
      tex.destroy();
      return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0];
    },
  };
  window.__amorfus = hooks;
  return hooks;
}

void start();
