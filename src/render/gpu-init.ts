// §8.2: WebGPU initialisation with a typed result. boot.js has already
// verified that navigator.gpu exists. Adapters are single-use, so the
// device-rejected retry requests a FRESH adapter.

export type GpuInitOk = {
  kind: 'ok';
  adapter: GPUAdapter;
  device: GPUDevice;
  isFallback: boolean;
};
export type GpuInitFailure =
  | { kind: 'no-adapter' }
  | { kind: 'device-rejected'; reason: string };

export async function gpuInit(): Promise<GpuInitOk | GpuInitFailure> {
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) return { kind: 'no-adapter' };
  try {
    const device = await adapter.requestDevice();
    return { kind: 'ok', adapter, device, isFallback: isFallback(adapter) };
  } catch {
    const fresh = await navigator.gpu.requestAdapter();
    if (fresh === null) return { kind: 'no-adapter' };
    try {
      const device = await fresh.requestDevice();
      return { kind: 'ok', adapter: fresh, device, isFallback: isFallback(fresh) };
    } catch (e2) {
      return { kind: 'device-rejected', reason: String(e2 instanceof Error ? e2.message : e2) };
    }
  }
}

function isFallback(adapter: GPUAdapter): boolean {
  // isFallbackAdapter moved from GPUAdapter to GPUAdapterInfo across spec
  // revisions; read both without depending on either.
  const a = adapter as unknown as { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } };
  return a.isFallbackAdapter ?? a.info?.isFallbackAdapter ?? false;
}
