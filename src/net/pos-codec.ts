// §11.6 POS: 31 bytes, little-endian —
//   u16 seq | u32 send time ms | 3×i32 position (1/256 block)
//   | 3×i16 velocity (1/64 b/s) | u8 yaw | i8 pitch | u8 flags | u8 held
// 2+4+12+6+1+1+1+1 = 28 … plus 3 spare bytes reserved = 31 (A.3 fixes the
// size; spares absorb future fields without a protocol bump).

export const POS_BYTES = 31;

export interface PosUpdate {
  seq: number;
  timeMs: number;
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
  pitch: number;
  flags: number;
  held: number;
}

export function encodePos(p: PosUpdate): Uint8Array {
  const out = new Uint8Array(POS_BYTES);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, p.seq & 0xffff, true);
  dv.setUint32(2, p.timeMs >>> 0, true);
  for (let i = 0; i < 3; i++) {
    dv.setInt32(6 + i * 4, Math.round(p.position[i]! * 256), true);
    dv.setInt16(18 + i * 2, clamp16(Math.round(p.velocity[i]! * 64)), true);
  }
  dv.setUint8(24, Math.round(((p.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 255) & 0xff);
  dv.setInt8(25, Math.round((p.pitch / (Math.PI / 2)) * 127));
  dv.setUint8(26, p.flags & 0xff);
  dv.setUint8(27, p.held & 0xff);
  return out;
}

export function decodePos(bytes: Uint8Array): PosUpdate {
  if (bytes.byteLength !== POS_BYTES) throw new Error(`POS must be ${POS_BYTES} bytes`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    seq: dv.getUint16(0, true),
    timeMs: dv.getUint32(2, true),
    position: [
      dv.getInt32(6, true) / 256,
      dv.getInt32(10, true) / 256,
      dv.getInt32(14, true) / 256,
    ],
    velocity: [
      dv.getInt16(18, true) / 64,
      dv.getInt16(20, true) / 64,
      dv.getInt16(22, true) / 64,
    ],
    yaw: (dv.getUint8(24) / 255) * 2 * Math.PI,
    pitch: (dv.getInt8(25) / 127) * (Math.PI / 2),
    flags: dv.getUint8(26),
    held: dv.getUint8(27),
  };
}

function clamp16(v: number): number {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}
