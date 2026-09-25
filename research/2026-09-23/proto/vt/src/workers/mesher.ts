import { shared } from '../shared';
const wasmUrl = new URL('../assets/mod.wasm', import.meta.url);
self.onmessage = async (e: MessageEvent) => {
  const m = await import('./worker-lazy');
  (self as any).postMessage({ r: shared(e.data) + m.wl(), wasmUrl: wasmUrl.href });
};
