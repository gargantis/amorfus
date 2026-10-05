import { describe, it, expect } from 'vitest';
import { pickUploadBatch } from './upload-budget';

// §8.3: streaming uploads are capped at ≤ 2 MB per frame (the time half of
// the cap is enforced by the flusher); edit transactions bypass the cap
// and never split (§9.4).
describe('pickUploadBatch', () => {
  const item = (bytes: number, group?: number) => ({ bytes, group });

  it('takes items up to the byte budget, in order', () => {
    const items = [item(1_000_000), item(800_000), item(500_000)];
    const n = pickUploadBatch(items, 2_000_000);
    expect(n).toBe(2);
  });

  it('always takes at least one item so progress never stalls', () => {
    expect(pickUploadBatch([item(5_000_000)], 2_000_000)).toBe(1);
  });

  it('never splits a group: all of its items ship in the same frame', () => {
    const items = [item(1_500_000), item(900_000, 7), item(900_000, 7), item(100)];
    // item 0 fits; group 7 would exceed the budget → stop before it.
    expect(pickUploadBatch(items, 2_000_000)).toBe(1);
    // With the group first, the whole group ships even over budget.
    const items2 = [item(1_500_000, 7), item(900_000, 7), item(100)];
    expect(pickUploadBatch(items2, 2_000_000)).toBe(2);
  });

  it('returns 0 only for an empty queue', () => {
    expect(pickUploadBatch([], 2_000_000)).toBe(0);
  });
});
