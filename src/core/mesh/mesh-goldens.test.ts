import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { meshGeneratedChunk, type EditsByChunk } from './gen-mesh';
import { generateChunk } from '../gen/v1/index';
import { packChunkKey, localIndex, CHUNK } from '../world/coords';
import { makeBlock } from '../world/block';
import goldens from './mesh-goldens.json';

// §14: golden hashes of 6 worlds — the full mesher pipeline (generator →
// hints → edits → guarded surface nets) frozen byte for byte.

const CASES: Array<{ seed: [number, number]; chunk: [number, number, number]; withEdits: boolean }> = [
  { seed: [1, 1], chunk: [0, 0, 0], withEdits: false },
  { seed: [7, 7], chunk: [3, 0, 2], withEdits: false },
  { seed: [42, 0], chunk: [-2, 0, -2], withEdits: false },
  { seed: [0xdeadbeef, 0x12345678], chunk: [1, -1, 1], withEdits: false },
  { seed: [5, 5], chunk: [0, 0, 0], withEdits: true },
  { seed: [9, 1], chunk: [-1, 0, 3], withEdits: true },
];

function editsFor(c: (typeof CASES)[number]): EditsByChunk {
  if (!c.withEdits) return new Map();
  const [cx, cy, cz] = c.chunk;
  const m = new Map<number, number>();
  m.set(localIndex(5, 28, 5), makeBlock(5, false)); // placed in air
  m.set(localIndex(6, 28, 5), makeBlock(6, true)); // sharp
  return new Map([[packChunkKey(cx, cy, cz), m]]);
}

function hashCase(c: (typeof CASES)[number]): string {
  const m = meshGeneratedChunk(c.seed, ...c.chunk, editsFor(c));
  const h = createHash('sha256');
  h.update(Buffer.from(m.vertexData));
  h.update(Buffer.from(m.indexData.buffer, m.indexData.byteOffset, m.indexData.byteLength));
  h.update(Buffer.from(m.pickRecords.buffer, m.pickRecords.byteOffset, m.pickRecords.byteLength));
  return h.digest('hex');
}

// D-24 freeze guard: once src/core/gen/v1/FROZEN exists (first public
// release), re-emission is forbidden — a changed hash is a determinism
// bug, never something to re-emit.
it.runIf(process.env.AMORFUS_EMIT_GOLDENS === '1')('emits mesh goldens', () => {
  if (existsSync(new URL('../gen/v1/FROZEN', import.meta.url).pathname) ||
      existsSync(new URL('./FROZEN', import.meta.url).pathname)) {
    throw new Error('generator v1 is FROZEN (D-24): goldens must not be re-emitted');
  }
  const out = CASES.map((c) => ({ ...c, hash: hashCase(c) }));
  writeFileSync(
    fileURLToPath(new URL('./mesh-goldens.json', import.meta.url)),
    `${JSON.stringify(out, null, 1)}\n`,
  );
});

describe('mesh goldens', () => {
  it('matches the frozen 6-world hashes', () => {
    expect((goldens as unknown[]).length).toBe(6);
    for (const g of goldens as Array<(typeof CASES)[number] & { hash: string }>) {
      expect(`${g.chunk.join(',')}:${hashCase(g)}`).toBe(`${g.chunk.join(',')}:${g.hash}`);
    }
  });
});

describe('budget proxies (§14 render)', () => {
  it('R=192 at the benchmark seed stays under the thresholds', { timeout: 300_000 }, () => {
    const SEED: [number, number] = [1, 1];
    const cr = Math.ceil(192 / CHUNK);
    let triangles = 0;
    let meshedChunks = 0;
    let denseChunks = 0;
    let genMs = 0;
    let meshed38 = 0;
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        if (dx * dx + dz * dz > cr * cr + 1) continue;
        for (let cy = -2; cy <= 4; cy++) {
          const g = generateChunk(SEED, dx, cy, dz);
          if (g.storage.kind === 'dense') denseChunks += 1;
          else continue;
          const t0 = performance.now();
          const m = meshGeneratedChunk(SEED, dx, cy, dz, new Map());
          genMs += performance.now() - t0;
          meshed38 += 1;
          if (m.quadCount > 0) {
            meshedChunks += 1;
            triangles += m.quadCount * 2;
          }
        }
      }
    }
    console.log(
      `budget proxies: ${triangles} tris, ${meshedChunks} meshed, ${denseChunks} dense ` +
        `(${((denseChunks * 32768 * 2) / 1048576).toFixed(1)} MiB voxels), ` +
        `GEN_MESH 38³ mean ${(genMs / Math.max(1, meshed38)).toFixed(1)} ms`,
    );
    // Thresholds: research proposal 1.5 M / 400 / 32 MiB, set as the gate
    // until M3 sign-off tightens them.
    expect(triangles).toBeLessThan(1_500_000);
    expect(meshedChunks).toBeLessThan(400);
    expect(denseChunks * 32768 * 2).toBeLessThan(32 * 1024 * 1024);
  });
});
