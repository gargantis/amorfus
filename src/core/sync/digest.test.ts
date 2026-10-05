import { describe, it, expect } from 'vitest';
import { chunkDigest, rootDigest } from './digest';
import { encodeChunkEntries } from '../codec/chunk-entries';
import type { IndexedEntry } from './lww';

// §11.4: chunkDigest = SHA-256 of the canonical blob; root = SHA-256 over
// the sorted (chunkKey ‖ chunkDigest) list, truncated to 16 bytes. XOR
// digests were rejected because they are linear — the last test builds the
// exact collision a malicious member could build against XOR, and shows
// SHA-256 tells the states apart.

const e = (index: number, value: number, l: number): IndexedEntry => ({
  index, value, l, c: 0, peer: 1n,
});

describe('digests', () => {
  it('identical states give identical digests and roots', async () => {
    const blob1 = encodeChunkEntries([e(1, 2, 10), e(5, 3, 20)]);
    const blob2 = encodeChunkEntries([e(1, 2, 10), e(5, 3, 20)]);
    expect(await chunkDigest(blob1)).toEqual(await chunkDigest(blob2));
    const r1 = await rootDigest([[42, await chunkDigest(blob1)]]);
    const r2 = await rootDigest([[42, await chunkDigest(blob2)]]);
    expect(r1).toEqual(r2);
    expect(r1.length).toBe(16);
  });

  it('chunk order does not matter, chunk identity does', async () => {
    const dA = await chunkDigest(encodeChunkEntries([e(0, 1, 1)]));
    const dB = await chunkDigest(encodeChunkEntries([e(0, 2, 2)]));
    const r1 = await rootDigest([[1, dA], [2, dB]]);
    const r2 = await rootDigest([[2, dB], [1, dA]]);
    expect(r1).toEqual(r2);
    const swapped = await rootDigest([[1, dB], [2, dA]]);
    expect(swapped).not.toEqual(r1);
  });

  it('distinguishes states built to collide under an XOR digest', async () => {
    // Gaussian elimination over GF(2): among 300 random entries' hashes a
    // non-empty subset XORs to zero, so state A and A ∪ subset collide for
    // ANY linear digest. SHA-256 over the canonical blob must not.
    const candidates: IndexedEntry[] = [];
    for (let i = 0; i < 300; i++) {
      candidates.push({ index: i % 32768, value: (i * 7) % 512, l: i + 1, c: 0, peer: BigInt(i % 9) + 1n });
    }
    const hashes: bigint[] = [];
    for (const cand of candidates) {
      const h = await chunkDigest(encodeChunkEntries([cand]));
      let v = 0n;
      for (const byte of h) v = (v << 8n) | BigInt(byte);
      hashes.push(v);
    }
    // Find a non-empty subset with XOR 0 via elimination with combination
    // tracking (each row carries the set of original indices it sums).
    const rows = hashes.map((h, i) => ({ h, members: new Set([i]) }));
    const pivots = new Map<number, { h: bigint; members: Set<number> }>();
    let zeroSubset: Set<number> | null = null;
    for (const row of rows) {
      let { h } = row;
      let members = new Set(row.members);
      while (h !== 0n) {
        const bit = h.toString(2).length - 1;
        const pivot = pivots.get(bit);
        if (pivot === undefined) {
          pivots.set(bit, { h, members });
          break;
        }
        h ^= pivot.h;
        const merged = new Set(members);
        for (const m of pivot.members) {
          if (merged.has(m)) merged.delete(m);
          else merged.add(m);
        }
        members = merged;
      }
      if (h === 0n && members.size > 0) {
        zeroSubset = members;
        break;
      }
    }
    expect(zeroSubset).not.toBeNull();
    if (zeroSubset === null) return;

    // Two different states a linear digest cannot tell apart:
    const subset = [...zeroSubset].map((i) => candidates[i]!);
    const stateA: IndexedEntry[] = [];
    const stateB = [...subset];
    const sort = (s: IndexedEntry[]) =>
      s.sort((a, b) => a.l - b.l || a.c - b.c || (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0) || a.index - b.index);
    const dA = await chunkDigest(encodeChunkEntries(sort(stateA)));
    const dB = await chunkDigest(encodeChunkEntries(sort(stateB)));
    expect(dB).not.toEqual(dA);
    expect(await rootDigest([[7, dA]])).not.toEqual(await rootDigest([[7, dB]]));
  }, 30000);
});
