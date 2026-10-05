import { describe, it, expect } from 'vitest';
import { Session } from './session';
import { WorldStore } from '../world/world-store';
import { Hlc } from './hlc';
import { LoopbackHub } from '../../net/loopback';
import { encodeChunkEntries } from '../codec/chunk-entries';
import { makeBlock, AIR } from '../world/block';

// §14 Sync: the network simulator. 2–6 replicas run the REAL session
// protocol over LoopbackTransport under skewed and backward clocks, drops,
// duplicates, reordering and partitions. Every replica must end with
// identical bytes and identical roots (§11.5 strong eventual consistency).

const SEED: [number, number] = [77, 88];
const WORLD_ID = new Uint8Array(16).fill(1);
const MATS = [makeBlock(1, false), makeBlock(5, false), makeBlock(6, true), AIR];

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}

interface Rig {
  session: Session;
  store: WorldStore;
  clock: { t: number; offset: number };
}

function makeRig(hub: LoopbackHub, i: number, offsetMs: number): Rig {
  const clock = { t: 1_000_000_000, offset: offsetMs };
  const store = new WorldStore(SEED);
  const session = new Session(
    {
      protocolVersion: 1,
      sessionId: BigInt(i + 1),
      name: `P${i}`,
      color: i,
      world: store,
      worldId: WORLD_ID,
      generatorVersion: 1,
      genCanary: 0xc0ffee,
      hlc: new Hlc(),
      now: () => clock.t + clock.offset,
    },
    hub.join(`P${i}`),
  );
  return { session, store, clock };
}

async function tickAll(hub: LoopbackHub, rigs: Rig[], advanceMs: number): Promise<void> {
  for (const r of rigs) r.clock.t += advanceMs;
  for (const r of rigs) await r.session.tick();
  hub.pump();
}

async function assertConverged(rigs: Rig[]): Promise<void> {
  const roots = await Promise.all(rigs.map((r) => r.session.rootHex()));
  for (const root of roots) expect(root).toBe(roots[0]);
  // Identical BYTES, not just identical digests:
  const keys = rigs[0]!.store.edits.chunkKeys().sort((a, b) => a - b);
  for (const r of rigs) {
    expect(r.store.edits.chunkKeys().sort((a, b) => a - b)).toEqual(keys);
    for (const k of keys) {
      expect(encodeChunkEntries(r.store.edits.snapshot(k))).toEqual(
        encodeChunkEntries(rigs[0]!.store.edits.snapshot(k)),
      );
    }
  }
}

