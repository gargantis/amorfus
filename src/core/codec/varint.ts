// §12.3/A.2: little-endian primitives and LEB128 varints behind a TOTAL
// reader — every malformed input throws CodecError, nothing else (§11.3).

export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

export class ByteWriter {
  private buf = new Uint8Array(256);
  private len = 0;

  private grow(need: number): void {
    if (this.len + need <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + need));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number): void {
    this.grow(1);
    this.buf[this.len++] = v & 0xff;
  }

  u16(v: number): void {
    this.grow(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
  }

  u32(v: number): void {
    this.grow(4);
    for (let i = 0; i < 4; i++) this.buf[this.len++] = (v >>> (8 * i)) & 0xff;
  }

  u64(v: bigint): void {
    this.grow(8);
    for (let i = 0n; i < 8n; i++) this.buf[this.len++] = Number((v >> (8n * i)) & 0xffn);
  }

  /** Unsigned LEB128; values up to 2^47 (HLC l is u48-bounded). */
  varint(v: number): void {
    if (!Number.isInteger(v) || v < 0 || v > 2 ** 47) {
      throw new CodecError(`varint out of range: ${v}`);
    }
    while (v >= 0x80) {
      this.u8((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.u8(v);
  }

  raw(bytes: Uint8Array): void {
    this.grow(bytes.length);
    this.buf.set(bytes, this.len);
    this.len += bytes.length;
  }

  bytes(): Uint8Array {
    return this.buf.slice(0, this.len);
  }

  get length(): number {
    return this.len;
  }
}

export class ByteReader {
  private buf: Uint8Array;
  private pos = 0;

  constructor(bytes: Uint8Array) {
    this.buf = bytes;
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new CodecError('truncated input');
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }

  u16(): number {
    this.need(2);
    return this.buf[this.pos++]! | (this.buf[this.pos++]! << 8);
  }

  u32(): number {
    this.need(4);
    let v = 0;
    for (let i = 0; i < 4; i++) v += this.buf[this.pos++]! * 2 ** (8 * i);
    return v;
  }

  u64(): bigint {
    this.need(8);
    let v = 0n;
    for (let i = 0n; i < 8n; i++) v |= BigInt(this.buf[this.pos++]!) << (8n * i);
    return v;
  }

  varint(): number {
    let v = 0;
    let shift = 1;
    for (let i = 0; i < 7; i++) {
      const b = this.u8();
      v += (b & 0x7f) * shift;
      if ((b & 0x80) === 0) {
        if (v > 2 ** 47) throw new CodecError('varint exceeds 47-bit budget');
        return v;
      }
      shift *= 128;
    }
    throw new CodecError('overlong varint');
  }

  rawBytes(n: number): Uint8Array {
    this.need(n);
    const out = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }
}

export const zigzag = (n: number): number => (n < 0 ? -2 * n - 1 : 2 * n);
export const unzigzag = (z: number): number => (z % 2 === 1 ? -(z + 1) / 2 : z / 2);
