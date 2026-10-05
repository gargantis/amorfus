// M0 placeholder for the §9.1 GEN_MESH worker. What it must prove now: a
// module worker, with a nested dynamic import, loads through every mount —
// the exact thing worker.format 'iife' silently broke (§13.2).

interface WorkerCtx {
  postMessage(message: unknown): void;
  onmessage: ((ev: MessageEvent) => void) | null;
}
const ctx = self as unknown as WorkerCtx;

ctx.onmessage = (ev: MessageEvent) => {
  void (async () => {
    const data = ev.data as { type?: string };
    if (data.type === 'ping') {
      const probe = await import('./nested-probe');
      ctx.postMessage({ type: 'pong', nested: probe.PROBE });
    }
  })();
};
