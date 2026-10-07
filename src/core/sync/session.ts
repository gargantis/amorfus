// §10.3 session + §11.3 validation + §11.4 anti-entropy, over a Transport.
// No timers of its own: the driver calls tick(), so tests and the
// convergence simulator own time completely.
import type { Transport, Channel } from '../../net/transport';
import type { LwwStore } from './lww';
import type { Hlc } from './hlc';
import type { Entry } from './lww';
import { isCanonical } from '../world/block';
import { encodeChunkEntries, decodeChunkEntries, splitChunkEntries } from '../codec/chunk-entries';
import { chunkDigest, rootDigest } from './digest';
import { CodecError } from '../codec/varint';
import {
  MSG, MAX_MESSAGE_BYTES, decodeMessageType,
  encodeHello, decodeHello, type Hello,
  encodeRefuse, decodeRefuse, type RefuseReason,
  encodeEdits, decodeEdits, type WireEntry,
  encodeRoot, decodeRoot,
  encodeChunkDigests, decodeChunkDigests,
  encodeWant, decodeWant,
  encodePeers, decodePeers,
  encodeChunkEntriesMsg, decodeChunkEntriesMsg,
} from './messages';

const MAX_CHUNK_KEY = 2 ** 19 * 2 ** 19 * 24;
const FUTURE_WINDOW_MS = 60_000;
const SKEW_WARN_MS = 2_000;
const SKEW_REFUSE_MS = 30_000;
const DEFER_CAP = 4096;
const RATE_PER_SEC = 50;
const RATE_BURST = 500;
const ROUND_PACE_MS = 15_000;
const PEERS_GOSSIP_MS = 5_000;
const BULK_ENTRY_CAP = 4e6; // D-23
const BULK_FRAMES_PER_TICK = 32; // ≈ 512 KiB per tick
const PART_BYTES = MAX_MESSAGE_BYTES - 16;

/** What the session needs from the world — WorldStore satisfies it, and
 *  the game supplies an adapter over its streamed caches. */
export interface SessionWorld {
  readonly seed: readonly [number, number];
  readonly edits: LwwStore;
  applyRemote(chunkKey: number, index: number, entry: Entry): boolean;
  localEdit(
    x: number, y: number, z: number,
    value: number, stamp: { l: number; c: number }, peer: bigint,
  ): Entry | null;
  locate(x: number, y: number, z: number): { chunkKey: number; index: number };
}

export interface SessionConfig {
  protocolVersion: number;
  sessionId: bigint;
  name: string;
  color: number;
  world: SessionWorld;
  worldId: Uint8Array;
  generatorVersion: number;
  genCanary: number;
  hlc: Hlc;
  now: () => number;
  maxPeers?: number;
  /** §11.4: wall-clock budget for draining the inbox per tick; frames
   *  beyond it wait for the next tick. Unset = drain everything. */
  inboxBudgetMs?: number;
  /** §10.3: a joiner without the room's world sends hasWorld = false and
   *  BINDS to the first HELLO that carries one (review #2). */
  announceWorld?: boolean;
}

interface PeerState {
  sessionId: bigint;
  hello: Hello;
  theirRoot: string | null;
  lastSentRoot: string | null;
  nextRoundAt: number;
  neighbours: Set<bigint>;
  buckets: Map<bigint, { tokens: number; at: number }>;
  /** per-CONNECTION total: originSession is sender-controlled, so the
   *  per-origin buckets alone could be rotated around */
  totalBucket: { tokens: number; at: number } | null;
  bulkEntries: number;
  warned: boolean;
}

interface Frame {
  from: string;
  bytes: Uint8Array;
  channel: Channel;
}

interface DeferredOp {
  chunkKey: number;
  index: number;
  entry: Entry;
}

