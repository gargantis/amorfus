import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ByteWriter, ByteReader, zigzag, unzigzag, CodecError } from './varint';

describe('varint primitives', () => {
  it('round-trips unsigned varints up to 2^47', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 47 }), (n) => {
        const w = new ByteWriter();
        w.varint(n);
        const r = new ByteReader(w.bytes());
        expect(r.varint()).toBe(n);
        expect(r.remaining).toBe(0);
      }),
    );
  });

  it('round-trips zigzag for signed values', () => {
    fc.assert(
      fc.property(fc.integer({ min: -(2 ** 31), max: 2 ** 31 }), (n) => {
        expect(unzigzag(zigzag(n))).toBe(n);
      }),
    );
  });

  it('round-trips u16le, u8 and u64le', () => {
    const w = new ByteWriter();
    w.u8(7);
    w.u16(0xbeef);
    w.u64(0x1122334455667788n);
    const r = new ByteReader(w.bytes());
    expect(r.u8()).toBe(7);
    expect(r.u16()).toBe(0xbeef);
    expect(r.u64()).toBe(0x1122334455667788n);
  });

  it('is a total reader: truncation throws CodecError', () => {
    const w = new ByteWriter();
    w.varint(300);
    w.u16(5);
    const full = w.bytes();
    for (let cut = 0; cut < full.length; cut++) {
      const r = new ByteReader(full.slice(0, cut));
      expect(() => {
        r.varint();
        r.u16();
      }).toThrow(CodecError);
    }
  });

  it('rejects overlong varints', () => {
    // 10 continuation bytes exceed the 47-bit budget.
    const r = new ByteReader(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01]));
    expect(() => r.varint()).toThrow(CodecError);
  });
});
