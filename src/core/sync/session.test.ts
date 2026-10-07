import { describe, it, expect } from 'vitest';
import { Session, type SessionConfig } from './session';
import { WorldStore } from '../world/world-store';
import { Hlc } from './hlc';
import { LoopbackHub } from '../../net/loopback';
import { makeBlock } from '../world/block';

// §10.3 handshake and admission, §11.3 validation, §11.4 anti-entropy.
// Sessions are driven explicitly: hub.pump() moves frames, session.tick()
// processes them — time belongs to the test.

const SEED: [number, number] = [11, 22];
const WORLD_ID = new Uint8Array(16).fill(3);
const PLANKS = makeBlock(5, false);
const BRICK = makeBlock(6, false);

interface Rig {
  session: Session;
  store: WorldStore;
  now: { t: number };
}

function makeSession(
  hub: LoopbackHub,
  id: string,
  opts: Partial<SessionConfig> & { startClock?: number; worldId?: Uint8Array } = {},
): Rig {
  const now = { t: opts.startClock ?? 1_000_000 };
  const store = new WorldStore(SEED);
  const session = new Session(
    {
      protocolVersion: 1,
      sessionId: BigInt(id.charCodeAt(0)),
      name: id,
      color: 1,
      world: store,
      worldId: opts.worldId ?? WORLD_ID,
      generatorVersion: 1,
      genCanary: 0xc0ffee,
      hlc: new Hlc(),
      now: () => now.t,
      ...opts,
    },
    hub.join(id),
  );
  return { session, store, now };
}

async function settle(hub: LoopbackHub, rigs: Rig[], rounds = 30): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    for (const r of rigs) await r.session.tick();
    hub.pump();
  }
}

