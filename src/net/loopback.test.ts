import { describe, it, expect } from 'vitest';
import { LoopbackHub } from './loopback';

// §5/§14: the LoopbackTransport drives the real session protocol in Node.
// The hub queues every frame; the simulator pumps delivery and injects
// drops, duplicates, reordering and partitions deterministically.
describe('LoopbackHub', () => {
  it('connects peers and delivers queued frames on pump', () => {
    const hub = new LoopbackHub();
    const a = hub.join('A');
    const b = hub.join('B');
    const got: Array<[string, string, string]> = [];
    b.onMessage((from, bytes, channel) => got.push([from, new TextDecoder().decode(bytes), channel]));
    expect(a.peers()).toEqual(['B']);
    expect(b.peers()).toEqual(['A']);
    a.send('B', new TextEncoder().encode('hi'), 'action');
    expect(got).toEqual([]); // nothing until pumped
    hub.pump();
    expect(got).toEqual([['A', 'hi', 'action']]);
  });

  it('notifies join and leave', () => {
    const hub = new LoopbackHub();
    const a = hub.join('A');
    const joins: string[] = [];
    const leaves: string[] = [];
    a.onPeerJoin((p) => joins.push(p));
    a.onPeerLeave((p) => leaves.push(p));
    const b = hub.join('B');
    expect(joins).toEqual(['B']);
    b.leave();
    expect(leaves).toEqual(['B']);
    expect(a.peers()).toEqual([]);
  });

  it('applies fault injection: drop, duplicate, delay', () => {
    const hub = new LoopbackHub();
    const a = hub.join('A');
    const b = hub.join('B');
    const got: string[] = [];
    b.onMessage((_f, bytes) => got.push(new TextDecoder().decode(bytes)));
    let n = 0;
    hub.faults = () => {
      n += 1;
      if (n === 1) return 'drop';
      if (n === 2) return 'duplicate';
      if (n === 3) return 'delay';
      return 'deliver';
    };
    a.send('B', new TextEncoder().encode('1'), 'action'); // dropped
    a.send('B', new TextEncoder().encode('2'), 'action'); // duplicated
    a.send('B', new TextEncoder().encode('3'), 'action'); // delayed one pump
    hub.pump();
    expect(got).toEqual(['2', '2']);
    hub.pump();
    expect(got).toEqual(['2', '2', '3']);
  });

  it('partitions cut delivery both ways until healed', () => {
    const hub = new LoopbackHub();
    const a = hub.join('A');
    const b = hub.join('B');
    const gotB: string[] = [];
    b.onMessage((_f, bytes) => gotB.push(new TextDecoder().decode(bytes)));
    hub.partition(new Set(['A']), new Set(['B']));
    a.send('B', new TextEncoder().encode('x'), 'action');
    hub.pump();
    expect(gotB).toEqual([]);
    hub.heal();
    a.send('B', new TextEncoder().encode('y'), 'action');
    hub.pump();
    expect(gotB).toEqual(['y']);
  });
});
