import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { compareTag, LwwStore, type Entry } from './lww';
import { packChunkKey } from '../world/coords';

// §11.2: entries ordered by (l, c, peer, value); the value tiebreak is
// required — fast-check found divergence without it when a tag is
// duplicated. §11.3 P6: no accepted entry is ever deleted.

const e = (value: number, l: number, c: number, peer: bigint): Entry => ({ value, l, c, peer });

describe('compareTag', () => {
  it('orders by l, then c, then peer, then value', () => {
    expect(compareTag(e(1, 1, 0, 1n), e(1, 2, 0, 1n))).toBeLessThan(0);
    expect(compareTag(e(1, 2, 1, 1n), e(1, 2, 2, 1n))).toBeLessThan(0);
    expect(compareTag(e(1, 2, 2, 1n), e(1, 2, 2, 2n))).toBeLessThan(0);
    expect(compareTag(e(1, 2, 2, 2n), e(3, 2, 2, 2n))).toBeLessThan(0);
    expect(compareTag(e(3, 2, 2, 2n), e(3, 2, 2, 2n))).toBe(0);
  });
});

describe('LwwStore', () => {
  const K = packChunkKey(0, 0, 0);

  it('applies the larger entry regardless of arrival order', () => {
    const a = new LwwStore();
    const b = new LwwStore();
    const e1 = e(1, 100, 0, 5n);
    const e2 = e(2, 100, 0, 9n);
    a.apply(K, 7, e1); a.apply(K, 7, e2);
    b.apply(K, 7, e2); b.apply(K, 7, e1);
    expect(a.get(K, 7)).toEqual(e2);
    expect(b.get(K, 7)).toEqual(e2);
  });

  it('is idempotent and never loses to an older entry', () => {
    const s = new LwwStore();
    const win = e(4, 200, 1, 1n);
    expect(s.apply(K, 3, win)).toBe(true);
    expect(s.apply(K, 3, win)).toBe(false);
    expect(s.apply(K, 3, e(9, 199, 9, 9n))).toBe(false);
    expect(s.get(K, 3)).toEqual(win);
  });

  it('converges from any delivery order and duplication (semilattice)', () => {
    const entryArb = fc.record({
      value: fc.integer({ min: 0, max: 6 }),
      l: fc.integer({ min: 0, max: 3 }),
      c: fc.integer({ min: 0, max: 2 }),
      peer: fc.bigInt({ min: 1n, max: 4n }),
    });
    const opArb = fc.record({ index: fc.integer({ min: 0, max: 4 }), entry: entryArb });
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 24 }), fc.array(fc.nat(), { maxLength: 24 }), (ops, shuffleSeed) => {
        const a = new LwwStore();
        for (const op of ops) a.apply(K, op.index, op.entry);
        // A shuffled, partially duplicated replay must converge to the same
        // state. Seeded Fisher–Yates keeps the property deterministic.
        const replay = [...ops, ...ops.filter((_, i) => i % 2 === 0)];
        for (let i = replay.length - 1; i > 0; i--) {
          const j = (shuffleSeed[i % Math.max(1, shuffleSeed.length)] ?? 0) % (i + 1);
          const tmp = replay[i]!;
          replay[i] = replay[j]!;
          replay[j] = tmp;
        }
        const b = new LwwStore();
        for (const op of replay) b.apply(K, op.index, op.entry);
        expect(b.snapshot(K)).toEqual(a.snapshot(K));
      }),
    );
  });

  it('exposes a canonical per-chunk snapshot sorted by (l, c, peer, index)', () => {
    const s = new LwwStore();
    s.apply(K, 9, e(1, 50, 0, 2n));
    s.apply(K, 2, e(3, 50, 0, 2n));
    s.apply(K, 5, e(2, 10, 0, 1n));
    expect(s.snapshot(K).map((x) => x.index)).toEqual([5, 2, 9]);
  });

  it('counts entries and never deletes them (P6)', () => {
    const s = new LwwStore();
    s.apply(K, 0, e(1, 1, 0, 1n));
    s.apply(K, 0, e(0, 2, 0, 1n)); // overwrite back to air: entry stays
    expect(s.entryCount).toBe(1);
    expect(s.get(K, 0)?.value).toBe(0);
  });
});
