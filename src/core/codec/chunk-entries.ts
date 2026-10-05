// A.2 chunk-entries codec v1 — the ONE codec for disk, file and wire:
//   u8 codec=1
//   varint npeer | npeer × u64le peer     (strictly ascending, referenced only)
//   varint n    | varint base_l
//   n × { Δl varint | c varint | peerIdx varint | zigzag Δindex | u16le value }
// Entries are sorted (l, c, peer, index), so Δl is never negative, and the
// encoding is canonical: one byte sequence per state.
import { ByteWriter, ByteReader, CodecError, zigzag, unzigzag } from './varint';
import type { IndexedEntry } from '../sync/lww';

const CODEC_V1 = 1;
const CHUNK_VOLUME = 32 * 32 * 32;

/** Entries MUST already be in canonical (l, c, peer, index) order — the
 *  order LwwStore.snapshot() produces. */
export function encodeChunkEntries(entries: readonly IndexedEntry[]): Uint8Array {
  const w = new ByteWriter();
  w.u8(CODEC_V1);

  const peerSet = new Set<bigint>();
  for (const e of entries) peerSet.add(e.peer);
  const peers = [...peerSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const peerIdx = new Map<bigint, number>();
  peers.forEach((p, i) => peerIdx.set(p, i));

  w.varint(peers.length);
  for (const p of peers) w.u64(p);

  w.varint(entries.length);
  const baseL = entries.length > 0 ? entries[0]!.l : 0;
  w.varint(baseL);

  let prevL = baseL;
  let prevIndex = 0;
  for (const e of entries) {
    const dl = e.l - prevL;
    if (dl < 0) throw new CodecError('entries not in canonical order (Δl < 0)');
    w.varint(dl);
    w.varint(e.c);
    w.varint(peerIdx.get(e.peer)!);
    w.varint(zigzag(e.index - prevIndex));
    w.u16(e.value);
    prevL = e.l;
    prevIndex = e.index;
  }
  return w.bytes();
}

export function decodeChunkEntries(blob: Uint8Array): IndexedEntry[] {
  const r = new ByteReader(blob);
  if (r.u8() !== CODEC_V1) throw new CodecError('unknown chunk-entries codec');

  const npeer = r.varint();
  if (npeer > CHUNK_VOLUME) throw new CodecError('peer table too large');
  const peers: bigint[] = [];
  let prevPeer = -1n;
  for (let i = 0; i < npeer; i++) {
    const p = r.u64();
    if (p <= prevPeer) throw new CodecError('peer table not strictly ascending');
    peers.push(p);
    prevPeer = p;
  }

  const n = r.varint();
  if (n > CHUNK_VOLUME) throw new CodecError('too many entries for one chunk');
  const baseL = r.varint();

  const out: IndexedEntry[] = [];
  let l = baseL;
  let prevIndex = 0;
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    l += r.varint();
    if (l > 2 ** 47) throw new CodecError('l exceeds u47');
    const c = r.varint();
    if (c > 0xffff) throw new CodecError('c exceeds u16');
    const pi = r.varint();
    const peer = peers[pi];
    if (peer === undefined) throw new CodecError('peer index out of table');
    const index = prevIndex + unzigzag(r.varint());
    if (index < 0 || index >= CHUNK_VOLUME) throw new CodecError('index out of chunk');
    if (seen.has(index)) throw new CodecError('duplicate index');
    seen.add(index);
    const value = r.u16();
    out.push({ index, value, l, c, peer });
    prevIndex = index;
  }
  if (r.remaining !== 0) throw new CodecError('trailing bytes after entries');
  return out;
}

/** Greedy split into parts, each itself a valid v1 blob over a contiguous
 *  run of the canonical order, each at most maxBytes long (§ A.2 wire). */
export function splitChunkEntries(
  entries: readonly IndexedEntry[],
  maxBytes: number,
): Uint8Array[] {
  if (entries.length === 0) return [encodeChunkEntries([])];
  const parts: Uint8Array[] = [];
  let start = 0;
  while (start < entries.length) {
    // Grow the run until the encoded part would exceed maxBytes.
    let end = start + 1;
    let blob = encodeChunkEntries(entries.slice(start, end));
    while (end < entries.length) {
      const next = encodeChunkEntries(entries.slice(start, end + 1));
      if (next.length > maxBytes) break;
      blob = next;
      end += 1;
    }
    parts.push(blob);
    start = end;
  }
  return parts;
}