export class Session {
  private cfg: Required<Pick<SessionConfig, 'maxPeers'>> & SessionConfig;
  private transport: Transport;
  private inbox: Frame[] = [];
  private peersByTransport = new Map<string, PeerState>();
  private closed = new Set<string>();
  /** Next HELLO (re)send time per transport peer: handshakes retry until
   *  admitted or refused, because a lossy path can eat the first frame. */
  private helloNextAt = new Map<string, number>();
  private deferred = new Map<string, DeferredOp>();
  private bulkOut = new Map<
    string,
    { frames: Array<{ key: number; bytes: Uint8Array; last: boolean }>; head: number; keys: Set<number> }
  >();
  private digests = new Map<number, Uint8Array>();
  private dirtyChunks = new Set<number>();
  private rootCache: string | null = null;
  private appliedSinceRoot = false;
  private nextGossipAt = 0;
  private gossipDirty = false;

  onRefused: ((reason: RefuseReason) => void) | null = null;
  onSkewWarning: ((sessionId: bigint) => void) | null = null;
  /** §10.3 worldless join: fired once, with the first offered world. */
  onWorldOffer: ((world: import('./messages').HelloWorld) => void) | null = null;
  private adoptedWorld: import('./messages').HelloWorld | null = null;

  /** POS frames (pos channel, §11.6): raw 31-byte payloads. */
  onPos: ((from: string, payload: Uint8Array) => void) | null = null;
  /** REKEY (§10.2): the new secret, from a directly connected peer. */
  onRekey: ((from: string, newSecret: string) => void) | null = null;
  /** Why each connection closed — for tests and the M7 failure UX. */
  readonly closeLog: Array<{ peer: string; why: string }> = [];

  constructor(cfg: SessionConfig, transport: Transport) {
    this.cfg = { maxPeers: 8, ...cfg };
    this.transport = transport;
    transport.onMessage((from, bytes, channel) => {
      // REFUSE passes the closed filter: when a mismatch is symmetric both
      // sides refuse at once, and the joiner must still learn the reason
      // (§10.3) even though it already closed the peer itself.
      if (!this.closed.has(from) || decodeMessageType(bytes) === MSG.REFUSE) {
        this.inbox.push({ from, bytes, channel });
      }
    });
    // Chunks edited before this session existed still take part in
    // anti-entropy: seed the digest set from the store.
    for (const key of cfg.world.edits.chunkKeys()) this.dirtyChunks.add(key);
    transport.onPeerJoin((p) => this.sendHello(p));
    transport.onPeerLeave((p) => {
      this.peersByTransport.delete(p);
      this.gossipDirty = true;
    });
    for (const p of transport.peers()) this.sendHello(p);
  }

  /** test access to the raw transport (for injecting hostile frames) */
  get transportForTest(): Transport {
    return this.transport;
  }

  get deferredCount(): number {
    return this.deferred.size;
  }

  admitted(): string[] {
    return [...this.peersByTransport.keys()].sort();
  }

  // ---- outbound ----

  private sendHello(to: string): void {
    this.helloNextAt.set(to, this.cfg.now() + 2_000);
    this.transport.send(
      to,
      encodeHello({
        protocolVersion: this.cfg.protocolVersion,
        sessionId: this.cfg.sessionId,
        wallClock: this.cfg.now(),
        hlc: this.cfg.hlc.state(),
        name: this.cfg.name,
        color: this.cfg.color,
        world:
          (this.cfg.announceWorld ?? true)
            ? {
                worldId: this.cfg.worldId,
                seed: [this.cfg.world.seed[0], this.cfg.world.seed[1]],
                generatorVersion: this.cfg.generatorVersion,
                genCanary: this.cfg.genCanary,
              }
            : null,
      }),
      'action',
    );
  }

  /** Broadcast an entry the game already applied locally (M7 glue). */
  broadcastLocalEntry(chunkKey: number, index: number, entry: Entry): void {
    this.markDirty(chunkKey);
    this.broadcastEdits(
      [{ chunkKey, index, value: entry.value, l: entry.l, c: entry.c, peer: entry.peer }],
      this.cfg.sessionId,
      null,
    );
  }

