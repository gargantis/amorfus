import { describe, it, expect } from 'vitest';
import { encodePos, decodePos, POS_BYTES } from './pos-codec';

// §11.6: POS is 31 B — seq, send time, i32 position in 1/256 block,
// velocity, yaw, pitch, flags, held material.
describe('pos codec', () => {
  it('is exactly 31 bytes', () => {
    expect(POS_BYTES).toBe(31);
    const bytes = encodePos({
      seq: 1, timeMs: 123456, position: [1.5, 2.25, -3],
      velocity: [0.5, -1, 0], yaw: 1.2, pitch: -0.5, flags: 1, held: 5,
    });
    expect(bytes.byteLength).toBe(31);
  });

  it('round-trips within quantisation error', () => {
    const p = {
      seq: 4099, timeMs: 7777777, position: [12345.37109375, -22.5, 0.00390625] as [number, number, number],
      velocity: [3.25, -49.9, 21.1] as [number, number, number],
      yaw: -2.9, pitch: 1.1, flags: 3, held: 6,
    };
    const d = decodePos(encodePos(p));
    expect(d.seq).toBe(4099);
    expect(d.timeMs).toBe(7777777 % 2 ** 32);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(d.position[i]! - p.position[i]!)).toBeLessThanOrEqual(1 / 256);
      expect(Math.abs(d.velocity[i]! - p.velocity[i]!)).toBeLessThanOrEqual(0.25);
    }
    const yawDiff = Math.abs((((d.yaw - p.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    expect(yawDiff).toBeLessThan(0.03);
    expect(Math.abs(d.pitch - p.pitch)).toBeLessThan(0.03);
    expect(d.flags).toBe(3);
    expect(d.held).toBe(6);
  });

  it('rejects wrong-length buffers', () => {
    expect(() => decodePos(new Uint8Array(30))).toThrow();
  });
});
