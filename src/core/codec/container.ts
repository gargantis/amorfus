// A.4 `.amorfus` file: a 16-byte uncompressed preamble, then ONE gzip
// member holding tagged sections  tag[4] | u32le len | payload.
//   META  UTF-8 JSON ≤ 64 KiB     CHNK  sorted chunk keys + A.2 blobs
//   plyr  player state (backup)   END   (empty, must be last)
// An uppercase tag is critical — a reader that does not know it rejects
// the file. Lowercase tags are skipped. Share profile (1) carries no
// worldId, no player data, and stamps rebased to an order-preserving
// counter so the file reveals no play times (C-15, §12.6).
import { ByteWriter, ByteReader, CodecError } from './varint';
import { encodeChunkEntries, decodeChunkEntries } from './chunk-entries';
import type { IndexedEntry } from '../sync/lww';

const MAGIC = [0x41, 0x4d, 0x4f, 0x52, 0x46, 0x55, 0x53, 0x1a];
const MAJOR = 1;
const MINOR = 0;
const GZIP = 1;
const META_CAP = 64 * 1024;
const PLYR_CAP = 64 * 1024;
const DEFAULT_MAX_EXPANDED = 256 * 1024 * 1024;

export interface AmorfusMeta {
  worldId?: string; // 32 hex chars; backup profile only
  lineageId: string;
  name: string;
  seed: [number, number];
  generator: { id: string; version: number };
  chunkSize: 32;
  materials: string[];
  appVersion: string;
}

export interface AmorfusFile {
  profile: 0 | 1;
  meta: AmorfusMeta;
  chunks: Array<[number, IndexedEntry[]]>;
  player?: unknown;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function gzip(bytes: Uint8Array, mode: 'gzip' | 'gunzip', maxOut: number): Promise<Uint8Array> {
  const stream =
    mode === 'gzip' ? new CompressionStream('gzip') : new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const done = (async () => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = stream.readable.getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      total += value.length;
      if (total > maxOut) {
        await reader.cancel();
        throw new CodecError('decompressed size exceeds the cap (§12.6)');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  })();
  try {
    await writer.write(bytes as Uint8Array<ArrayBuffer>);
    await writer.close();
  } catch {
    // the reader side reports the real error
  }
  try {
    return await done;
  } catch (err) {
    if (err instanceof CodecError) throw err;
    throw new CodecError(`gzip ${mode} failed: ${String(err)}`);
  }
}

function section(w: ByteWriter, tag: string, payload: Uint8Array): void {
  if (tag.length !== 4) throw new CodecError('tag must be 4 bytes');
  w.raw(textEncoder.encode(tag));
  w.u32(payload.length);
  w.raw(payload);
}

/** §12.6 share rebase: stamps become an order-preserving counter. */
function rebaseForShare(chunks: Array<[number, IndexedEntry[]]>): Array<[number, IndexedEntry[]]> {
  const flat: Array<{ chunkKey: number; e: IndexedEntry }> = [];
  for (const [chunkKey, entries] of chunks) {
    for (const e of entries) flat.push({ chunkKey, e });
  }
  flat.sort(
    (a, b) =>
      a.e.l - b.e.l || a.e.c - b.e.c ||
      (a.e.peer < b.e.peer ? -1 : a.e.peer > b.e.peer ? 1 : 0) ||
      a.chunkKey - b.chunkKey || a.e.index - b.e.index,
  );
  const byChunk = new Map<number, IndexedEntry[]>();
  flat.forEach(({ chunkKey, e }, i) => {
    let list = byChunk.get(chunkKey);
    if (list === undefined) {
      list = [];
      byChunk.set(chunkKey, list);
    }
    list.push({ ...e, l: i, c: 0 });
  });
  return [...byChunk.entries()].sort((a, b) => a[0] - b[0]);
}

export async function encodeAmorfusFile(file: AmorfusFile): Promise<Uint8Array> {
  const body = new ByteWriter();

  const meta: AmorfusMeta = { ...file.meta };
  let chunks = file.chunks;
  if (file.profile === 1) {
    delete meta.worldId;
    chunks = rebaseForShare(chunks);
  }
  const metaJson = textEncoder.encode(JSON.stringify(meta));
  if (metaJson.length > META_CAP) throw new CodecError('META exceeds 64 KiB');
  section(body, 'META', metaJson);

  const chnk = new ByteWriter();
  const sorted = [...chunks].sort((a, b) => a[0] - b[0]);
  let prevKey = -1;
  for (const [key, entries] of sorted) {
    if (key <= prevKey) throw new CodecError('duplicate chunk key');
    prevKey = key;
    const blob = encodeChunkEntries(sortCanonical(entries));
    chnk.u64(BigInt(key));
    chnk.u32(blob.length);
    chnk.raw(blob);
  }
  section(body, 'CHNK', chnk.bytes());

  if (file.profile === 0 && file.player !== undefined) {
    const plyr = textEncoder.encode(JSON.stringify(file.player));
    if (plyr.length > PLYR_CAP) throw new CodecError('plyr exceeds 64 KiB');
    section(body, 'plyr', plyr);
  }
  section(body, 'END ', new Uint8Array(0));

  const compressed = await gzip(body.bytes(), 'gzip', Number.MAX_SAFE_INTEGER);
  const out = new ByteWriter();
  out.raw(new Uint8Array(MAGIC));
  out.u16(MAJOR);
  out.u16(MINOR);
  out.u8(GZIP);
  out.u8(file.profile);
  out.u16(0); // reserved
  out.raw(compressed);
  return out.bytes();
}

function sortCanonical(entries: IndexedEntry[]): IndexedEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.l - b.l || a.c - b.c ||
      (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0) || a.index - b.index,
  );
}

