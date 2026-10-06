// §10.1/§10.3: the ONLY file that imports Trystero. Wraps a nostr room in
// the Transport interface, adds the two negotiated channels per
// connection — bulk (id 43, reliable) and pos (id 42, unordered,
// maxRetransmits 0) — and prefixes their frames with the 4-byte room
// epoch, because Trystero shares one RTCPeerConnection per remote peer
// across rooms and keeps it ~123 s after leaving.
import { joinRoom, getRelaySockets, selfId } from '@trystero-p2p/nostr';
import type { Transport, Channel } from './transport';
import thirdParty from '../../third-party.json';

export interface TrysteroOptions {
  appId: string;
  roomId: string;
  /** test override: loopback relays only (gate rule §14) */
  relayUrls?: string[] | undefined;
  rtcConfig?: RTCConfiguration | undefined;
  /** stable per-room epoch, chosen by the joiner */
  epoch: number;
}

const BULK_ID = 43;
const POS_ID = 42;

export const CURATED_RELAYS: string[] = (thirdParty as Array<{ kind: string; url: string }>)
  .filter((e) => e.kind === 'signaling')
  .map((e) => e.url);

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: (thirdParty as Array<{ kind: string; url: string }>).filter((e) => e.kind === 'stun').map((e) => e.url) },
];

type RoomLike = ReturnType<typeof joinRoom>;

interface ChannelPair {
  bulk: RTCDataChannel;
  pos: RTCDataChannel;
}

export class TrysteroTransport implements Transport {
  readonly id: string = selfId;
  private room: RoomLike;
  private epoch: number;
  private sendAction: (data: Uint8Array, options?: { target?: string | string[] }) => Promise<void>;
  private messageCbs: Array<(from: string, bytes: Uint8Array, channel: Channel) => void> = [];
  private joinCbs: Array<(p: string) => void> = [];
  private leaveCbs: Array<(p: string) => void> = [];
  private channels = new Map<string, ChannelPair>();
  private peerList = new Set<string>();

  constructor(opts: TrysteroOptions) {
    this.epoch = opts.epoch >>> 0;
    this.room = joinRoom(
      {
        appId: opts.appId,
        ...(opts.relayUrls !== undefined ? { relayUrls: opts.relayUrls } : {}),
        rtcConfig: opts.rtcConfig ?? { iceServers: STUN_SERVERS },
      },
      opts.roomId,
    );
    const action = this.room.makeAction<Uint8Array>('amf', {
      onMessage: (data, context) => {
        if (data instanceof Uint8Array) {
          for (const cb of this.messageCbs) cb(context.peerId, data, 'action');
        }
      },
    });
    this.sendAction = (data, options) => action.send(data, options);
    this.room.onPeerJoin = (peerId: string) => {
      this.peerList.add(peerId);
      this.setupChannels(peerId);
      for (const cb of this.joinCbs) cb(peerId);
    };
    this.room.onPeerLeave = (peerId: string) => {
      this.peerList.delete(peerId);
      this.channels.delete(peerId);
      for (const cb of this.leaveCbs) cb(peerId);
    };
  }

  /** Negotiated channels are created once per CONNECTION and reused; the
   *  epoch prefix tells rooms apart on a shared connection (§10.3). */
  private setupChannels(peerId: string): void {
    const pc = this.room.getPeers()[peerId];
    if (pc === undefined) return;
    const bulk = pc.createDataChannel('amf-bulk', { negotiated: true, id: BULK_ID });
    const pos = pc.createDataChannel('amf-pos', {
      negotiated: true,
      id: POS_ID,
      ordered: false,
      maxRetransmits: 0,
    });
    bulk.binaryType = 'arraybuffer';
    pos.binaryType = 'arraybuffer';
    const handler = (channel: Channel) => (ev: MessageEvent) => {
      const bytes = new Uint8Array(ev.data as ArrayBuffer);
      if (bytes.byteLength < 4) return;
      const epoch =
        (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
      if (epoch !== this.epoch) return; // another room's traffic
      for (const cb of this.messageCbs) cb(peerId, bytes.subarray(4), channel);
    };
    bulk.onmessage = handler('bulk');
    pos.onmessage = handler('pos');
    this.channels.set(peerId, { bulk, pos });
  }

  send(peerId: string, bytes: Uint8Array, channel: Channel): void {
    if (channel === 'action') {
      void this.sendAction(bytes, { target: peerId }).catch(() => {
        // peer went away mid-send; the session's leave handling covers it
      });
      return;
    }
    const pair = this.channels.get(peerId);
    const dc = channel === 'bulk' ? pair?.bulk : pair?.pos;
    if (dc === undefined || dc.readyState !== 'open') return;
    const framed = new Uint8Array(4 + bytes.byteLength);
    framed[0] = this.epoch & 0xff;
    framed[1] = (this.epoch >> 8) & 0xff;
    framed[2] = (this.epoch >> 16) & 0xff;
    framed[3] = (this.epoch >> 24) & 0xff;
    framed.set(bytes, 4);
    dc.send(framed);
  }

  onMessage(cb: (from: string, bytes: Uint8Array, channel: Channel) => void): void {
    this.messageCbs.push(cb);
  }

  onPeerJoin(cb: (peerId: string) => void): void {
    this.joinCbs.push(cb);
  }

  onPeerLeave(cb: (peerId: string) => void): void {
    this.leaveCbs.push(cb);
  }

  peers(): string[] {
    return [...this.peerList];
  }

  leave(): void {
    void this.room.leave();
  }

  /** "n/6 signaling relays reachable" (§10.4). */
  static relayHealth(): { open: number; total: number } {
    const sockets = getRelaySockets() as Record<string, WebSocket>;
    const entries = Object.values(sockets);
    return {
      open: entries.filter((s) => s.readyState === WebSocket.OPEN).length,
      total: entries.length,
    };
  }
}
