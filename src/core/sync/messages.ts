// A.3 session messages: [u8 type][payload], little-endian, every message
// ≤ 16 KiB. Decoders are TOTAL (§11.3): malformed bytes throw CodecError
// and nothing else. EDITS carries a per-message peer table like A.2.
import { ByteWriter, ByteReader, CodecError } from '../codec/varint';
import type { HlcStamp } from './hlc';

export const MAX_MESSAGE_BYTES = 16 * 1024;

export const MSG = {
  HELLO: 1,
  REFUSE: 2,
  EDITS: 3,
  ROOT: 4,
  CHUNK_DIGESTS: 5,
  WANT: 6,
  PEERS: 7,
  REKEY: 8,
  CHUNK_ENTRIES: 9, // bulk channel
  POS: 10, // pos channel (M7)
} as const;

export const REFUSE_REASONS = [
  'protocol-mismatch',
  'generator-mismatch',
  'different-world',
  'clock-skew',
  'room-full',
] as const;
export type RefuseReason = (typeof REFUSE_REASONS)[number];

export interface HelloWorld {
  worldId: Uint8Array; // 16 bytes
  seed: [number, number];
  generatorVersion: number;
  genCanary: number;
}

export interface Hello {
  protocolVersion: number;
  sessionId: bigint;
  wallClock: number;
  hlc: HlcStamp;
  name: string;
  color: number;
  world: HelloWorld | null;
}

export interface WireEntry {
  chunkKey: number;
  index: number;
  value: number;
  l: number;
  c: number;
  peer: bigint;
}

export interface Edits {
  originSession: bigint;
  entries: WireEntry[];
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function finish(w: ByteWriter): Uint8Array {
  if (w.length > MAX_MESSAGE_BYTES) {
    throw new CodecError(`message exceeds 16 KiB (${w.length})`);
  }
  return w.bytes();
}

function reader(bytes: Uint8Array, expected: number): ByteReader {
  const r = new ByteReader(bytes);
  if (r.u8() !== expected) throw new CodecError('wrong message type');
  return r;
}

export function decodeMessageType(bytes: Uint8Array): number {
  return new ByteReader(bytes).u8();
}

// ---- HELLO ----

export function encodeHello(h: Hello): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.HELLO);
  w.u16(h.protocolVersion);
  w.u64(h.sessionId);
  w.varint(h.wallClock);
  w.varint(h.hlc.l);
  w.varint(h.hlc.c);
  const name = textEncoder.encode(h.name).slice(0, 32); // ≤ 32 bytes (§11.1)
  w.u8(name.length);
  w.raw(name);
  w.u8(h.color);
  w.u8(h.world === null ? 0 : 1);
  if (h.world !== null) {
    if (h.world.worldId.length !== 16) throw new CodecError('worldId must be 16 bytes');
    w.raw(h.world.worldId);
    w.u32(h.world.seed[0]);
    w.u32(h.world.seed[1]);
    w.u16(h.world.generatorVersion);
    w.u32(h.world.genCanary);
  }
  return finish(w);
}

export function decodeHello(bytes: Uint8Array): Hello {
  const r = reader(bytes, MSG.HELLO);
  const protocolVersion = r.u16();
  const sessionId = r.u64();
  const wallClock = r.varint();
  const hlc = { l: r.varint(), c: r.varint() };
  if (hlc.c > 0xffff) throw new CodecError('hlc c exceeds u16');
  const nameLen = r.u8();
  if (nameLen > 32) throw new CodecError('name too long');
  const name = textDecoder.decode(r.rawBytes(nameLen));
  const color = r.u8();
  const hasWorld = r.u8();
  if (hasWorld !== 0 && hasWorld !== 1) throw new CodecError('bad world flag');
  let world: HelloWorld | null = null;
  if (hasWorld === 1) {
    world = {
      worldId: r.rawBytes(16),
      seed: [r.u32(), r.u32()],
      generatorVersion: r.u16(),
      genCanary: r.u32(),
    };
  }
  if (r.remaining !== 0) throw new CodecError('trailing bytes in HELLO');
  return { protocolVersion, sessionId, wallClock, hlc, name, color, world };
}

// ---- REFUSE ----

export function encodeRefuse(reason: RefuseReason): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.REFUSE);
  w.u8(REFUSE_REASONS.indexOf(reason));
  return finish(w);
}

export function decodeRefuse(bytes: Uint8Array): RefuseReason {
  const r = reader(bytes, MSG.REFUSE);
  const code = r.u8();
  const reason = REFUSE_REASONS[code];
  if (reason === undefined) throw new CodecError('unknown refuse reason');
  if (r.remaining !== 0) throw new CodecError('trailing bytes in REFUSE');
  return reason;
}

// ---- EDITS ----

export function encodeEdits(e: Edits): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.EDITS);
  w.u64(e.originSession);
  const peerSet = new Set<bigint>();
  for (const entry of e.entries) peerSet.add(entry.peer);
  const peers = [...peerSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const idx = new Map(peers.map((p, i) => [p, i] as const));
  w.varint(peers.length);
  for (const p of peers) w.u64(p);
  w.varint(e.entries.length);
  for (const entry of e.entries) {
    w.varint(entry.chunkKey);
    w.varint(entry.index);
    w.u16(entry.value);
    w.varint(entry.l);
    w.varint(entry.c);
    w.varint(idx.get(entry.peer)!);
  }
  return finish(w);
}

