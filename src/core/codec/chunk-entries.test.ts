import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { encodeChunkEntries, decodeChunkEntries, splitChunkEntries } from './chunk-entries';
import { CodecError } from './varint';
import type { IndexedEntry } from '../sync/lww';
import { LwwStore } from '../sync/lww';
import { packChunkKey } from '../world/coords';

// A.2: one codec for disk, file and wire. Canonical — identical states give
// identical bytes, with a sorted per-blob peer table — and self-contained.

const entryArb = fc.record({
  index: fc.integer({ min: 0, max: 32767 }),
  value: fc.integer({ min: 0, max: 0x1ff }),
  l: fc.integer({ min: 0, max: 2 ** 40 }),
  c: fc.integer({ min: 0, max: 0xffff }),
  peer: fc.bigInt({ min: 1n, max: (1n << 64n) - 1n }),
});

/** Entries with unique indices, in canonical (l, c, peer, index) order. */
const canonicalSet = fc
  .uniqueArray(entryArb, { maxLength: 40, selector: (e) => e.index })
  .map((entries) => {
    const out = [...entries];
    out.sort((a, b) =>
      a.l - b.l || a.c - b.c || (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0) || a.index - b.index,
    );
    return out as IndexedEntry[];
  });

describe('chunk-entries codec', () => {
  it('round-trips and re-encodes to identical bytes', () => {
    fc.assert(
      fc.property(canonicalSet, (entries) => {
        const blob = encodeChunkEntries(entries);
        const decoded = decodeChunkEntries(blob);
        expect(decoded).toEqual(entries);
        expect(encodeChunkEntries(decoded)).toEqual(blob);
      }),
    );
  });

  it('is canonical: the same state reached differently encodes identically', () => {
    const K = packChunkKey(0, 0, 0);
    const a = new LwwStore();
    const b = new LwwStore();
    const e1 = { value: 3, l: 10, c: 0, peer: 7n };
    const e2 = { value: 5, l: 20, c: 0, peer: 3n };
    const e3 = { value: 1, l: 15, c: 2, peer: 9n };
    a.apply(K, 1, e1); a.apply(K, 2, e2); a.apply(K, 3, e3);
    b.apply(K, 3, e3); b.apply(K, 1, { value: 9, l: 5, c: 0, peer: 1n }); b.apply(K, 1, e1); b.apply(K, 2, e2);
    expect(encodeChunkEntries(a.snapshot(K))).toEqual(encodeChunkEntries(b.snapshot(K)));
  });

  it('encodes an empty set', () => {
    const blob = encodeChunkEntries([]);
    expect(decodeChunkEntries(blob)).toEqual([]);
  });

  it('keeps the peer table sorted, deduplicated and minimal', () => {
    const entries: IndexedEntry[] = [
      { index: 0, value: 1, l: 1, c: 0, peer: 9n },
      { index: 1, value: 1, l: 2, c: 0, peer: 2n },
      { index: 2, value: 1, l: 3, c: 0, peer: 9n },
    ];
    const blob = encodeChunkEntries(entries);
    // codec byte, then varint npeer = 2, then peers 2 and 9 ascending.
    expect(blob[0]).toBe(1);
    expect(blob[1]).toBe(2);
    const p1 = new DataView(blob.buffer, blob.byteOffset + 2, 8).getBigUint64(0, true);
    const p2 = new DataView(blob.buffer, blob.byteOffset + 10, 8).getBigUint64(0, true);
    expect(p1).toBe(2n);
    expect(p2).toBe(9n);
  });

  it('splits greedily into parts that each decode and reassemble', () => {
    fc.assert(
      fc.property(canonicalSet, (entries) => {
        const parts = splitChunkEntries(entries, 160);
        const all: IndexedEntry[] = [];
        for (const part of parts) {
          expect(part.length).toBeLessThanOrEqual(160);
          all.push(...decodeChunkEntries(part));
        }
        expect(all).toEqual(entries);
      }),
    );
  });

  it('splits a full chunk in linear time (review #13)', () => {
    // 32768 entries, 16 KiB parts: the old split re-encoded the growing
    // run once per appended entry (quadratic) on the main thread.
    const entries: IndexedEntry[] = [];
    for (let i = 0; i < 32768; i++) {
      entries.push({ index: i, value: 3, l: 1000 + i, c: 0, peer: BigInt((i % 5) + 1) });
    }
    const t0 = performance.now();
    const parts = splitChunkEntries(entries, 16 * 1024 - 16);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(400);
    const all: IndexedEntry[] = [];
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(16 * 1024 - 16);
      all.push(...decodeChunkEntries(part));
    }
    expect(all).toEqual(entries);
    // parts stay reasonably full (the size estimate is not wildly pessimistic)
    expect(parts.length).toBeLessThan(40);
  });

  it('rejects malformed input with CodecError and nothing else', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        try {
          decodeChunkEntries(bytes);
        } catch (err) {
          expect(err).toBeInstanceOf(CodecError);
        }
      }),
    );
  });

  it('rejects trailing garbage, unknown codec ids, and unsorted peers', () => {
    const good = encodeChunkEntries([{ index: 5, value: 2, l: 9, c: 0, peer: 4n }]);
    const trailing = new Uint8Array([...good, 0]);
    expect(() => decodeChunkEntries(trailing)).toThrow(CodecError);
    const badCodec = good.slice();
    badCodec[0] = 2;
    expect(() => decodeChunkEntries(badCodec)).toThrow(CodecError);
  });
});
