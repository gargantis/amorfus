import { create, globals } from 'webgpu';
Object.assign(globalThis, globals);
const gpu = create([]);
const t0 = performance.now();
const adapter = await gpu.requestAdapter();
console.log('adapter', adapter && adapter.info, (performance.now()-t0).toFixed(0)+'ms');
if (adapter) {
  const device = await adapter.requestDevice();
  const bad = device.createShaderModule({ code: '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0, 2.0); }' });
  const info = await bad.getCompilationInfo();
  console.log('errors:', info.messages.map(m => `${m.type} ${m.lineNum}:${m.linePos} ${m.message}`));
  device.destroy();
}
process.exit(0);
