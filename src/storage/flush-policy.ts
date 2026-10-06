// §12.1 flush policy: debounced to 1.5 s idle and at most 5 s, plus the
// visibilitychange/pagehide flushes the caller wires. Pure timer logic.

const IDLE_MS = 1500;
const MAX_MS = 5000;

export class FlushPolicy {
  private firstDirtyAt: number | null = null;
  private lastDirtyAt = 0;

  markDirty(nowMs: number): void {
    if (this.firstDirtyAt === null) this.firstDirtyAt = nowMs;
    this.lastDirtyAt = nowMs;
  }

  shouldFlush(nowMs: number): boolean {
    if (this.firstDirtyAt === null) return false;
    return nowMs - this.lastDirtyAt >= IDLE_MS || nowMs - this.firstDirtyAt >= MAX_MS;
  }

  flushed(_nowMs: number): void {
    this.firstDirtyAt = null;
  }

  get dirty(): boolean {
    return this.firstDirtyAt !== null;
  }
}
