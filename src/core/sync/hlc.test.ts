import { describe, it, expect } from 'vitest';
import { Hlc } from './hlc';

// §11.2: hybrid logical clock (Kulkarni et al. 2014). l is u48 wall ms,
// c a u16 counter. Opening a world seeds l ≥ the largest stored l.
describe('Hlc', () => {
  it('ticks forward with wall time', () => {
    const h = new Hlc();
    const a = h.send(1000);
    const b = h.send(2000);
    expect(a).toEqual({ l: 1000, c: 0 });
    expect(b).toEqual({ l: 2000, c: 0 });
  });

  it('increments the counter when wall time stalls or goes back', () => {
    const h = new Hlc();
    expect(h.send(1000)).toEqual({ l: 1000, c: 0 });
    expect(h.send(1000)).toEqual({ l: 1000, c: 1 });
    expect(h.send(999)).toEqual({ l: 1000, c: 2 });
  });

  it('is monotonic across arbitrary send/receive sequences', () => {
    const h = new Hlc();
    let prev = h.send(500);
    const events: Array<['send', number] | ['recv', number, number, number]> = [
      ['recv', 800, 0, 600],
      ['send', 400],
      ['recv', 800, 5, 700],
      ['recv', 200, 9, 900],
      ['send', 901],
      ['send', 100],
    ];
    for (const ev of events) {
      const stamp = ev[0] === 'send' ? h.send(ev[1]) : h.recv({ l: ev[1], c: ev[2] }, ev[3]);
      const after =
        stamp.l > prev.l || (stamp.l === prev.l && stamp.c > prev.c);
      expect(after).toBe(true);
      prev = stamp;
    }
  });

  it('adopts the remote l when it is largest, with c beyond the remote c', () => {
    const h = new Hlc();
    h.send(100);
    const s = h.recv({ l: 5000, c: 7 }, 200);
    expect(s.l).toBe(5000);
    expect(s.c).toBe(8);
  });

  it('seeds from stored state when opening a world', () => {
    const h = new Hlc({ l: 9999, c: 3 });
    const s = h.send(500);
    expect(s.l).toBe(9999);
    expect(s.c).toBe(4);
  });
});
