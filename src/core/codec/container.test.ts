import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import fc from 'fast-check';
import {
  encodeAmorfusFile,
  decodeAmorfusFile,
  type AmorfusFile,
} from './container';
import { CodecError } from './varint';
import type { IndexedEntry } from '../sync/lww';

// A.4: 16-byte uncompressed preamble, one gzip member of tagged sections.
// Uppercase tag = critical (unknown rejects); lowercase = skippable.
// Share profile (C-15): no worldId, no player data, stamps rebased.

const e = (index: number, value: number, l: number, peer = 1n): IndexedEntry => ({
  index, value, l, c: 0, peer,
});

function sample(): AmorfusFile {
  return {
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
      [100, [e(1, 3, 1000), e(2, 5, 2000, 9n)]],
      [4521984, [e(0, 1, 1500)]],
    ],
    player: { position: [1, 2, 3], fly: false },
  };
}

describe('.amorfus container', () => {
  it('round-trips a backup file', async () => {
    const f = sample();
    const bytes = await encodeAmorfusFile(f);
    expect([...bytes.slice(0, 8)]).toEqual([0x41, 0x4d, 0x4f, 0x52, 0x46, 0x55, 0x53, 0x1a]);
    const out = await decodeAmorfusFile(bytes);
    expect(out).toEqual(f);
  });

  it('share profile strips identity and rebases stamps order-preservingly', async () => {
    const f = sample();
    f.profile = 1;
    const out = await decodeAmorfusFile(await encodeAmorfusFile(f));
    expect(out.meta.worldId).toBeUndefined();
    expect(out.player).toBeUndefined();
    // Global (l, c, peer) order preserved, values 0..n-1, c = 0:
    const all = out.chunks.flatMap(([, entries]) => entries);
    const ls = all.map((x) => x.l).sort((a, b) => a - b);
    expect(ls).toEqual([0, 1, 2]);
    // Original order: l=1000 (k100,i1) < l=1500 (k4521984) < l=2000 (k100,i2)
    const k100 = out.chunks.find(([k]) => k === 100)![1];
    expect(k100.find((x) => x.index === 1)!.l).toBe(0);
    expect(k100.find((x) => x.index === 2)!.l).toBe(2);
  });

  it('rejects a wrong magic, a newer major, and unknown compression', async () => {
    const bytes = await encodeAmorfusFile(sample());
    const badMagic = bytes.slice();
    badMagic[0] = 0x42;
    await expect(decodeAmorfusFile(badMagic)).rejects.toThrow(CodecError);
    const badMajor = bytes.slice();
    badMajor[8] = 2;
    await expect(decodeAmorfusFile(badMajor)).rejects.toThrow(CodecError);
    const badComp = bytes.slice();
    badComp[12] = 9;
    await expect(decodeAmorfusFile(badComp)).rejects.toThrow(CodecError);
  });

  it('skips unknown lowercase sections, rejects unknown uppercase ones', async () => {
    const { __forTest } = await import('./container');
    const withLower = await __forTest.withExtraSection(sample(), 'xtra', new Uint8Array([1, 2, 3]));
    const out = await decodeAmorfusFile(withLower);
    expect(out.meta.name).toBe('Test World');
    const withUpper = await __forTest.withExtraSection(sample(), 'XTRA', new Uint8Array([1, 2, 3]));
    await expect(decodeAmorfusFile(withUpper)).rejects.toThrow(CodecError);
  });

  it('refuses a decompression bomb (64× expansion cap)', async () => {
    const f = sample();
    // 40 MB of zeros compresses tiny; 16 KiB * 64 = 1 MiB cap << 40 MB.
    const bomb: IndexedEntry[] = [];
    for (let i = 0; i < 32768; i++) bomb.push(e(i, 1, 1));
    f.chunks = [];
    for (let k = 0; k < 40; k++) f.chunks.push([k * 24, bomb]);
    const bytes = await encodeAmorfusFile(f);
    await expect(
      decodeAmorfusFile(bytes, { maxExpandedBytes: bytes.length * 4 }),
    ).rejects.toThrow(CodecError);
  }, 30000);

  it('survives truncation and bit flips with CodecError only', async () => {
    const bytes = await encodeAmorfusFile(sample());
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: bytes.length - 1 }),
        fc.integer({ min: 0, max: 255 }),
        fc.boolean(),
        async (pos, flip, truncate) => {
          const mutated = truncate
            ? bytes.slice(0, pos)
            : (() => {
                const m = bytes.slice();
                m[pos] = m[pos]! ^ (flip || 1);
                return m;
              })();
          try {
            await decodeAmorfusFile(mutated);
          } catch (err) {
            expect(err).toBeInstanceOf(CodecError);
          }
        },
      ),
      { numRuns: 60 },
    );
  }, 30000);

  it('decodes the committed v1 golden fixture', async () => {
    const fixture = await readFile(new URL('./fixtures/v1-backup.amorfus', import.meta.url));
    const out = await decodeAmorfusFile(new Uint8Array(fixture));
    expect(out).toEqual(sample());
  });
});
