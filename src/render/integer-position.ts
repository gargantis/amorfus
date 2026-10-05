// §8.3: the TS mirror of the shader's integer camera-relative position
// reconstruction. WGSL may reassociate float chains, so the shader works
// in i32 — p = (origin − cameraBlock)·256 + pos − 128 — and only then
// converts. Exact while |p| < 2²⁴ (±65,536 blocks). The §14 render test
// asserts this mirror is exact at ±1e6; the e2e canary covers the bundle.

export function reconstructRel(
  chunkOriginBlocks: readonly [number, number, number],
  posFixed: readonly [number, number, number], // A.1 vertex xyz, 1/256 block
  cameraBlock: readonly [number, number, number],
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const p =
      (Math.imul(chunkOriginBlocks[i]! - cameraBlock[i]!, 256) + posFixed[i]! - 128) | 0;
    out[i] = Math.fround(p) / 256;
  }
  return out;
}
