#!/usr/bin/env node
// §10.1/C-2: round-trip every curated relay. Deploy and publish are blocked
// when fewer than 4 of 6 answer. Outside `npm run check`, so the gate stays
// offline and deterministic.
import { readFile } from 'node:fs/promises';

const thirdParty = JSON.parse(await readFile(new URL('../third-party.json', import.meta.url), 'utf8'));
const relays = thirdParty.filter((e) => e.kind === 'signaling').map((e) => e.url);

function probe(url, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok, why) => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch { /* closed */ }
        resolve({ url, ok, why });
      }
    };
    const timer = setTimeout(() => done(false, 'timeout'), timeoutMs);
    timer.unref?.();
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      done(false, String(e?.message ?? e));
      return;
    }
    ws.onopen = () => ws.send(JSON.stringify(['REQ', 'amorfus-probe', { kinds: [1], limit: 1 }]));
    ws.onmessage = (ev) => {
      try {
        const [type] = JSON.parse(String(ev.data));
        if (type === 'EVENT' || type === 'EOSE') done(true, type);
      } catch { /* non-JSON frame, keep waiting */ }
    };
    ws.onerror = () => done(false, 'error');
    ws.onclose = () => done(false, 'closed');
  });
}

const results = await Promise.all(relays.map((u) => probe(u)));
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.url} (${r.why})`);
const up = results.filter((r) => r.ok).length;
console.log(`probe:relays — ${up}/${relays.length} reachable`);
if (up < 4) {
  console.error('probe:relays: below the 4-of-6 threshold; deploy and publish are blocked (C-2)');
  process.exit(1);
}
