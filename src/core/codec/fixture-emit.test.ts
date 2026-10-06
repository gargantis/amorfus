import { it } from 'vitest';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeAmorfusFile, type AmorfusFile } from './container';

// Not a test: emits the v1 golden fixture. Runs only with
// AMORFUS_EMIT_GOLDENS=1 and only while format v1 is being created —
// never to "fix" a failing fixture (that is a compatibility break).
// D-24 freeze guard: once src/core/gen/v1/FROZEN exists (first public
// release), re-emission is forbidden — a changed hash is a determinism
// bug, never something to re-emit.
it.runIf(process.env.AMORFUS_EMIT_GOLDENS === '1')('emits the v1 container fixture', async () => {
  if (existsSync(new URL('../gen/v1/FROZEN', import.meta.url).pathname) ||
      existsSync(new URL('./FROZEN', import.meta.url).pathname)) {
    throw new Error('generator v1 is FROZEN (D-24): goldens must not be re-emitted');
  }
  const file: AmorfusFile = {
    profile: 0,
    meta: {
      worldId: '00112233445566778899aabbccddeeff',
      lineageId: 'ffeeddccbbaa99887766554433221100',
      name: 'Test World',
      seed: [123, 456],
      generator: { id: 'amorfus', version: 1 },
      chunkSize: 32,
      materials: ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'reserved7'],
      appVersion: '0.0.0',
    },
    chunks: [
      [100, [
        { index: 1, value: 3, l: 1000, c: 0, peer: 1n },
        { index: 2, value: 5, l: 2000, c: 0, peer: 9n },
      ]],
      [4521984, [{ index: 0, value: 1, l: 1500, c: 0, peer: 1n }]],
    ],
    player: { position: [1, 2, 3], fly: false },
  };
  const bytes = await encodeAmorfusFile(file);
  writeFileSync(fileURLToPath(new URL('./fixtures/v1-backup.amorfus', import.meta.url)), bytes);
});
