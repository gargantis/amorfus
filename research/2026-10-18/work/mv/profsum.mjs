import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const f = readdirSync(dir).filter((x) => x.endsWith('.cpuprofile')).sort().pop();
const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
const self = new Map();
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const dt = p.timeDeltas; const samples = p.samples;
const cnt = new Map();
for (let i = 0; i < samples.length; i++) cnt.set(samples[i], (cnt.get(samples[i]) ?? 0) + (dt[i] ?? 0));
for (const [id, t] of cnt) {
  const n = byId.get(id);
  const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(k, (self.get(k) ?? 0) + t);
}
const tot = [...self.values()].reduce((a, b) => a + b, 0);
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log((t / 1000).toFixed(0).padStart(7), 'ms', (100 * t / tot).toFixed(1).padStart(5), '%', k);
