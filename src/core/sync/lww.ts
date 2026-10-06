// §11: the converged, persisted class — a per-cell last-writer-wins map.
// Entries nest per chunk (Map<chunkKey, Map<localIndex, Entry>>) because a
// single safe-integer cell key does not exist for the v1 world bounds, and
// every consumer (codec, digests, anti-entropy) works per chunk anyway.
//
// Order: (l, c, peer, value). The value tiebreak is REQUIRED: without it,
// duplicate tags with different values diverge (found by fast-check in the
// research). P6: no accepted entry is ever deleted.

export interface Entry {
  value: number; // canonical u16 block value
  l: number; // u48 HLC ms
  c: number; // u16 HLC counter
  peer: bigint; // u64 session id, never persisted as identity
}

export interface IndexedEntry extends Entry {
  index: number; // A.2 local index within the chunk
}

export function compareTag(a: Entry, b: Entry): number {
  if (a.l !== b.l) return a.l - b.l;
  if (a.c !== b.c) return a.c - b.c;
  if (a.peer !== b.peer) return a.peer < b.peer ? -1 : 1;
  return a.value - b.value;
}

export class LwwStore {
  private chunks = new Map<number, Map<number, Entry>>();
  entryCount = 0;

  /** Returns true when the entry won (state changed). Idempotent. */
  apply(chunkKey: number, index: number, entry: Entry): boolean {
    let chunk = this.chunks.get(chunkKey);
    if (chunk === undefined) {
      chunk = new Map();
      this.chunks.set(chunkKey, chunk);
    }
    const existing = chunk.get(index);
    if (existing === undefined) {
      chunk.set(index, entry);
      this.entryCount += 1;
      return true;
    }
    if (compareTag(entry, existing) > 0) {
      chunk.set(index, entry);
      return true;
    }
    return false;
  }

  /** ONLY for the §11.2 clock-ahead repair: replaces an entry regardless
   *  of tag order (the replaced entry was never accepted by any peer). */
  replaceForRepair(chunkKey: number, index: number, entry: Entry): void {
    const chunk = this.chunks.get(chunkKey);
    if (chunk === undefined || !chunk.has(index)) throw new Error('repair target missing');
    chunk.set(index, entry);
  }

  /** Raw per-chunk view, UNSORTED — for cheap region-scoped reads.
   *  Callers must not mutate it. */
  rawChunk(chunkKey: number): ReadonlyMap<number, Entry> | undefined {
    return this.chunks.get(chunkKey);
  }

  get(chunkKey: number, index: number): Entry | undefined {
    return this.chunks.get(chunkKey)?.get(index);
  }

  /** Canonical per-chunk order: (l, c, peer, index) — the A.2 blob order. */
  snapshot(chunkKey: number): IndexedEntry[] {
    const chunk = this.chunks.get(chunkKey);
    if (chunk === undefined) return [];
    const out: IndexedEntry[] = [];
    for (const [index, e] of chunk) out.push({ ...e, index });
    out.sort((a, b) => {
      if (a.l !== b.l) return a.l - b.l;
      if (a.c !== b.c) return a.c - b.c;
      if (a.peer !== b.peer) return a.peer < b.peer ? -1 : 1;
      return a.index - b.index;
    });
    return out;
  }

  chunkKeys(): number[] {
    return [...this.chunks.keys()];
  }

  entriesInChunk(chunkKey: number): number {
    return this.chunks.get(chunkKey)?.size ?? 0;
  }
}
