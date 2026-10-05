// §11.2: hybrid logical clock (Kulkarni et al. 2014). Stamps are
// (l: u48 ms, c: u16). Physical time only moves l forward; c breaks ties.
// Validation (§11.3) handles future stamps; the HLC itself never defers.

export interface HlcStamp {
  l: number;
  c: number;
}

export class Hlc {
  private l: number;
  private c: number;

  /** Opening a world seeds l ≥ the largest stored l (§11.2). */
  constructor(seed?: HlcStamp) {
    this.l = seed?.l ?? 0;
    this.c = seed?.c ?? 0;
  }

  send(nowMs: number): HlcStamp {
    if (nowMs > this.l) {
      this.l = nowMs;
      this.c = 0;
    } else {
      this.c += 1;
    }
    return { l: this.l, c: this.c };
  }

  recv(remote: HlcStamp, nowMs: number): HlcStamp {
    const prevL = this.l;
    const l = Math.max(prevL, remote.l, nowMs);
    let c: number;
    if (l === prevL && l === remote.l) c = Math.max(this.c, remote.c) + 1;
    else if (l === prevL) c = this.c + 1;
    else if (l === remote.l) c = remote.c + 1;
    else c = 0;
    this.l = l;
    this.c = c;
    return { l, c };
  }

  state(): HlcStamp {
    return { l: this.l, c: this.c };
  }
}
