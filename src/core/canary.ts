// C-10: the generator canary, computed by the RUNNING engine. At startup
// the app generates one golden chunk, hashes it exactly as the goldens
// were built, and compares with the frozen value. On a mismatch the app
// warns and disables Host, Join and share export; the same computed value
// travels in the handshake so mismatched engines refuse each other.
// (Lives outside src/core/gen: the generator itself may not touch crypto.)
import { generateChunk } from './gen/v1/index';
import goldens from './gen/v1/goldens.json';

type Golden = { seed: [number, number]; chunk: [number, number, number]; hash: string };

export async function chunkGoldenHash(
  seed: readonly [number, number],
  chunk: readonly [number, number, number],
): Promise<string> {
  const c = generateChunk(seed, chunk[0], chunk[1], chunk[2]);
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  if (c.storage.kind === 'uniform') parts.push(enc.encode(`uniform:${c.storage.value}`));
  else {
    const b = c.storage.blocks;
    parts.push(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
  }
  parts.push(
    c.hints === 'saturated'
      ? enc.encode('saturated')
      : new Uint8Array(c.hints.buffer, c.hints.byteOffset, c.hints.byteLength),
  );
  const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    total.set(p, off);
    off += p.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', total));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export interface CanaryResult {
  ok: boolean;
  /** first 32 bits of the hash THIS engine computed */
  canary: number;
}

export async function computeGenCanary(expectedHash?: string): Promise<CanaryResult> {
  const g = (goldens as Golden[])[0]!;
  const computed = await chunkGoldenHash(g.seed, g.chunk);
  return {
    ok: computed === (expectedHash ?? g.hash),
    canary: parseInt(computed.slice(0, 8), 16) >>> 0,
  };
}
