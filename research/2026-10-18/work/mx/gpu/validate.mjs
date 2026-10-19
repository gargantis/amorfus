// Compile mx.wgsl with Dawn (the repo's `webgpu` package; llvmpipe here) and
// compare GPU results with the JS emulation on fragment samples from real
// terrain chunks and scenes. Inputs are rounded to f32 for both.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as core from '../../../harness/core.mjs';
import { ALL_SCENES } from '../../../harness/scenes.mjs';
import { buildGenMeshInput } from '../../../lib/gen-mesh.mjs';
import { prep, computeCodes, buildTexels, fragmentGpu, DEFAULTS } from '../prod.mjs';
const require = createRequire('../../../../..');
const { create, globals } = require('webgpu');
Object.assign(globalThis, globals);
const gpu = create([]);
const adapter = await gpu.requestAdapter();
const device = await adapter.requestDevice();
const code = readFileSync(new URL('./mx.wgsl', import.meta.url), 'utf8');
const module = device.createShaderModule({ code });
const info = await module.getCompilationInfo();
for (const m of info.messages) console.log(`WGSL ${m.type}: ${m.message} (line ${m.lineNum})`);
const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'cs_main' } });
const OPTS = { ...DEFAULTS, loneRound: true };
async function check(label, region) {
  const P = prep(region);
  const { codes } = computeCodes(P, OPTS);
  const G = buildTexels(P, codes, 3);
  const mesh = core.decodeMesh(core.meshRegion({ ...region, params: {} }));
  // samples: 12 per triangle (fixed barycentrics), f32-rounded
  const pts = [], nrm = [];
  const B = [[1 / 3, 1 / 3], [0.1, 0.1], [0.8, 0.1], [0.1, 0.8], [0.45, 0.45], [0.05, 0.5], [0.5, 0.05], [0.6, 0.3], [0.3, 0.6], [0.2, 0.2], [0.7, 0.15], [0.15, 0.7]];
  for (let t = 0; t < mesh.T; t++) {
    const a = mesh.tri[t * 3], b = mesh.tri[t * 3 + 1], c = mesh.tri[t * 3 + 2];
    if (mesh.flags[a] & 1) continue;
    for (const [w0, w1] of B) {
      const w2 = 1 - w0 - w1;
      for (let k = 0; k < 3; k++) {
        pts.push(Math.fround(w0 * mesh.pos[a * 3 + k] + w1 * mesh.pos[b * 3 + k] + w2 * mesh.pos[c * 3 + k]));
        nrm.push(Math.fround(w0 * mesh.nrm[a * 3 + k] + w1 * mesh.nrm[b * 3 + k] + w2 * mesh.nrm[c * 3 + k]));
      }
      pts.push(0); nrm.push(0);
    }
  }
  const n = pts.length / 4;
  const tex = device.createTexture({ size: [G.N, G.N, G.N], dimension: '3d', format: 'r32uint', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: tex }, G.tex, { bytesPerRow: G.N * 4, rowsPerImage: G.N }, [G.N, G.N, G.N]);
  const mk = (data, usage) => { const buf = device.createBuffer({ size: Math.max(16, data.byteLength), usage: usage | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(buf, 0, data); return buf; };
  const cw = G.codeWords.length ? G.codeWords : new Uint32Array(4);
  const bCodes = mk(cw, GPUBufferUsage.STORAGE);
  const bPts = mk(new Float32Array(pts), GPUBufferUsage.STORAGE);
  const bN = mk(new Float32Array(nrm), GPUBufferUsage.STORAGE);
  const bOut = device.createBuffer({ size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bF = device.createBuffer({ size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bRead = device.createBuffer({ size: n * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
    { binding: 0, resource: tex.createView() }, { binding: 1, resource: { buffer: bCodes } }, { binding: 2, resource: { buffer: bPts } },
    { binding: 3, resource: { buffer: bN } }, { binding: 4, resource: { buffer: bOut } }, { binding: 5, resource: { buffer: bF } }] });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(Math.ceil(n / 64)); pass.end();
  enc.copyBufferToBuffer(bOut, 0, bRead, 0, n * 4);
  enc.copyBufferToBuffer(bF, 0, bRead, n * 4, n * 4);
  device.queue.submit([enc.finish()]);
  await bRead.mapAsync(GPUMapMode.READ);
  const res = new Uint32Array(bRead.getMappedRange().slice(0));
  bRead.unmap();
  let diff = 0, fsum = 0, coded = 0;
  const st = { fetch: 0, code: 0, noSurface: 0, sharp: 0, oob: 0 };
  for (let i = 0; i < n; i++) {
    const js = fragmentGpu(G, [nrm[i * 4], nrm[i * 4 + 1], nrm[i * 4 + 2]], pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], 2, st, 0.5);
    const g = res[i] === 0xffffffff ? -1 : res[i];
    if (g !== js) diff++;
    fsum += res[n + i];
  }
  console.log(`${label}: ${n} samples, codes ${G.codeWords.length / 2}, GPU≠JS ${diff}, mean loads/fragment GPU ${(fsum / n).toFixed(3)} JS ${(st.fetch / n).toFixed(3)} (code loads ${(st.code / n).toFixed(3)})`);
  return diff;
}
let bad = 0;
for (const c of [[-1, 1, 1], [0, 0, -3], [-3, 1, 0], [1, 1, 1]]) bad += await check(`terrain ${c}`, buildGenMeshInput([1, 1], c[0], c[1], c[2], new Map(), { forceApron: 10 }).input);
for (const s of ['hill-materials', 'line1-1:1', 'junction3', 'single', 'checker']) bad += await check(s, core.buildRegion(ALL_SCENES.find((x) => x.name === s).cell, 10));
console.log(bad === 0 ? 'WGSL == JS on all samples' : `total mismatches ${bad}`);
process.exit(0);