  localEdit(x: number, y: number, z: number, value: number): Entry | null {
    const stamp = this.cfg.hlc.send(this.cfg.now());
    const entry = this.cfg.world.localEdit(x, y, z, value, stamp, this.cfg.sessionId);
    if (entry === null) return null;
    const { chunkKey, index } = this.cfg.world.locate(x, y, z);
    this.markDirty(chunkKey);
    this.broadcastEdits(
      [{ chunkKey, index, value: entry.value, l: entry.l, c: entry.c, peer: entry.peer }],
      this.cfg.sessionId,
      null,
    );
    return entry;
  }

  private broadcastEdits(entries: WireEntry[], origin: bigint, except: string | null): void {
    if (entries.length === 0) return;
    const msg = encodeEdits({ originSession: origin, entries });
    for (const [tid, peer] of this.peersByTransport) {
      if (tid === except) continue;
      if (origin !== this.cfg.sessionId) {
        // §10.3 forwarding: only to neighbours not connected to the origin.
        if (peer.sessionId === origin) continue;
        if (peer.neighbours.has(origin)) continue;
      }
      this.transport.send(tid, msg, 'action');
    }
  }

  // ---- inbound ----

  private close(from: string, why: string): void {
    this.closeLog.push({ peer: from, why });
    this.peersByTransport.delete(from);
    this.closed.add(from);
    this.gossipDirty = true;
  }

  private refuse(from: string, reason: RefuseReason): void {
    this.transport.send(from, encodeRefuse(reason), 'action');
    this.close(from, `refused: ${reason}`);
  }

  private handleHello(from: string, hello: Hello): void {
    if (this.peersByTransport.has(from)) return; // repeat HELLO
    // The inbox is read a tick late, so this HELLO can outlive its sender;
    // no second leave would ever remove a peer admitted now.
    if (!this.transport.peers().includes(from)) return;
    if (hello.protocolVersion !== this.cfg.protocolVersion) {
      this.refuse(from, 'protocol-mismatch');
      return;
    }
    const w = hello.world;
    if (w !== null) {
      if (w.generatorVersion !== this.cfg.generatorVersion || w.genCanary !== this.cfg.genCanary) {
        this.refuse(from, 'generator-mismatch');
        return;
      }
      if (this.cfg.announceWorld ?? true) {
        if (
          !bytesEqual(w.worldId, this.cfg.worldId) ||
          w.seed[0] !== this.cfg.world.seed[0] ||
          w.seed[1] !== this.cfg.world.seed[1]
        ) {
          this.refuse(from, 'different-world');
          return;
        }
      } else if (this.adoptedWorld === null) {
        // §10.3: bind to the first HELLO that carries a world; every
        // later HELLO must match it.
        this.adoptedWorld = w;
        this.onWorldOffer?.(w);
      } else if (
        !bytesEqual(w.worldId, this.adoptedWorld.worldId) ||
        w.seed[0] !== this.adoptedWorld.seed[0] ||
        w.seed[1] !== this.adoptedWorld.seed[1]
      ) {
        this.refuse(from, 'different-world');
        return;
      }
    }
    const skew = Math.abs(hello.wallClock - this.cfg.now());
    if (skew > SKEW_REFUSE_MS) {
      this.refuse(from, 'clock-skew');
      return;
    }
    if (this.peersByTransport.size >= this.cfg.maxPeers - 1) {
      this.refuse(from, 'room-full');
      return;
    }
    const state: PeerState = {
      sessionId: hello.sessionId,
      hello,
      theirRoot: null,
      lastSentRoot: null,
      nextRoundAt: 0,
      neighbours: new Set(),
      buckets: new Map(),
      totalBucket: null,
      bulkEntries: 0,
      warned: false,
    };
    this.peersByTransport.set(from, state);
    this.gossipDirty = true;
    // §11.3's "cannot push clocks more than 60 s ahead" must hold for
    // HELLO too, not just EDITS: a forged hlc.l would poison our clock
    // and get every later local edit deferred by honest peers.
    const hlcCap = hello.wallClock + FUTURE_WINDOW_MS;
    this.cfg.hlc.recv(
      hello.hlc.l > hlcCap ? { l: hlcCap, c: 0 } : hello.hlc,
      this.cfg.now(),
    );
    if (skew > SKEW_WARN_MS && !state.warned) {
      state.warned = true;
      this.onSkewWarning?.(hello.sessionId);
    }
    this.sendHello(from);
  }

