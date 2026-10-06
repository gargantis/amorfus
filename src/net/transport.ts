// §5: the Transport interface the session protocol runs over. Only
// src/net/trystero-transport.ts (M7) may import Trystero; the loopback
// implementation drives the same protocol deterministically in Node.

export type Channel = 'action' | 'bulk' | 'pos';

export interface Transport {
  /** This transport's stable id within its room. */
  readonly id: string;
  send(peerId: string, bytes: Uint8Array, channel: Channel): void;
  /** Backpressure: false while the channel is not open or its buffer is
   *  full. Absent means "always ready" (loopback). */
  canSend?(peerId: string, channel: Channel): boolean;
  onMessage(cb: (from: string, bytes: Uint8Array, channel: Channel) => void): void;
  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
  peers(): string[];
  leave(): void;
}
