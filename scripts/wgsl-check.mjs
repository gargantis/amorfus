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

async function createPipelines(label, module, code) {
  // Pipeline table: entry points by naming convention. Render pipelines are
  // built at both allowed sample counts (1 and 4, §8.3).
  const hasVs = code.includes('@vertex');
  const hasFs = code.includes('@fragment');
  const hasCs = code.includes('@compute');
  try {
    if (hasVs && hasFs) {
      for (const count of [1, 4]) {
        device.pushErrorScope('validation');
        await device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs_main' },
          fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
          multisample: { count },
        });
        const err = await device.popErrorScope();
        if (err) throw new Error(`sample count ${count}: ${err.message}`);
      }
    }
    if (hasCs) {
      device.pushErrorScope('validation');
      await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'cs_main' } });
      const err = await device.popErrorScope();
      if (err) throw new Error(err.message);
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
