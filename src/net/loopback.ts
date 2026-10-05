// The loopback transport: a hub of in-memory peers with QUEUED delivery.
// Nothing moves until pump() — the convergence simulator (§14) owns time,
// injecting drops, duplicates, delays and partitions deterministically.
import type { Transport, Channel } from './transport';

export type Fault = 'deliver' | 'drop' | 'duplicate' | 'delay';

interface Frame {
  from: string;
  to: string;
  bytes: Uint8Array;
  channel: Channel;
}

type MessageCb = (from: string, bytes: Uint8Array, channel: Channel) => void;

class LoopbackPeer implements Transport {
  readonly id: string;
  private hub: LoopbackHub;
  messageCbs: MessageCb[] = [];
  joinCbs: Array<(p: string) => void> = [];
  leaveCbs: Array<(p: string) => void> = [];

  constructor(hub: LoopbackHub, id: string) {
    this.hub = hub;
    this.id = id;
  }

  send(peerId: string, bytes: Uint8Array, channel: Channel): void {
    this.hub.enqueue({ from: this.id, to: peerId, bytes, channel });
  }

  onMessage(cb: MessageCb): void {
    this.messageCbs.push(cb);
  }

  onPeerJoin(cb: (p: string) => void): void {
    this.joinCbs.push(cb);
  }

  onPeerLeave(cb: (p: string) => void): void {
    this.leaveCbs.push(cb);
  }

  peers(): string[] {
    return this.hub.peerIdsExcept(this.id);
  }

  leave(): void {
    this.hub.remove(this.id);
  }
}

export class LoopbackHub {
  private members = new Map<string, LoopbackPeer>();
  private queue: Frame[] = [];
  private delayed: Frame[] = [];
  private partitions: Array<[Set<string>, Set<string>]> = [];

  /** Fault decision per frame; the simulator replaces this. */
  faults: (frame: Frame) => Fault = () => 'deliver';

  join(id: string): Transport {
    if (this.members.has(id)) throw new Error(`duplicate peer id ${id}`);
    const peer = new LoopbackPeer(this, id);
    for (const other of this.members.values()) {
      for (const cb of other.joinCbs) cb(id);
      for (const cb of peer.joinCbs) cb(other.id);
    }
    this.members.set(id, peer);
    return peer;
  }

  remove(id: string): void {
    if (!this.members.delete(id)) return;
    for (const other of this.members.values()) {
      for (const cb of other.leaveCbs) cb(id);
    }
    this.queue = this.queue.filter((f) => f.from !== id && f.to !== id);
    this.delayed = this.delayed.filter((f) => f.from !== id && f.to !== id);
  }

  peerIdsExcept(id: string): string[] {
    return [...this.members.keys()].filter((p) => p !== id);
  }

  enqueue(frame: Frame): void {
    this.queue.push(frame);
  }

  partition(a: Set<string>, b: Set<string>): void {
    this.partitions.push([a, b]);
  }

  heal(): void {
    this.partitions = [];
  }

  private cut(from: string, to: string): boolean {
    for (const [a, b] of this.partitions) {
      if ((a.has(from) && b.has(to)) || (b.has(from) && a.has(to))) return true;
    }
    return false;
  }

  /** Deliver everything queued (delayed frames surface next pump). */
  pump(): void {
    const batch = this.queue;
    this.queue = this.delayed;
    this.delayed = [];
    for (const frame of batch) {
      if (this.cut(frame.from, frame.to)) continue;
      const target = this.members.get(frame.to);
      if (target === undefined) continue;
      const fault = this.faults(frame);
      if (fault === 'drop') continue;
      if (fault === 'delay') {
        this.queue.push(frame);
        continue;
      }
      const times = fault === 'duplicate' ? 2 : 1;
      for (let i = 0; i < times; i++) {
        for (const cb of target.messageCbs) cb(frame.from, frame.bytes, frame.channel);
      }
    }
  }

  get pending(): number {
    return this.queue.length;
  }
}
