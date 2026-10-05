// §8.3: offset allocator for 64 MiB pool pages. Address-ordered free list
// with first-fit and eager coalescing — simple, predictable, and
// queue-timeline reuse needs no fences (uploads order on the queue).
// Allocations are 4-byte aligned (index/vertex alignment).

const ALIGN = 4;

interface FreeBlock {
  offset: number;
  size: number;
}

export class PoolAllocator {
  readonly size: number;
  private freeList: FreeBlock[]; // address-ordered, non-adjacent
  private live = new Map<number, number>(); // offset -> size

  constructor(size: number) {
    this.size = size;
    this.freeList = [{ offset: 0, size }];
  }

  get usedBytes(): number {
    let used = 0;
    for (const s of this.live.values()) used += s;
    return used;
  }

  alloc(bytes: number): number | null {
    const size = Math.ceil(bytes / ALIGN) * ALIGN;
    for (let i = 0; i < this.freeList.length; i++) {
      const block = this.freeList[i]!;
      if (block.size < size) continue;
      const offset = block.offset;
      if (block.size === size) this.freeList.splice(i, 1);
      else {
        block.offset += size;
        block.size -= size;
      }
      this.live.set(offset, size);
      return offset;
    }
    return null;
  }

  free(offset: number): void {
    const size = this.live.get(offset);
    if (size === undefined) throw new Error(`free of unallocated offset ${offset}`);
    this.live.delete(offset);
    // Insert address-ordered, coalescing with neighbours.
    let lo = 0;
    let hi = this.freeList.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.freeList[mid]!.offset < offset) lo = mid + 1;
      else hi = mid;
    }
    const prev = lo > 0 ? this.freeList[lo - 1] : undefined;
    const next = lo < this.freeList.length ? this.freeList[lo] : undefined;
    const joinPrev = prev !== undefined && prev.offset + prev.size === offset;
    const joinNext = next !== undefined && offset + size === next.offset;
    if (joinPrev && joinNext) {
      prev.size += size + next.size;
      this.freeList.splice(lo, 1);
    } else if (joinPrev) {
      prev.size += size;
    } else if (joinNext) {
      next.offset = offset;
      next.size += size;
    } else {
      this.freeList.splice(lo, 0, { offset, size });
    }
  }
}