export function decodeEdits(bytes: Uint8Array): Edits {
  const r = reader(bytes, MSG.EDITS);
  const originSession = r.u64();
  const npeer = r.varint();
  if (npeer > 4096) throw new CodecError('peer table too large');
  const peers: bigint[] = [];
  for (let i = 0; i < npeer; i++) peers.push(r.u64());
  const n = r.varint();
  if (n > 4096) throw new CodecError('too many entries in EDITS');
  const entries: WireEntry[] = [];
  for (let i = 0; i < n; i++) {
    const chunkKey = r.varint();
    const index = r.varint();
    if (index >= 32768) throw new CodecError('index out of chunk');
    const value = r.u16();
    const l = r.varint();
    const c = r.varint();
    if (c > 0xffff) throw new CodecError('c exceeds u16');
    const pi = r.varint();
    const peer = peers[pi];
    if (peer === undefined) throw new CodecError('peer index out of table');
    entries.push({ chunkKey, index, value, l, c, peer });
  }
  if (r.remaining !== 0) throw new CodecError('trailing bytes in EDITS');
  return { originSession, entries };
}

// ---- ROOT / WANT / CHUNK_DIGESTS ----

export function encodeRoot(root: Uint8Array): Uint8Array {
  if (root.length !== 16) throw new CodecError('root must be 16 bytes');
  const w = new ByteWriter();
  w.u8(MSG.ROOT);
  w.raw(root);
  return finish(w);
}

export function decodeRoot(bytes: Uint8Array): Uint8Array {
  const r = reader(bytes, MSG.ROOT);
  const root = r.rawBytes(16);
  if (r.remaining !== 0) throw new CodecError('trailing bytes in ROOT');
  return root;
}

export function encodeWant(chunkKeys: readonly number[]): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.WANT);
  w.varint(chunkKeys.length);
  for (const k of chunkKeys) w.varint(k);
  return finish(w);
}

export function decodeWant(bytes: Uint8Array): number[] {
  const r = reader(bytes, MSG.WANT);
  const n = r.varint();
  if (n > 4096) throw new CodecError('WANT too large');
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r.varint());
  if (r.remaining !== 0) throw new CodecError('trailing bytes in WANT');
  return out;
}

export function encodeChunkDigests(
  digests: ReadonlyArray<readonly [number, Uint8Array]>,
): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.CHUNK_DIGESTS);
  w.varint(digests.length);
  for (const [key, digest] of digests) {
    if (digest.length !== 32) throw new CodecError('chunk digest must be 32 bytes');
    w.varint(key);
    w.raw(digest);
  }
  return finish(w);
}

export function decodeChunkDigests(bytes: Uint8Array): Array<[number, Uint8Array]> {
  const r = reader(bytes, MSG.CHUNK_DIGESTS);
  const n = r.varint();
  if (n > 4096) throw new CodecError('CHUNK_DIGESTS too large');
  const out: Array<[number, Uint8Array]> = [];
  for (let i = 0; i < n; i++) out.push([r.varint(), r.rawBytes(32)]);
  if (r.remaining !== 0) throw new CodecError('trailing bytes in CHUNK_DIGESTS');
  return out;
}

// ---- PEERS ----

export interface Peers {
  neighbours: bigint[];
  members: bigint[];
}

export function encodePeers(p: Peers): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.PEERS);
  w.varint(p.neighbours.length);
  for (const s of p.neighbours) w.u64(s);
  w.varint(p.members.length);
  for (const s of p.members) w.u64(s);
  return finish(w);
}

export function decodePeers(bytes: Uint8Array): Peers {
  const r = reader(bytes, MSG.PEERS);
  const nn = r.varint();
  if (nn > 64) throw new CodecError('too many neighbours');
  const neighbours: bigint[] = [];
  for (let i = 0; i < nn; i++) neighbours.push(r.u64());
  const nm = r.varint();
  if (nm > 64) throw new CodecError('too many members');
  const members: bigint[] = [];
  for (let i = 0; i < nm; i++) members.push(r.u64());
  if (r.remaining !== 0) throw new CodecError('trailing bytes in PEERS');
  return { neighbours, members };
}

// ---- CHUNK_ENTRIES (bulk channel) ----

export function encodeChunkEntriesMsg(chunkKey: number, part: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  w.u8(MSG.CHUNK_ENTRIES);
  // A.3: payload = chunk key (u64le) ‖ one A.2 part.
  w.u64(BigInt(chunkKey));
  w.raw(part);
  return finish(w);
}

export function decodeChunkEntriesMsg(bytes: Uint8Array): { chunkKey: number; part: Uint8Array } {
  const r = reader(bytes, MSG.CHUNK_ENTRIES);
  const keyBig = r.u64();
  if (keyBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new CodecError('chunk key out of range');
  const chunkKey = Number(keyBig);
  const part = r.rawBytes(r.remaining);
  return { chunkKey, part };
}
