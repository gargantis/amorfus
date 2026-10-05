import { it } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateChunk } from './index';

// Not a test: the golden EMITTER. It runs only with AMORFUS_EMIT_GOLDENS=1,
// regenerates goldens.json, and must only ever be used when the generator
// version is being created — never to "fix" a failing golden (C-10: a
// changed hash on an existing generator version is a determinism bug).
it.runIf(process.env.AMORFUS_EMIT_GOLDENS === '1')('emits golden hashes', () => {
  const seeds: Array<[number, number]> = [
    [0xdeadbeef, 0x12345678],
    [1, 2],
    [0xffffffff, 0],
  ];
  const chunks: Array<[number, number, number]> = [
    [0, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, -1],
    [0, 1, 0], [3, -1, 2], [5, -2, 7], [-4, -2, 9],
    [131072, 0, 0], [-131072, 0, -131072], [0, -8, 0], [0, 8, 0],
  ];
  const out = [];
  for (const seed of seeds) {
    for (const chunk of chunks) {
      const c = generateChunk(seed, ...chunk);
      const h = createHash('sha256');
      if (c.storage.kind === 'uniform') h.update(`uniform:${c.storage.value}`);
      else h.update(Buffer.from(c.storage.blocks.buffer, c.storage.blocks.byteOffset, c.storage.blocks.byteLength));
      h.update(
        c.hints === 'saturated'
          ? 'saturated'
          : Buffer.from(c.hints.buffer, c.hints.byteOffset, c.hints.byteLength),
      );
      out.push({ seed, chunk, hash: h.digest('hex') });
    }
  }
  writeFileSync(
    fileURLToPath(new URL('./goldens.json', import.meta.url)),
    `${JSON.stringify(out, null, 1)}\n`,
  );
});