  /** §11.3 structural check: depends only on the op's bytes. */
  private structurallyValid(e: WireEntry): boolean {
    return (
      Number.isInteger(e.chunkKey) && e.chunkKey >= 0 && e.chunkKey < MAX_CHUNK_KEY &&
      Number.isInteger(e.index) && e.index >= 0 && e.index < 32768 &&
      isCanonical(e.value) &&
      e.l < 2 ** 47 &&
      e.peer !== 0n
    );
  }

  /** Apply one validated entry; future stamps go to the deferral map. */
  private applyOrDefer(e: WireEntry): boolean {
    if (e.l > this.cfg.now() + FUTURE_WINDOW_MS) {
      return this.defer(e);
    }
    // §11.2 causality: receiving an edit advances the HLC, so an edit made
    // after SEEING this one always carries a larger stamp. Deferred stamps
    // deliberately do not reach the clock (≤ 60 s push bound).
    this.cfg.hlc.recv({ l: e.l, c: e.c }, this.cfg.now());
    const won = this.cfg.world.applyRemote(e.chunkKey, e.index, {
      value: e.value, l: e.l, c: e.c, peer: e.peer,
    });
    if (won) this.markDirty(e.chunkKey);
    return won;
  }

  private defer(e: WireEntry): boolean {
    const key = `${e.chunkKey}:${e.index}:${e.l}:${e.c}:${e.peer}`;
    if (!this.deferred.has(key)) {
      if (this.deferred.size >= DEFER_CAP) {
        // Evict the largest l: it was never accepted; anti-entropy
        // offers it again (§11.3).
        let worstKey: string | null = null;
        let worstL = -1;
        for (const [k, op] of this.deferred) {
          if (op.entry.l > worstL) {
            worstL = op.entry.l;
            worstKey = k;
          }
        }
        if (worstL <= e.l) return false;
        if (worstKey !== null) this.deferred.delete(worstKey);
      }
      this.deferred.set(key, {
        chunkKey: e.chunkKey,
        index: e.index,
        entry: { value: e.value, l: e.l, c: e.c, peer: e.peer },
      });
    }
    return false;
  }

  private handleEdits(from: string, bytes: Uint8Array): void {
    const peer = this.peersByTransport.get(from);
    if (peer === undefined) return;
    const edits = decodeEdits(bytes);

    // Rate cap per (connection, origin session) — §11.3 — AND per
    // connection in total, since originSession is sender-controlled.
    const nowS = this.cfg.now() / 1000;
    if (peer.totalBucket === null) peer.totalBucket = { tokens: RATE_BURST, at: nowS };
    const total = peer.totalBucket;
    total.tokens = Math.min(RATE_BURST, total.tokens + Math.max(0, nowS - total.at) * RATE_PER_SEC);
    total.at = nowS;
    if (edits.entries.length > total.tokens) {
      this.close(from, 'rate cap exceeded (connection total)');
      return;
    }
    total.tokens -= edits.entries.length;
    let bucket = peer.buckets.get(edits.originSession);
    if (bucket === undefined) {
      if (peer.buckets.size >= 64) {
        this.close(from, 'too many distinct origin sessions');
        return;
      }
      bucket = { tokens: RATE_BURST, at: nowS };
      peer.buckets.set(edits.originSession, bucket);
    }
    // A backward wall-clock jump must never DRAIN the bucket (§11.2 allows
    // backward clocks); only forward time refills it.
    bucket.tokens = Math.min(
      RATE_BURST,
      bucket.tokens + Math.max(0, nowS - bucket.at) * RATE_PER_SEC,
    );
    bucket.at = nowS;
    if (edits.entries.length > bucket.tokens) {
      this.close(from, 'rate cap exceeded');
      return;
    }
    bucket.tokens -= edits.entries.length;

    const won: WireEntry[] = [];
    for (const e of edits.entries) {
      if (!this.structurallyValid(e)) {
        this.close(from, 'invalid entry in EDITS');
        return;
      }
      if (this.applyOrDefer(e)) won.push(e);
    }
    if (won.length > 0) {
      this.appliedSinceRoot = true;
      // Forward-on-change, only entries that actually won (natural dedup),
      // only for origins announced by a current member (§10.3).
      if (this.isAnnounced(edits.originSession)) {
        this.broadcastEdits(won, edits.originSession, from);
      }
    }
  }

