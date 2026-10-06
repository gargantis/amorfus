// §10/§11 glue: Host/Join lifecycle over the Trystero transport, the
// SessionWorld adapter onto the streamed caches, POS timers (20 Hz
// moving / 4 Hz idle, on a timer — never rAF, which stops in hidden
// tabs), remote avatars, REKEY, and relay health.
import { TrysteroTransport, CURATED_RELAYS, STUN_SERVERS } from './trystero-transport';
import { Session, type SessionWorld } from '../core/sync/session';
import type { Entry, LwwStore } from '../core/sync/lww';
import type { Hlc } from '../core/sync/hlc';

/** What the glue needs from the edit layer — EditManager satisfies it,
 *  and the renderer-free net-test harness provides a bare version. */
export interface EditLike {
  edits: LwwStore;
  hlc: Hlc;
  sessionId: bigint;
  applyRemoteEntry(chunkKey: number, index: number, entry: Entry): boolean;
  onLocalEntry: ((chunkKey: number, index: number, entry: Entry) => void) | null;
  /** Review #3: remote remeshing is batched; the glue flushes per tick. */
  flushRemote?: () => void;
}
import { CHUNK, chunkOfCell, packChunkKey, localIndex } from '../core/world/coords';
import { generateSecret, normalizeSecret } from './secret';
import { encodePos, decodePos, type PosUpdate } from './pos-codec';
import { RemoteAvatar } from './avatar';

export const PROTOCOL_VERSION = 1;
const APP_ID = 'amorfus-v1';

export interface MultiplayerDeps {
  editManager: EditLike;
  seed: [number, number];
  worldId: Uint8Array; // 16 bytes
  name: string;
  color: number;
  /** C-10: the canary THIS engine computed at startup (core/canary.ts) —
   *  never a bundled constant, so divergent engines refuse each other. */
  genCanary: number;
  /** test overrides, honoured on loopback hosts only (§14 gate rule) */
  relayOverride?: string[] | undefined;
  noIce?: boolean | undefined;
  blockNth?: number | undefined;
  /** Review #2: a JOIN found the room playing a different world — the
   *  callback rebuilds the local world stack and rejoins. */
  onAdoptWorld?: ((worldId: Uint8Array, seed: [number, number]) => void) | undefined;
}

export interface PlayerPose {
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
  pitch: number;
  flying: boolean;
  held: number;
}

export class Multiplayer {
  private deps: MultiplayerDeps;
  private transport: TrysteroTransport | null = null;
  session: Session | null = null;
  secret: string | null = null;
  readonly avatars = new Map<string, RemoteAvatar>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private posTimer: ReturnType<typeof setInterval> | null = null;
  private posSeq = 0;
  private lastSentPos: [number, number, number] = [0, 0, 0];
  private seenPeers = 0;
  private blockedPeers = new Set<string>();
  getPose: (() => PlayerPose) | null = null;
  /** §10.1: user relays (Settings) and confirmed link hints are APPENDED
   *  to the curated list; §10.4: an optional user TURN server. */
  extraRelays: string[] = [];
  turn: RTCIceServer | null = null;
  private worldAdapter: SessionWorld | null = null;

  /** Review #2: the caller swapped the edit state after adopting the
   *  room's world — rebind the live session to it, no reconnect. */
  refreshWorldBinding(): void {
    if (this.session !== null && this.worldAdapter !== null) {
      this.session.rebindWorld(this.worldAdapter);
      this.deps.editManager.onLocalEntry = (chunkKey, index, entry) => {
        this.session?.broadcastLocalEntry(chunkKey, index, entry);
      };
    }
  }
  onStatus: ((text: string) => void) | null = null;
  onRekeyed: ((newSecret: string) => void) | null = null;

  constructor(deps: MultiplayerDeps) {
    this.deps = deps;
  }

  host(): string {
    const secret = generateSecret();
    this.start(secret, true);
    return secret;
  }

  join(code: string): boolean {
    const secret = normalizeSecret(code);
    if (secret === null) return false;
    // §10.3: joining announces NO world and binds to the room's.
    this.start(secret, false);
    return true;
  }

  get connected(): number {
    return this.session?.admitted().length ?? 0;
  }

  relayHealth(): { open: number; total: number } {
    return TrysteroTransport.relayHealth();
  }