export interface DecodeOptions {
  maxExpandedBytes?: number;
}

export async function decodeAmorfusFile(
  bytes: Uint8Array,
  opts: DecodeOptions = {},
): Promise<AmorfusFile> {
  const r = new ByteReader(bytes);
  const magic = r.rawBytes(8);
  for (let i = 0; i < 8; i++) {
    if (magic[i] !== MAGIC[i]) throw new CodecError('not an .amorfus file');
  }
  const major = r.u16();
  r.u16(); // minor: ignored within a major
  if (major !== MAJOR) throw new CodecError(`unsupported major version ${major}`);
  const compression = r.u8();
  if (compression !== GZIP) throw new CodecError(`unknown compression ${compression}`);
  const profile = r.u8();
  if (profile !== 0 && profile !== 1) throw new CodecError(`unknown profile ${profile}`);
  r.u16(); // reserved

  const compressed = r.rawBytes(r.remaining);
  // §12.6: stream capped at 256 MiB and 64× the compressed size.
  const cap = Math.min(opts.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED, compressed.length * 64);
  const body = await gzip(compressed, 'gunzip', cap);

  const br = new ByteReader(body);
  let meta: AmorfusMeta | null = null;
  let chunks: Array<[number, IndexedEntry[]]> | null = null;
  let player: unknown;
  let ended = false;
  while (br.remaining > 0) {
    if (ended) throw new CodecError('data after END section');
    const tag = textDecoder.decode(br.rawBytes(4));
    const len = br.u32();
    const payload = br.rawBytes(len);
    switch (tag) {
      case 'META': {
        try {
          meta = JSON.parse(textDecoder.decode(payload)) as AmorfusMeta;
        } catch {
          throw new CodecError('META is not valid JSON');
        }
        if (typeof meta.name !== 'string' || !Array.isArray(meta.seed)) {
          throw new CodecError('META missing required fields');
        }
        break;
      }
      case 'CHNK': {
        chunks = [];
        const cr = new ByteReader(payload);
        let prevKey = -1n;
        while (cr.remaining > 0) {
          const key = cr.u64();
          if (key <= prevKey) throw new CodecError('CHNK keys not ascending');
          prevKey = key;
          if (key > BigInt(Number.MAX_SAFE_INTEGER)) throw new CodecError('chunk key out of range');
          const blobLen = cr.u32();
          chunks.push([Number(key), decodeChunkEntries(cr.rawBytes(blobLen))]);
        }
        break;
      }
      case 'plyr': {
        if (profile === 1) throw new CodecError('player data in a share file');
        try {
          player = JSON.parse(textDecoder.decode(payload));
        } catch {
          throw new CodecError('plyr is not valid JSON');
        }
        break;
      }
      case 'END ':
        if (len !== 0) throw new CodecError('END must be empty');
        ended = true;
        break;
      default: {
        const critical = /^[A-Z]/.test(tag);
        if (critical) throw new CodecError(`unknown critical section ${JSON.stringify(tag)}`);
        break; // lowercase: skipped
      }
    }
  }
  if (!ended) throw new CodecError('missing END section');
  if (meta === null || chunks === null) throw new CodecError('missing META or CHNK');
  if (profile === 1 && meta.worldId !== undefined) throw new CodecError('worldId in a share file');
  const out: AmorfusFile = { profile, meta, chunks };
  if (player !== undefined) out.player = player;
  return out;
}

/** Test-only helpers for section-level tampering. */
export const __forTest = {
  async withExtraSection(file: AmorfusFile, tag: string, payload: Uint8Array): Promise<Uint8Array> {
    const encoded = await encodeAmorfusFile(file);
    const preamble = encoded.slice(0, 16);
    const body = await gzip(encoded.slice(16), 'gunzip', DEFAULT_MAX_EXPANDED);
    // Insert before END (last 8 bytes: 'END ' + u32 0).
    const w = new ByteWriter();
    w.raw(body.slice(0, body.length - 8));
    section(w, tag, payload);
    w.raw(body.slice(body.length - 8));
    const rezipped = await gzip(w.bytes(), 'gzip', Number.MAX_SAFE_INTEGER);
    const out = new ByteWriter();
    out.raw(preamble);
    out.raw(rezipped);
    return out.bytes();
  },
};
