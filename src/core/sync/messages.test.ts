import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  MSG,
  encodeHello, decodeHello,
  encodeRefuse, decodeRefuse,
  encodeEdits, decodeEdits,
  encodeRoot, decodeRoot,
  encodeChunkDigests, decodeChunkDigests,
  encodeWant, decodeWant,
  encodePeers, decodePeers,
  encodeChunkEntriesMsg, decodeChunkEntriesMsg,
  decodeMessageType,
  MAX_MESSAGE_BYTES,
} from './messages';
import { encodeChunkEntries } from '../codec/chunk-entries';
import { CodecError } from '../codec/varint';

// A.3: every message is [u8 type][payload], little-endian, ≤ 16 KiB.

describe('session messages', () => {
  it('HELLO round-trips with and without a world', () => {
    const withWorld = {
      protocolVersion: 1,
      sessionId: 0xabcdef12345678n,
      wallClock: 1700000000000,
      hlc: { l: 1700000000001, c: 3 },
      name: 'Paula',
      color: 5,
      world: {
        worldId: new Uint8Array(16).fill(7),
        seed: [123, 456] as [number, number],
        generatorVersion: 1,
        genCanary: 0xdeadbeef,
      },
    };
    expect(decodeHello(encodeHello(withWorld))).toEqual(withWorld);
    const noWorld = { ...withWorld, world: null };
    expect(decodeHello(encodeHello(noWorld))).toEqual(noWorld);
  });

  it('REFUSE carries a reason code', () => {
    const bytes = encodeRefuse('protocol-mismatch');
    expect(decodeMessageType(bytes)).toBe(MSG.REFUSE);
    expect(decodeRefuse(bytes)).toBe('protocol-mismatch');
  });

  it('EDITS round-trips with a per-message peer table', () => {
    const edits = {
      originSession: 42n,
      entries: [
        { chunkKey: 12345, index: 100, value: 3, l: 1000, c: 0, peer: 7n },
        { chunkKey: 12345, index: 101, value: 0x105, l: 1001, c: 2, peer: 9n },
        { chunkKey: 99, index: 0, value: 0, l: 1001, c: 2, peer: 7n },
      ],
    };
    expect(decodeEdits(encodeEdits(edits))).toEqual(edits);
  });

  it('ROOT, WANT and CHUNK_DIGESTS round-trip', () => {
    const root = new Uint8Array(16).fill(9);
    expect(decodeRoot(encodeRoot(root))).toEqual(root);
    expect(decodeWant(encodeWant([1, 5, 99999]))).toEqual([1, 5, 99999]);
    const digests = [
      [7, new Uint8Array(32).fill(1)],
      [9, new Uint8Array(32).fill(2)],
    ] as Array<[number, Uint8Array]>;
    expect(decodeChunkDigests(encodeChunkDigests(digests))).toEqual(digests);
  });

  it('PEERS gossips neighbour and member sets', () => {
    const p = { neighbours: [1n, 5n], members: [1n, 5n, 9n] };
    expect(decodePeers(encodePeers(p))).toEqual(p);
  });

  it('CHUNK_ENTRIES wraps a chunk key and one A.2 part', () => {
    const part = encodeChunkEntries([{ index: 3, value: 2, l: 5, c: 0, peer: 1n }]);
    const msg = encodeChunkEntriesMsg(777, part);
    const out = decodeChunkEntriesMsg(msg);
    expect(out.chunkKey).toBe(777);
    expect(out.part).toEqual(part);
  });

  it('every decoder is total: random bytes throw CodecError only', () => {
    const decoders = [decodeHello, decodeRefuse, decodeEdits, decodeRoot, decodeChunkDigests, decodeWant, decodePeers, decodeChunkEntriesMsg];
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 80 }), (bytes) => {
        for (const d of decoders) {
          try {
            d(bytes);
          } catch (err) {
            expect(err).toBeInstanceOf(CodecError);
          }
        }
      }),
    );
  });

  it('enforces the 16 KiB ceiling at encode time', () => {
    expect(MAX_MESSAGE_BYTES).toBe(16 * 1024);
    const entries: Array<{ chunkKey: number; index: number; value: number; l: number; c: number; peer: bigint }> = [];
    for (let i = 0; i < 2000; i++) {
      entries.push({ chunkKey: i, index: i % 32768, value: 1, l: i, c: 0, peer: BigInt(i + 1) });
    }
    expect(() => encodeEdits({ originSession: 1n, entries })).toThrow(CodecError);
  });
});
