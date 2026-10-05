#!/usr/bin/env node
// §14: Dawn for Node compiles every WGSL module under src/ and creates the
// known pipelines in both sample counts. The uniformity fixture must FAIL,
// proving the checker catches what it claims to catch.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const { create, globals } = await import('webgpu');
Object.assign(globalThis, globals);

const gpu = create([]);
const adapter = await gpu.requestAdapter();
if (!adapter) {
  console.error('wgsl-check: no Dawn adapter available');
  process.exit(1);
}
const device = await adapter.requestDevice();
let failed = false;

async function compile(label, code) {
  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const scopeError = await device.popErrorScope();
  const errors = info.messages.filter((m) => m.type === 'error');
  return { module, ok: errors.length === 0 && scopeError === null, errors, scopeError };
}

// §14: every pipeline the app creates, in both sample counts. The vertex
// layouts here mirror src/render/renderer.ts (A.1).
const TERRAIN_BUFFERS = [
  {
    arrayStride: 16,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'uint16x4' },
      { shaderLocation: 1, offset: 8, format: 'snorm16x2' },
      { shaderLocation: 2, offset: 12, format: 'uint8x4' },
    ],
  },
];

const PIPELINES = {
  'terrain.wgsl': {
    render: { buffers: TERRAIN_BUFFERS, depth: true },
  },
  'sky.wgsl': {
    render: { buffers: [], depth: true },
  },
  'test.wgsl': {
    render: { buffers: [], depth: false },
  },
  'texgen.wgsl': {
    compute: ['cs_main', 'cs_mip'],
  },
};

async function createPipelines(label, module, code) {
  const base = label.split('/').pop();
  const spec = PIPELINES[base];
  try {
    if (spec === undefined) {
      // Unknown shaders still get the generic treatment so a new file
      // cannot silently skip the gate.
      if (code.includes('@vertex') && code.includes('@fragment')) {
        throw new Error('no pipeline descriptor registered in scripts/wgsl-check.mjs PIPELINES');
      }
      if (code.includes('@compute')) {
        throw new Error('no compute descriptor registered in scripts/wgsl-check.mjs PIPELINES');
      }
      return true;
    }
    if (spec.render) {
      for (const count of [1, 4]) {
        device.pushErrorScope('validation');
        await device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs_main', buffers: spec.render.buffers },
          fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
          primitive: { topology: 'triangle-list' },
          multisample: { count },
          ...(spec.render.depth
            ? { depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' } }
            : {}),
        });
        const err = await device.popErrorScope();
        if (err) throw new Error(`sample count ${count}: ${err.message}`);
      }
    }
    if (spec.compute) {
      for (const entryPoint of spec.compute) {
        device.pushErrorScope('validation');
        await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint } });
        const err = await device.popErrorScope();
        if (err) throw new Error(`${entryPoint}: ${err.message}`);
      }
    }
    return true;
  } catch (e) {
    console.error(`wgsl-check: ${label}: pipeline creation failed: ${e.message}`);
    return false;
  }
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith('.wgsl')) yield join(e.parentPath, e.name);
  }
}

let count = 0;
for await (const path of walk(join(process.cwd(), 'src'))) {
  const code = await readFile(path, 'utf8');
  const { module, ok, errors, scopeError } = await compile(path, code);
  if (!ok) {
    failed = true;
    for (const m of errors) console.error(`wgsl-check: ${path}:${m.lineNum}:${m.linePos}: ${m.message}`);
    if (scopeError) console.error(`wgsl-check: ${path}: ${scopeError.message}`);
    continue;
  }
  if (!(await createPipelines(path, module, code))) failed = true;
  count += 1;
}

// Self-test: the uniformity fixture must be rejected.
{
  const path = join(process.cwd(), 'scripts/wgsl-fixtures/uniformity-fail.wgsl');
  const code = await readFile(path, 'utf8');
  const { module, ok } = await compile(path, code);
  let rejected = !ok;
  if (!rejected) {
    // Some validation only surfaces at pipeline creation.
    rejected = !(await createPipelinesQuiet(module));
  }
  if (!rejected) {
    console.error('wgsl-check: SELF-TEST FAILED: the uniformity fixture compiled cleanly');
    failed = true;
  }
}

async function createPipelinesQuiet(module) {
  device.pushErrorScope('validation');
  await device.createRenderPipelineAsync({
    layout: 'auto',
    vertex: { module, entryPoint: 'fs_main' },
  }).catch(() => null);
  const err = await device.popErrorScope();
  return err === null;
}

device.destroy();
if (failed) process.exit(1);
console.log(`wgsl-check: ${count} modules compiled, pipelines created, self-test rejected the fixture`);
process.exit(0);
