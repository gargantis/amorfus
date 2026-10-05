import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PoolAllocator } from './pool-allocator';

// §8.3: 64 MiB vertex/index pool pages with an offset allocator — never a
// buffer per chunk. §14: allocator property tests.
describe('PoolAllocator', () => {
  it('allocates non-overlapping, in-bounds, aligned ranges', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 1, maxLength: 60 }),
        (sizes) => {
          const pool = new PoolAllocator(64 * 1024);
          const taken: Array<[number, number]> = [];
          for (const size of sizes) {
            const off = pool.alloc(size);
            if (off === null) continue;
            expect(off % 4).toBe(0);
            expect(off + size).toBeLessThanOrEqual(64 * 1024);
            for (const [o, s] of taken) {
              const overlap = off < o + s && o < off + size;
              expect(overlap).toBe(false);
            }
            taken.push([off, size]);
          }
        },
      ),
    );
  });

  it('reuses freed space and coalesces neighbours', () => {
    const pool = new PoolAllocator(1024);
    const a = pool.alloc(256)!;
    const b = pool.alloc(256)!;
    const c = pool.alloc(256)!;
    expect(pool.alloc(512)).toBeNull(); // only 256 left
    pool.free(a);
    pool.free(b); // a+b coalesce into 512
    const d = pool.alloc(512);
    expect(d).not.toBeNull();
    pool.free(c);
    pool.free(d!);
    expect(pool.alloc(1024)).not.toBeNull(); // fully coalesced
  });

  it('survives random churn without leaking (free space returns)', () => {
    fc.assert(
      fc.property(fc.array(fc.nat({ max: 999 }), { maxLength: 400 }), (ops) => {
        const pool = new PoolAllocator(32 * 1024);
        const live = new Map<number, number>();
        for (const op of ops) {
          if (op % 3 === 0 && live.size > 0) {
            const keys = [...live.keys()];
            const victim = keys[op % keys.length]!;
            pool.free(victim);
            live.delete(victim);
          } else {
            const size = (op % 500) + 1;
            const off = pool.alloc(size);
            if (off !== null) live.set(off, size);
          }
        }
        for (const off of live.keys()) pool.free(off);
        expect(pool.alloc(32 * 1024 - 16)).not.toBeNull();
      }),
    );
  });

  it('rejects double frees and unknown offsets', () => {
    const pool = new PoolAllocator(1024);
    const a = pool.alloc(100)!;
    pool.free(a);
    expect(() => pool.free(a)).toThrow();
    expect(() => pool.free(12345)).toThrow();
  });

  it('reports occupancy for the HUD', () => {
    const pool = new PoolAllocator(1000);
    expect(pool.usedBytes).toBe(0);
    const a = pool.alloc(100)!;
    expect(pool.usedBytes).toBeGreaterThanOrEqual(100);
    pool.free(a);
    expect(pool.usedBytes).toBe(0);
  });
});
