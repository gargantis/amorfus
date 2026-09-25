import { mat4, vec3 } from 'wgpu-matrix';
const out: any = {};
const adapter = (await navigator.gpu.requestAdapter())!;
const device = await adapter.requestDevice();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('webgpu')!;
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });
const code = `
struct Cam { vp: mat4x4f, sun: vec4f };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var<storage, read> chunkOrigin: array<vec4f>;
struct VO { @builtin(position) p: vec4f, @location(0) n: vec3f };
@vertex fn vs(@location(0) pos: vec4f, @location(1) nrm: vec4f, @builtin(instance_index) inst: u32) -> VO {
  var o: VO; o.p = cam.vp * vec4f(pos.xyz + chunkOrigin[inst].xyz, 1); o.n = nrm.xyz; return o; }
@fragment fn fs(i: VO) -> @location(0) vec4f { let l = max(dot(normalize(i.n), cam.sun.xyz), 0.0) * 0.8 + 0.2; return vec4f(vec3f(0.5, 0.7, 0.3) * l, 1); }`;
const mod = device.createShaderModule({ code });
const pipe = device.createRenderPipeline({ layout: 'auto',
  vertex: { module: mod, buffers: [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] }] },
  fragment: { module: mod, targets: [{ format }] }, primitive: { cullMode: 'back' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' } });
const depth = device.createTexture({ size: [256, 256], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
async function bench(N: number) {
  // one cube (24 verts, 36 idx) per chunk, all in ONE shared vertex/index buffer
  const VPC = 24, IPC = 36;
  const vb = device.createBuffer({ size: N * VPC * 32, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  const ib = device.createBuffer({ size: N * IPC * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  const verts = new Float32Array(N * VPC * 8); const idx = new Uint32Array(N * IPC);
  for (let c = 0; c < N; c++) for (let f = 0; f < 6; f++) { for (let k = 0; k < 4; k++) { const o = (c * VPC + f * 4 + k) * 8; verts[o] = k & 1; verts[o + 1] = (k >> 1) & 1; verts[o + 2] = f / 6; verts[o + 3] = 1; verts[o + 4 + (f % 3)] = 1; }
    const b = f * 4; idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], c * IPC + f * 6); }
  device.queue.writeBuffer(vb, 0, verts); device.queue.writeBuffer(ib, 0, idx);
  const origins = new Float32Array(N * 4); const side = Math.ceil(Math.sqrt(N));
  for (let i = 0; i < N; i++) { origins[i * 4] = (i % side) - side / 2; origins[i * 4 + 2] = Math.floor(i / side) - side / 2; }
  const sb = device.createBuffer({ size: origins.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(sb, 0, origins);
  const ub = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 1, resource: { buffer: sb } }] });
  const camData = new Float32Array(20); const planes = new Float32Array(24); const order = new Uint32Array(N); const dist = new Float32Array(N);
  const frame = (t: number) => {
    const proj = mat4.perspective(1.2, 1, 0.1, 5000); const view = mat4.lookAt(vec3.create(Math.sin(t) * 0.01, 50, 0.001), vec3.create(0, 0, 0), vec3.create(0, 1, 0));
    const vp = mat4.multiply(proj, view); camData.set(vp, 0); camData.set([0.3, 0.9, 0.3, 0], 16); device.queue.writeBuffer(ub, 0, camData);
    // Gribb-Hartmann planes from column-major vp
    const m = vp; const row = (r: number) => [m[r], m[4 + r], m[8 + r], m[12 + r]];
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    const P = [r3.map((v, i) => v + r0[i]), r3.map((v, i) => v - r0[i]), r3.map((v, i) => v + r1[i]), r3.map((v, i) => v - r1[i]), r2, r3.map((v, i) => v - r2[i])];
    for (let p = 0; p < 6; p++) planes.set(P[p], p * 4);
    let vis = 0;
    for (let i = 0; i < N; i++) { const x = origins[i * 4], y = 0, z = origins[i * 4 + 2]; let inside = true;
      for (let p = 0; p < 6 && inside; p++) { const a = planes[p * 4], b = planes[p * 4 + 1], c = planes[p * 4 + 2], d = planes[p * 4 + 3];
        const px = a >= 0 ? x + 1 : x, py = b >= 0 ? y + 1 : y, pz = c >= 0 ? z + 1 : z; if (a * px + b * py + c * pz + d < 0) inside = false; }
      if (inside) { order[vis] = i; dist[i] = x * x + z * z; vis++; } }
    const visible = order.subarray(0, vis).sort((a, b) => dist[a] - dist[b]);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0.5, 0.7, 0.9, 1] }], depthStencilAttachment: { view: depth.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 } });
    pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.setVertexBuffer(0, vb); pass.setIndexBuffer(ib, 'uint32');
    for (let k = 0; k < visible.length; k++) { const c = visible[k]; pass.drawIndexed(IPC, 1, c * IPC, c * VPC, c); }
    pass.end(); device.queue.submit([enc.finish()]);
    return vis;
  };
  for (let i = 0; i < 30; i++) { frame(i); await new Promise(requestAnimationFrame); }
  const t: number[] = []; let vis = 0;
  for (let i = 0; i < 60; i++) { const t0 = performance.now(); vis = frame(i); t.push(performance.now() - t0); await new Promise(requestAnimationFrame); }
  t.sort((a, b) => a - b); out[`n${N}_frameJsMsMedian`] = +t[30].toFixed(2); out[`n${N}_visible`] = vis;
  vb.destroy(); ib.destroy(); sb.destroy(); ub.destroy();
}
try { for (const n of [500, 2000]) await bench(n); } catch (e) { out.error = String(e); }
(window as any).__out = out; document.title = 'done';
