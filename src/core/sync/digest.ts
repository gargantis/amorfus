// §11.4: SHA-256 digests. chunkDigest hashes the canonical A.2 blob;
// root hashes the sorted (chunkKey ‖ chunkDigest) list and is sent
// truncated to 16 bytes. XOR-of-hashes was rejected: linear digests let a
// malicious member construct silently diverging states.
// Uses WebCrypto (globalThis.crypto.subtle): present in Node ≥ 20, workers
// and every secure browsing context the app can run in.

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return new Uint8Array(buf);
}

/** 32-byte digest of one chunk's canonical chunk-entries blob. */
export function chunkDigest(blob: Uint8Array): Promise<Uint8Array> {
  return sha256(blob);
}

/** 16-byte root over all chunk digests, order-independent. */
export async function rootDigest(
  chunks: Iterable<readonly [number, Uint8Array]>,
): Promise<Uint8Array> {
  const list = [...chunks].sort((a, b) => a[0] - b[0]);
  const buf = new Uint8Array(list.length * 40);
  const view = new DataView(buf.buffer);
  list.forEach(([key, digest], i) => {
    if (digest.length !== 32) throw new Error('chunk digest must be 32 bytes');
    view.setFloat64(i * 40, key, true); // chunk keys are exact f64 integers
    buf.set(digest, i * 40 + 8);
  });
  return (await sha256(buf)).slice(0, 16);
}
