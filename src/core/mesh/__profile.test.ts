import { it } from 'vitest';
import { generateRegion, generateChunk } from '../gen/v1/index';
import { meshRegion } from './mesher';
import { buildGenMeshInput } from './gen-mesh';
import { CHUNK, packChunkKey, localIndex } from '../world/coords';
import { makeBlock } from '../world/block';

it('profile split: generate vs mesh, surface vs cave chunk', () => {
  const SEED: [number, number] = [1, 1];
  for (const [cx, cy, cz, label] of [[0, 0, 0, 'surface'], [0, -1, 0, 'cave'], [2, -2, 3, 'deep']] as const) {
    const n = CHUNK + 6;
    let t0 = performance.now();
    for (let i = 0; i < 3; i++) generateRegion(SEED, cx * 32 - 3, cy * 32 - 3, cz * 32 - 3, n, n, n);
    const genMs = (performance.now() - t0) / 3;
    const { input } = buildGenMeshInput(SEED, cx, cy, cz, new Map());
    t0 = performance.now();
    let m;
    for (let i = 0; i < 3; i++) m = meshRegion(input);
    const meshMs = (performance.now() - t0) / 3;
    const g = generateChunk(SEED, cx, cy, cz);
    console.log(
      `${label} (${cx},${cy},${cz}): generate ${genMs.toFixed(1)} ms, mesh ${meshMs.toFixed(1)} ms, ` +
        `quads ${m!.quadCount}, dense=${g.storage.kind === 'dense'}`,
    );
  }
});

it('pass-level profile', () => {
  const prof: Record<string, number> = {};
  (globalThis as { __MESH_PROF?: Record<string, number> }).__MESH_PROF = prof;
  const SEED: [number, number] = [1, 1];
  const { input } = buildGenMeshInput(SEED, 0, 0, 0, new Map());
  for (let i = 0; i < 5; i++) meshRegion(input);
  delete (globalThis as { __MESH_PROF?: Record<string, number> }).__MESH_PROF;
  console.log('passes(ms/5):', JSON.stringify(prof));
});

it('C-12: warm 8-chunk corner-edit remesh cost', () => {
  const SEED: [number, number] = [1, 1];
  // Corner edit at the chunk corner (0,0,0)-(31,31,31) junction dirties 8 chunks.
  const edits = new Map([[packChunkKey(0, 0, 0), new Map([[localIndex(0, 0, 0), makeBlock(5, false)]])]]);
  // warm up
  for (let i = 0; i < 3; i++) buildAndMesh(SEED, 0, 0, 0, edits);
  const t0 = performance.now();
  const dirty: Array<[number, number, number]> = [
    [0, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, -1], [-1, -1, 0], [-1, 0, -1], [0, -1, -1], [-1, -1, -1],
  ];
  for (const [cx, cy, cz] of dirty) buildAndMesh(SEED, cx, cy, cz, edits);
  const total = performance.now() - t0;
  console.log(`C-12: 8-chunk 52³ GEN_MESH total ${total.toFixed(1)} ms (${(total / 8).toFixed(1)} ms/chunk, serial)`);

  function buildAndMesh(seed: [number, number], cx: number, cy: number, cz: number, e: Map<number, Map<number, number>>): void {
    const { input } = buildGenMeshInput(seed, cx, cy, cz, e, { forceApron: 10 });
    meshRegion(input);
  }
});
