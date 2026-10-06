// §11.3: the structural check — depends only on the op's bytes, shared by
// the wire path (Session) and the import path (§12.6 step 3).
import { isCanonical } from '../world/block';

const MAX_CHUNK_KEY = 2 ** 19 * 2 ** 19 * 24;

export function isValidEntryShape(
  chunkKey: number,
  index: number,
  value: number,
  l: number,
  peer: bigint,
): boolean {
  return (
    Number.isInteger(chunkKey) && chunkKey >= 0 && chunkKey < MAX_CHUNK_KEY &&
    Number.isInteger(index) && index >= 0 && index < 32768 &&
    isCanonical(value) &&
    l < 2 ** 47 &&
    peer !== 0n
  );
}