  private isAnnounced(sessionId: bigint): boolean {
    if (sessionId === this.cfg.sessionId) return true;
    for (const p of this.peersByTransport.values()) {
      if (p.sessionId === sessionId) return true;
    }
    return false;
  }

  private async handleRoot(from: string, bytes: Uint8Array): Promise<void> {
    const peer = this.peersByTransport.get(from);
    if (peer === undefined) return;
    // D-23 bounds one TRANSFER, not the connection's lifetime: a new
    // reconciliation round starts a new transfer budget.
    peer.bulkEntries = 0;
    peer.theirRoot = hex(decodeRoot(bytes));
    const ours = await this.root();
    if (peer.theirRoot !== ours) {
      const digests = await this.allDigests();
      this.transport.send(from, encodeChunkDigests(digests), 'action');
    }
  }

  private async handleChunkDigests(from: string, bytes: Uint8Array): Promise<void> {
    const peer = this.peersByTransport.get(from);
    if (peer === undefined) return;
    const theirs = decodeChunkDigests(bytes);
    await this.refreshDigests();
    const want: number[] = [];
    const theirKeys = new Set<number>();
    for (const [key, digest] of theirs) {
      theirKeys.add(key);
      const ours = this.digests.get(key);
      if (ours === undefined || hex(ours) !== hex(digest)) want.push(key);
    }
    if (want.length > 0) {
      // WANT stays within one message; anti-entropy loops for the rest.
      this.transport.send(from, encodeWant(want.slice(0, 2048)), 'action');
    }
    // Push chunks they do not have at all.
    for (const key of this.digests.keys()) {
      if (!theirKeys.has(key)) this.sendChunk(from, key);
    }
  }

  private handleWant(from: string, bytes: Uint8Array): void {
    if (!this.peersByTransport.has(from)) return;
    for (const key of decodeWant(bytes)) this.sendChunk(from, key);
  }

  /** Bulk frames are QUEUED per peer and paced by tick() under the
   *  transport's backpressure (review #13): a large world must never be
   *  pushed into a data channel in one synchronous burst. A chunk already
   *  queued for a peer is not queued again. */
  private sendChunk(to: string, chunkKey: number): void {
    let q = this.bulkOut.get(to);
    if (q === undefined) {
      q = { frames: [], head: 0, keys: new Set() };
      this.bulkOut.set(to, q);
    }
    if (q.keys.has(chunkKey)) return;
    const entries = this.cfg.world.edits.snapshot(chunkKey);
    const parts = splitChunkEntries(entries, PART_BYTES);
    q.keys.add(chunkKey);
    parts.forEach((part, i) => {
      q.frames.push({
        key: chunkKey,
        bytes: encodeChunkEntriesMsg(chunkKey, part),
        last: i === parts.length - 1,
      });
    });
  }

  private drainBulk(): void {
    for (const [tid, q] of this.bulkOut) {
      if (!this.peersByTransport.has(tid)) {
        this.bulkOut.delete(tid);
        continue;
      }
      let sent = 0;
      while (
        q.head < q.frames.length &&
        sent < BULK_FRAMES_PER_TICK &&
        (this.transport.canSend?.(tid, 'bulk') ?? true)
      ) {
        const f = q.frames[q.head]!;
        q.head += 1;
        this.transport.send(tid, f.bytes, 'bulk');
        if (f.last) q.keys.delete(f.key);
        sent += 1;
      }
      if (q.head >= q.frames.length) this.bulkOut.delete(tid);
      else if (q.head > 1024) {
        q.frames = q.frames.slice(q.head);
        q.head = 0;
      }
    }
  }