describe('convergence simulator', () => {
  it.each([2, 4, 6])(
    'converges %i replicas under drops, dups, delays, partitions and skew',
    async (n) => {
      const rnd = sfc32(0xbeef, n, 42, 7);
      const hub = new LoopbackHub();
      // Skews within the 30 s admission bound, including negative.
      const rigs: Rig[] = [];
      for (let i = 0; i < n; i++) rigs.push(makeRig(hub, i, (i - n / 2) * 8_000));
      // Faulty network while editing.
      hub.faults = () => {
        const x = rnd();
        if (x < 0.1) return 'drop';
        if (x < 0.2) return 'duplicate';
        if (x < 0.4) return 'delay';
        return 'deliver';
      };
      await tickAll(hub, rigs, 1000);
      await tickAll(hub, rigs, 1000);

      let partitioned = false;
      for (let round = 0; round < 120; round++) {
        // Random edits, sometimes a backward-jumping clock (§11.2).
        const who = rigs[Math.floor(rnd() * n)]!;
        if (rnd() < 0.05) who.clock.t -= 3_000;
        who.session.localEdit(
          Math.floor(rnd() * 8),
          Math.floor(rnd() * 8),
          Math.floor(rnd() * 8),
          MATS[Math.floor(rnd() * MATS.length)]!,
        );
        if (round === 40) {
          hub.partition(
            new Set(rigs.slice(0, Math.ceil(n / 2)).map((_, i) => `P${i}`)),
            new Set(rigs.slice(Math.ceil(n / 2)).map((_, i) => `P${i + Math.ceil(n / 2)}`)),
          );
          partitioned = true;
        }
        if (round === 80 && partitioned) hub.heal();
        await tickAll(hub, rigs, 1_000);
      }

      // Stabilise: clean network, clocks marching forward.
      hub.heal();
      hub.faults = () => 'deliver';
      for (let i = 0; i < 40; i++) await tickAll(hub, rigs, 5_000);

      await assertConverged(rigs);
    },
    60_000,
  );

  it('causality: an edit made after seeing another always wins', async () => {
    const hub = new LoopbackHub();
    const a = makeRig(hub, 0, 0);
    const b = makeRig(hub, 1, -20_000); // B's wall clock is far behind
    for (let i = 0; i < 4; i++) await tickAll(hub, [a, b], 500);
    a.session.localEdit(3, 3, 3, MATS[0]!);
    for (let i = 0; i < 3; i++) await tickAll(hub, [a, b], 500);
    expect(b.store.blockAt(3, 3, 3)).toBe(MATS[0]);
    b.session.localEdit(3, 3, 3, MATS[1]!); // B saw A's edit, then overwrote
    for (let i = 0; i < 3; i++) await tickAll(hub, [a, b], 500);
    expect(a.store.blockAt(3, 3, 3)).toBe(MATS[1]);
    expect(b.store.blockAt(3, 3, 3)).toBe(MATS[1]);
  });

  it('clock-ahead repair: +3 h offline edits restamp, then converge', async () => {
    // Offline play with a fast clock.
    const store = new WorldStore(SEED);
    const fastHlc = new Hlc();
    const realNow = 1_000_000_000;
    const fast = realNow + 3 * 3600 * 1000;
    for (let i = 0; i < 10; i++) {
      store.localEdit(i, 2, 2, MATS[0]!, fastHlc.send(fast + i), 42n);
    }
    // Clock corrected at open: repair, then join.
    const hlc = new Hlc();
    const repaired = store.repairClockAhead(realNow, hlc, 42n);
    expect(repaired).toBe(10);
    for (const key of store.edits.chunkKeys()) {
      for (const e of store.edits.snapshot(key)) {
        expect(e.l).toBeLessThanOrEqual(realNow + 60_000);
      }
    }
    // Values and relative order preserved.
    expect(store.blockAt(9, 2, 2)).toBe(MATS[0]);

    const hub = new LoopbackHub();
    const joiner = makeRig(hub, 1, 0);
    const owner: Rig = {
      store,
      clock: { t: realNow, offset: 0 },
      session: null as unknown as Session,
    };
    owner.session = new Session(
      {
        protocolVersion: 1,
        sessionId: 42n,
        name: 'owner',
        color: 0,
        world: store,
        worldId: WORLD_ID,
        generatorVersion: 1,
        genCanary: 0xc0ffee,
        hlc,
        now: () => owner.clock.t,
      },
      hub.join('owner'),
    );
    for (let i = 0; i < 12; i++) await tickAll(hub, [owner, joiner], 1_000);
    expect(joiner.session.deferredCount).toBe(0);
    await assertConverged([owner, joiner]);
  });

  it('a 1e5-entry join completes within the caps, and measures footprint', async () => {
    // Preload the store BEFORE its session exists — the session seeds its
    // digest set from the store at construction.
    const store = new WorldStore(SEED);
    const heapBefore = process.memoryUsage().heapUsed;
    const hlc = new Hlc();
    let t = 1_000_000;
    for (let i = 0; i < 100_000; i++) {
      // 4 chunks, clustered edits.
      const chunkKey = store.locate((i % 4) * 32, 8, 0).chunkKey;
      store.applyRemote(chunkKey, i % 32768, {
        value: MATS[i % 3]!,
        ...hlc.send(t++),
        peer: 42n,
      });
    }
    const heapAfter = process.memoryUsage().heapUsed;
    const perEntry = (heapAfter - heapBefore) / 100_000;
    console.log(`memory per entry ≈ ${perEntry.toFixed(0)} B (D-23 input)`);
    let blobBytes = 0;
    for (const k of store.edits.chunkKeys()) {
      blobBytes += encodeChunkEntries(store.edits.snapshot(k)).length;
    }
    console.log(`encoded size for 1e5 clustered entries: ${(blobBytes / 1024).toFixed(0)} KiB`);

    const hub = new LoopbackHub();
    const clock = { t: 1_000_000_000, offset: 0 };
    const a: Rig = {
      store,
      clock,
      session: new Session(
        {
          protocolVersion: 1,
          sessionId: 1n,
          name: 'A',
          color: 0,
          world: store,
          worldId: WORLD_ID,
          generatorVersion: 1,
          genCanary: 0xc0ffee,
          hlc,
          now: () => clock.t,
        },
        hub.join('A'),
      ),
    };
    const b = makeRig(hub, 1, 0);
    for (let i = 0; i < 20; i++) await tickAll(hub, [a, b], 2_000);
    expect(b.store.edits.entryCount).toBe(a.store.edits.entryCount);
    await assertConverged([a, b]);
  }, 120_000);
});