describe('Session', () => {
  it('admits a matching peer after HELLO exchange', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    expect(a.session.admitted()).toEqual(['B']);
    expect(b.session.admitted()).toEqual(['A']);
  });

  // The inbox is read on the next tick, so a HELLO can outlive its sender.
  // Admitting it left a player nothing ever removed: the host of a real
  // join counted the joiner's pre-reload connection for good.
  it('does not admit a peer whose HELLO is read after it left', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    makeSession(hub, 'B');
    hub.pump(); // B's HELLO now waits in A's inbox
    hub.remove('B');
    await settle(hub, [a], 4);
    expect(a.session.admitted()).toEqual([]);
  });

  it('does not admit a peer that leaves while its HELLO waits behind another frame', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const c = makeSession(hub, 'C');
    makeSession(hub, 'B');
    hub.pump(); // A's inbox: HELLO from C, then HELLO from B
    const ticking = a.session.tick(); // suspends after C's HELLO
    hub.remove('B');
    await ticking;
    await settle(hub, [a, c], 4);
    expect(a.session.admitted()).toEqual(['C']);
  });

  it.each([
    ['protocol-mismatch', { protocolVersion: 2 }],
    ['generator-mismatch', { generatorVersion: 9 }],
    ['generator-mismatch', { genCanary: 1 }],
    ['different-world', { worldId: new Uint8Array(16).fill(9) }],
    ['clock-skew', { startClock: 1_000_000 + 31_000 }],
  ] as const)('refuses %s', async (reason, override) => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const refusals: string[] = [];
    const b = makeSession(hub, 'B', override);
    b.session.onRefused = (r) => refusals.push(r);
    await settle(hub, [a, b], 4);
    expect(a.session.admitted()).toEqual([]);
    expect(refusals).toContain(reason);
  });

  it('warns above 2 s of skew but still admits', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const warnings: bigint[] = [];
    a.session.onSkewWarning = (sid) => warnings.push(sid);
    const b = makeSession(hub, 'B', { startClock: 1_000_000 + 5_000 });
    await settle(hub, [a, b], 4);
    expect(a.session.admitted()).toEqual(['B']);
    expect(warnings).toHaveLength(1);
  });

  it('clamps a forged HELLO hlc so a peer cannot poison the clock (review #5)', async () => {
    const hub = new LoopbackHub();
    const sender = makeSession(hub, 'B');
    const victim = makeSession(hub, 'V');
    const honestWallClock = victim.now.t;
    // An honest wall clock (passes the skew check) with hlc.l far ahead.
    const { encodeHello } = await import('./messages');
    sender.session.transportForTest.send(
      'V',
      encodeHello({
        protocolVersion: 1,
        sessionId: 99n,
        wallClock: honestWallClock,
        hlc: { l: 2 ** 46, c: 0 },
        name: 'forged',
        color: 0,
        world: { worldId: WORLD_ID, seed: SEED, generatorVersion: 1, genCanary: 0xc0ffee },
      }),
      'action',
    );
    hub.pump();
    await victim.session.tick();
    const entry = victim.session.localEdit(3, 3, 3, PLANKS);
    expect(entry).not.toBeNull();
    expect(entry!.l).toBeLessThanOrEqual(honestWallClock + 60_000 + 1000);
  });

  it('closes a connection that rotates originSession past the total cap (review #16)', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    const { encodeEdits } = await import('./messages');
    for (const origin of [111n, 222n]) {
      const entries = [];
      for (let i = 0; i < 400; i++) {
        entries.push({ chunkKey: 4521984, index: (Number(origin) + i) % 32768, value: PLANKS, l: i + 1, c: 0, peer: origin });
      }
      b.session.transportForTest.send('A', encodeEdits({ originSession: origin, entries }), 'action');
    }
    hub.pump();
    await a.session.tick();
    // 800 entries in one instant across two origins: the connection-total
    // 500 burst closes it even though each origin stayed under its own.
    expect(a.session.admitted()).toEqual([]);
  });

  it('a worldless joiner binds to the first world HELLO (§10.3, review #2)', async () => {
    const hub = new LoopbackHub();
    const host = makeSession(hub, 'A');
    const offers: Array<{ worldId: Uint8Array; seed: [number, number] }> = [];
    const joiner = makeSession(hub, 'B', { announceWorld: false });
    joiner.session.onWorldOffer = (w) => offers.push({ worldId: w.worldId, seed: w.seed });
    await settle(hub, [host, joiner], 4);
    // Both sides admit even though the joiner's local worldId differs.
    expect(host.session.admitted()).toEqual(['B']);
    expect(joiner.session.admitted()).toEqual(['A']);
    expect(offers).toHaveLength(1);
    expect([...offers[0]!.worldId]).toEqual([...WORLD_ID]);
    // A SECOND host with a different world is refused by the joiner.
    const other = makeSession(hub, 'C', { worldId: new Uint8Array(16).fill(9) });
    await settle(hub, [host, joiner, other], 4);
    expect(joiner.session.admitted()).toEqual(['A']);
  });

  it('a worldless joiner still refuses generator mismatches', async () => {
    const hub = new LoopbackHub();
    makeSession(hub, 'A', { genCanary: 123 });
    const refusals: string[] = [];
    const joiner = makeSession(hub, 'B', { announceWorld: false });
    joiner.session.onRefused = (r) => refusals.push(r);
    const rigs = [joiner];
    for (let i = 0; i < 4; i++) {
      for (const r of rigs) await r.session.tick();
      hub.pump();
    }
    expect(joiner.session.admitted()).toEqual([]);
  });

  it('propagates a live edit', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    a.session.localEdit(1, 1, 1, PLANKS);
    await settle(hub, [a, b], 3);
    expect(b.store.blockAt(1, 1, 1)).toBe(PLANKS);
  });

  it('closes the connection on a structurally invalid entry', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    // 0xffff is non-canonical (§6.1); inject a raw EDITS frame from B.
    const { encodeEdits } = await import('./messages');
    b.session.transportForTest.send(
      'A',
      encodeEdits({
        originSession: BigInt('B'.charCodeAt(0)),
        entries: [{ chunkKey: 100, index: 0, value: 0xffff, l: 5, c: 0, peer: 1n }],
      }),
      'action',
    );
    hub.pump();
    await a.session.tick();
    expect(a.session.admitted()).toEqual([]);
  });

  it('defers future stamps and applies them at maturity', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    const { encodeEdits } = await import('./messages');
    const futureL = a.now.t + 120_000; // 2 min ahead > 60 s window
    b.session.transportForTest.send(
      'A',
      encodeEdits({
        originSession: BigInt('B'.charCodeAt(0)),
        entries: [{ chunkKey: 4521984, index: 7, value: PLANKS, l: futureL, c: 0, peer: 2n }],
      }),
      'action',
    );
    hub.pump();
    await a.session.tick();
    expect(a.session.deferredCount).toBe(1);
    expect(a.store.edits.entryCount).toBe(0);
    a.now.t = futureL + 1;
    await a.session.tick();
    expect(a.session.deferredCount).toBe(0);
    expect(a.store.edits.entryCount).toBe(1);
  });

  it('evicts the largest-l deferred op at the 4096 cap (§11.3)', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    const { encodeEdits } = await import('./messages');
    const far = a.now.t + 10_000_000;
    const send = (entries: Parameters<typeof encodeEdits>[0]['entries']) => {
      b.session.transportForTest.send(
        'A',
        encodeEdits({ originSession: BigInt('B'.charCodeAt(0)), entries }),
        'action',
      );
    };
    // 4097 distinct future ops across several messages (bulk channel is not
    // rate-capped, but these are EDITS: stay under the 500 burst per flush).
    let sent = 0;
    while (sent < 4097) {
      const batch = [];
      for (let i = 0; i < 400 && sent < 4097; i++, sent++) {
        batch.push({ chunkKey: 4521984, index: sent % 32768, value: PLANKS, l: far + sent, c: 0, peer: 2n });
      }
      send(batch);
      hub.pump();
      await a.session.tick();
      a.now.t += 10_000; // refill the rate bucket between flushes
      b.now.t += 10_000;
    }
    expect(a.session.admitted()).toEqual(['B']); // caps not tripped
    expect(a.session.deferredCount).toBe(4096);
    // The evicted op is the LARGEST l (far + 4096); a new smaller one lands.
    send([{ chunkKey: 4521984, index: 5000, value: PLANKS, l: far - 1, c: 0, peer: 3n }]);
    hub.pump();
    await a.session.tick();
    expect(a.session.deferredCount).toBe(4096);
  });

  it('holds bulk frames while the transport reports backpressure (review #13)', async () => {
    const hub = new LoopbackHub();
    let bulkOpen = false;
    hub.canSend = (_from, _to, channel) => channel !== 'bulk' || bulkOpen;
    const a = makeSession(hub, 'A');
    for (let i = 0; i < 50; i++) a.session.localEdit(i % 10, 10 + Math.floor(i / 10), 5, PLANKS);
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 12);
    // digests flowed, but no CHUNK_ENTRIES could be sent yet
    expect(b.store.edits.entryCount).toBe(0);
    expect(a.session.admitted()).toEqual(['B']); // and nothing threw or closed
    bulkOpen = true;
    await settle(hub, [a, b], 12);
    expect(b.store.edits.entryCount).toBe(a.store.edits.entryCount);
  });

  it('time-slices the inbox without losing frames (§11.4, review #3)', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A', { inboxBudgetMs: 0 });
    const b = makeSession(hub, 'B', { inboxBudgetMs: 0 });
    await settle(hub, [a, b], 30);
    expect(b.session.admitted()).toEqual(['A']);
    for (let i = 0; i < 30; i++) a.session.localEdit(i, 12, 3, BRICK);
    hub.pump(); // 30 EDITS frames land in B's inbox at once
    await b.session.tick();
    // budget 0 → one frame this tick, the rest wait
    expect(b.store.edits.entryCount).toBeLessThan(30);
    await settle(hub, [a, b], 120);
    expect(b.store.edits.entryCount).toBe(a.store.edits.entryCount);
  });

  it('anti-entropy reconciles an empty joiner with an edited world', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    for (let i = 0; i < 100; i++) {
      a.session.localEdit(i % 20, 10 + Math.floor(i / 20), 5, i % 2 === 0 ? PLANKS : BRICK);
    }
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 40);
    expect(b.store.edits.entryCount).toBe(a.store.edits.entryCount);
    expect(await b.session.rootHex()).toBe(await a.session.rootHex());
  });

  it('forwards live edits around a blocked pair via the common neighbour', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    const c = makeSession(hub, 'C');
    hub.partition(new Set(['A']), new Set(['C']));
    await settle(hub, [a, b, c], 10);
    expect(a.session.admitted()).toEqual(['B']);
    expect(c.session.admitted()).toEqual(['B']);
    a.session.localEdit(2, 2, 2, BRICK);
    await settle(hub, [a, b, c], 6);
    expect(c.store.blockAt(2, 2, 2)).toBe(BRICK);
  });

  it('closes a connection that floods past the burst cap', async () => {
    const hub = new LoopbackHub();
    const a = makeSession(hub, 'A');
    const b = makeSession(hub, 'B');
    await settle(hub, [a, b], 4);
    const { encodeEdits } = await import('./messages');
    for (let batch = 0; batch < 6; batch++) {
      const entries = [];
      for (let i = 0; i < 100; i++) {
        const n = batch * 100 + i;
        entries.push({ chunkKey: 4521984, index: n % 32768, value: PLANKS, l: n + 1, c: 0, peer: 2n });
      }
      b.session.transportForTest.send(
        'A',
        encodeEdits({ originSession: BigInt('B'.charCodeAt(0)), entries }),
        'action',
      );
    }
    hub.pump();
    await a.session.tick();
    // 600 live entries in one instant: beyond the 500 burst (§11.3).
    expect(a.session.admitted()).toEqual([]);
  });
});