  private handleChunkEntries(from: string, bytes: Uint8Array): void {
    const peer = this.peersByTransport.get(from);
    if (peer === undefined) return;
    const { chunkKey, part } = decodeChunkEntriesMsg(bytes);
    if (!(Number.isInteger(chunkKey) && chunkKey >= 0 && chunkKey < MAX_CHUNK_KEY)) {
      this.close(from, 'invalid chunk key in CHUNK_ENTRIES');
      return;
    }
    const entries = decodeChunkEntries(part);
    peer.bulkEntries += entries.length;
    if (peer.bulkEntries > BULK_ENTRY_CAP) {
      this.close(from, 'bulk transfer cap (D-23)');
      return;
    }
    for (const e of entries) {
      const wire: WireEntry = { chunkKey, index: e.index, value: e.value, l: e.l, c: e.c, peer: e.peer };
      if (!this.structurallyValid(wire)) {
        this.close(from, 'invalid entry in CHUNK_ENTRIES');
        return;
      }
      if (this.applyOrDefer(wire)) this.appliedSinceRoot = true;
    }
  }

  private handlePeers(from: string, bytes: Uint8Array): void {
    const peer = this.peersByTransport.get(from);
    if (peer === undefined) return;
    peer.neighbours = new Set(decodePeers(bytes).neighbours);
  }

  // ---- digests ----

  private markDirty(chunkKey: number): void {
    this.dirtyChunks.add(chunkKey);
    this.rootCache = null;
  }

  private async refreshDigests(): Promise<void> {
    for (const key of this.dirtyChunks) {
      const entries = this.cfg.world.edits.snapshot(key);
      this.digests.set(key, await chunkDigest(encodeChunkEntries(entries)));
    }
    this.dirtyChunks.clear();
  }

  private async allDigests(): Promise<Array<[number, Uint8Array]>> {
    await this.refreshDigests();
    return [...this.digests.entries()].sort((a, b) => a[0] - b[0]);
  }

  private async root(): Promise<string> {
    if (this.rootCache === null || this.dirtyChunks.size > 0) {
      await this.refreshDigests();
      this.rootCache = hex(await rootDigest(this.digests.entries()));
    }
    return this.rootCache;
  }

  /** Send a POS payload to every admitted peer on the pos channel. */
  sendPos(payload: Uint8Array): void {
    const framed = new Uint8Array(1 + payload.byteLength);
    framed[0] = MSG.POS;
    framed.set(payload, 1);
    for (const tid of this.peersByTransport.keys()) this.transport.send(tid, framed, 'pos');
  }

  /** §10.2 REKEY: directly (never forwarded) to the ticked peers. */
  sendRekey(newSecret: string, toTransportIds: readonly string[]): void {
    const body = new TextEncoder().encode(newSecret);
    const framed = new Uint8Array(1 + body.byteLength);
    framed[0] = MSG.REKEY;
    framed.set(body, 1);
    for (const tid of toTransportIds) {
      if (this.peersByTransport.has(tid)) this.transport.send(tid, framed, 'action');
    }
  }

  /** Review #2: after adopting the room's world, the SAME connection
   *  keeps running over a fresh local store — reset the digest state so
   *  anti-entropy pulls the adopted world in. */
  rebindWorld(world: SessionWorld): void {
    (this.cfg as { world: SessionWorld }).world = world;
    this.digests.clear();
    this.dirtyChunks.clear();
    for (const key of world.edits.chunkKeys()) this.dirtyChunks.add(key);
    this.rootCache = null;
    this.appliedSinceRoot = true;
    for (const peer of this.peersByTransport.values()) peer.lastSentRoot = null;
  }

  async rootHex(): Promise<string> {
    return this.root();
  }

  // ---- the pump ----

