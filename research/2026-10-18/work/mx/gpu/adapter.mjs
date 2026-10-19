import { createRequire } from 'node:module';
const require = createRequire('../../../../..');
const { create, globals } = require('webgpu');
Object.assign(globalThis, globals);
for (const opts of [[], ['backend=vulkan'], ['backend=null']]) {
  try {
    const gpu = create(opts);
    for (const pp of ['high-performance', 'low-power', undefined]) {
      const ad = await gpu.requestAdapter(pp ? { powerPreference: pp } : undefined);
      if (!ad) { console.log(opts, pp, 'no adapter'); continue; }
      const info = ad.info ?? (await ad.requestAdapterInfo?.());
      console.log(JSON.stringify(opts), pp, info?.vendor, '|', info?.architecture, '|', info?.device, '|', info?.description, '| fallback', ad.isFallbackAdapter);
    }
  } catch (e) { console.log(opts, 'error', e.message); }
}
process.exit(0);