  private start(secret: string, announceWorld = true): void {
    this.leave();
    this.secret = secret;
    const em = this.deps.editManager;

    // Epoch: stable per room secret, so shared connections keep rooms apart.
    let epoch = 0;
    for (const ch of secret) epoch = (Math.imul(epoch, 31) + ch.charCodeAt(0)) >>> 0;

    const baseRelays = this.deps.relayOverride ?? CURATED_RELAYS;
    const iceServers: RTCIceServer[] =
      this.deps.noIce === true ? [] : [...STUN_SERVERS, ...(this.turn !== null ? [this.turn] : [])];
    const transport = new TrysteroTransport({
      appId: APP_ID,
      roomId: secret,
      relayUrls: [...baseRelays, ...this.extraRelays],
      rtcConfig: { iceServers },
      epoch,
    });
    this.transport = transport;

    // §14 blocked-pair test hook: refuse to deliver anything to/from the
    // N-th peer this transport sees, so forwarding must carry it.
    if (this.deps.blockNth !== undefined) {
      transport.onPeerJoin((peerId) => {
        this.seenPeers += 1;
        if (this.seenPeers === this.deps.blockNth) this.blockedPeers.add(peerId);
      });
    }

    // Live getters: an in-place world adoption (review #2) swaps the
    // edit state underneath without reconnecting, so the adapter must
    // read the CURRENT store on every access.
    const deps = this.deps;
    const world: SessionWorld = {
      get seed() {
        return deps.seed;
      },
      get edits() {
        return deps.editManager.edits;
      },
      applyRemote: (chunkKey, index, entry) => deps.editManager.applyRemoteEntry(chunkKey, index, entry),
      localEdit: () => null, // the game applies local edits itself
      locate: (x, y, z) => {
        const { cx, cy, cz } = chunkOfCell(x, y, z);
        return {
          chunkKey: packChunkKey(cx, cy, cz),
          index: localIndex(x - cx * CHUNK, y - cy * CHUNK, z - cz * CHUNK),
        };
      },
    };
    this.worldAdapter = world;

    const blocked = this.blockedPeers;
    const gated: typeof transport = Object.create(transport, {
      send: {
        value: (peerId: string, bytes: Uint8Array, channel: 'action' | 'bulk' | 'pos') => {
          if (blocked.has(peerId)) return;
          transport.send(peerId, bytes, channel);
        },
      },
      onMessage: {
        value: (cb: (from: string, bytes: Uint8Array, channel: 'action' | 'bulk' | 'pos') => void) => {
          transport.onMessage((from, bytes, channel) => {
            if (blocked.has(from)) return;
            cb(from, bytes, channel);
          });
        },
      },
    }) as typeof transport;

    const session = new Session(
      {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: em.sessionId,
        name: this.deps.name,
        color: this.deps.color,
        world,
        worldId: this.deps.worldId,
        generatorVersion: 1,
        genCanary: this.deps.genCanary,
        hlc: em.hlc,
        now: () => Date.now(),
        announceWorld,
        // §11.4: bulk application is time-sliced so it cannot stall frames
        inboxBudgetMs: 6,
      },
      this.deps.blockNth !== undefined ? gated : transport,
    );
    this.session = session;
    session.onRefused = (reason) => this.onStatus?.(`join refused: ${reason}`);
    session.onSkewWarning = () => this.onStatus?.('a peer’s clock is several seconds off');
    session.onPos = (from, payload) => {
      let pos: PosUpdate;
      try {
        pos = decodePos(payload);
      } catch {
        return;
      }
      let avatar = this.avatars.get(from);
      if (avatar === undefined) {
        avatar = new RemoteAvatar();
        this.avatars.set(from, avatar);
      }
      avatar.push(performance.now(), {
        position: pos.position,
        velocity: pos.velocity,
        yaw: pos.yaw,
      });
    };
    session.onWorldOffer = (w) => {
      const same =
        w.worldId.length === this.deps.worldId.length &&
        w.worldId.every((b, i) => b === this.deps.worldId[i]);
      if (!same) this.deps.onAdoptWorld?.(w.worldId.slice(), [w.seed[0], w.seed[1]]);
    };
    session.onRekey = (_from, newSecret) => {
      // §10.2: replace and retire the old secret, leave the old room.
      const normalized = normalizeSecret(newSecret);
      if (normalized === null) return;
      this.onRekeyed?.(normalized);
      this.start(normalized);
    };
    transport.onPeerLeave((peerId) => this.avatars.delete(peerId));

    // Local edits broadcast as they happen (§9.4 P0 path).
    em.onLocalEntry = (chunkKey: number, index: number, entry: Entry) => {
      session.broadcastLocalEntry(chunkKey, index, entry);
    };

    this.tickTimer = setInterval(() => {
      void session.tick().then(() => this.deps.editManager.flushRemote?.());
    }, 100);
    // §11.6: 20 Hz while moving, 4 Hz idle, on a timer.
    let lastSend = 0;
    this.posTimer = setInterval(() => {
      const pose = this.getPose?.();
      if (pose === undefined || pose === null) return;
      const moved =
        Math.hypot(
          pose.position[0] - this.lastSentPos[0],
          pose.position[1] - this.lastSentPos[1],
          pose.position[2] - this.lastSentPos[2],
        ) > 0.01;
      const now = performance.now();
      if (!moved && now - lastSend < 250) return;
      lastSend = now;
      this.lastSentPos = [...pose.position];
      session.sendPos(
        encodePos({
          seq: this.posSeq++,
          timeMs: Date.now() % 2 ** 32,
          position: pose.position,
          velocity: pose.velocity,
          yaw: pose.yaw,
          pitch: pose.pitch,
          flags: pose.flying ? 1 : 0,
          held: pose.held,
        }),
      );
    }, 50);
  }

  /** §10.2 "New invite link": REKEY the ticked peers, then move rooms. */
  rekey(toTransportIds: readonly string[]): string {
    const next = generateSecret();
    this.session?.sendRekey(next, toTransportIds);
    // give the message a moment to flush before leaving
    setTimeout(() => this.start(next), 250);
    return next;
  }

  /** leave(), but wait briefly for the transport's goodbye to flush. */
  async leaveAndFlush(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    this.leave();
    await transport?.leaveAndFlush();
  }

  leave(): void {
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    if (this.posTimer !== null) clearInterval(this.posTimer);
    this.tickTimer = null;
    this.posTimer = null;
    this.deps.editManager.onLocalEntry = null;
    this.avatars.clear();
    this.transport?.leave();
    this.transport = null;
    this.session = null;
    this.secret = null;
  }

  static defaultRelays(): string[] {
    return CURATED_RELAYS;
  }
}