  async tick(): Promise<void> {
    // 1. Drain the inbox, within the wall-clock budget when one is set
    //    (§11.4: applying bulk data must not stall the frame loop).
    const frames = this.inbox;
    this.inbox = [];
    const budget = this.cfg.inboxBudgetMs;
    const t0 = budget !== undefined ? wallNow() : 0;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]!;
      if (this.closed.has(frame.from) && decodeMessageType(frame.bytes) !== MSG.REFUSE) continue;
      try {
        await this.dispatch(frame);
      } catch (err) {
        if (err instanceof CodecError) this.close(frame.from, `codec: ${err.message}`);
        else throw err;
      }
      if (budget !== undefined && i + 1 < frames.length && wallNow() - t0 >= budget) {
        // frames that arrived during the awaits above stay behind these
        this.inbox = frames.slice(i + 1).concat(this.inbox);
        break;
      }
    }

    // 1b. Paced bulk sends under transport backpressure.
    this.drainBulk();

    // 2. Matured deferred ops (§11.3: time only defers).
    const now = this.cfg.now();
    for (const [key, op] of this.deferred) {
      if (op.entry.l <= now + FUTURE_WINDOW_MS) {
        this.deferred.delete(key);
        if (this.cfg.world.applyRemote(op.chunkKey, op.index, op.entry)) {
          this.markDirty(op.chunkKey);
          this.appliedSinceRoot = true;
        }
      }
    }

    // 3. Anti-entropy pacing (§11.4).
    const ours = await this.root();
    for (const [tid, peer] of this.peersByTransport) {
      const mismatch = peer.theirRoot !== null && peer.theirRoot !== ours;
      const due =
        peer.lastSentRoot === null ||
        (this.appliedSinceRoot && peer.lastSentRoot !== ours) ||
        (mismatch && now >= peer.nextRoundAt);
      if (due) {
        this.transport.send(tid, encodeRoot(unhex(ours)), 'action');
        peer.lastSentRoot = ours;
        peer.nextRoundAt = now + ROUND_PACE_MS;
      }
    }
    this.appliedSinceRoot = false;

    // 3b. Handshake retry: a dropped HELLO must not strand the pair.
    for (const tid of this.transport.peers()) {
      if (this.peersByTransport.has(tid) || this.closed.has(tid)) continue;
      const at = this.helloNextAt.get(tid);
      if (at === undefined || now >= at) this.sendHello(tid);
    }

    // 4. PEERS gossip: on change and every 5 s (§10.3).
    if (this.gossipDirty || now >= this.nextGossipAt) {
      this.gossipDirty = false;
      this.nextGossipAt = now + PEERS_GOSSIP_MS;
      const neighbours = [...this.peersByTransport.values()].map((p) => p.sessionId);
      const msg = encodePeers({
        neighbours,
        members: [this.cfg.sessionId, ...neighbours],
      });
      for (const tid of this.peersByTransport.keys()) this.transport.send(tid, msg, 'action');
    }
  }

  private async dispatch(frame: Frame): Promise<void> {
    const type = decodeMessageType(frame.bytes);
    switch (type) {
      case MSG.HELLO:
        this.handleHello(frame.from, decodeHello(frame.bytes));
        break;
      case MSG.REFUSE:
        this.onRefused?.(decodeRefuse(frame.bytes));
        this.close(frame.from, 'peer refused us');
        break;
      case MSG.EDITS:
        this.handleEdits(frame.from, frame.bytes);
        break;
      case MSG.ROOT:
        await this.handleRoot(frame.from, frame.bytes);
        break;
      case MSG.CHUNK_DIGESTS:
        await this.handleChunkDigests(frame.from, frame.bytes);
        break;
      case MSG.WANT:
        this.handleWant(frame.from, frame.bytes);
        break;
      case MSG.PEERS:
        this.handlePeers(frame.from, frame.bytes);
        break;
      case MSG.CHUNK_ENTRIES:
        this.handleChunkEntries(frame.from, frame.bytes);
        break;
      case MSG.POS:
        if (this.peersByTransport.has(frame.from)) {
          this.onPos?.(frame.from, frame.bytes.subarray(1));
        }
        break;
      case MSG.REKEY: {
        if (!this.peersByTransport.has(frame.from)) break;
        const text = new TextDecoder().decode(frame.bytes.subarray(1));
        this.onRekey?.(frame.from, text);
        break;
      }
      default:
        throw new CodecError(`unknown message type ${type}`);
    }
  }
}

function wallNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function unhex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
