import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = new URL('./site/', import.meta.url).pathname;
const srv = http.createServer((q, r) => { let u = q.url.split('?')[0]; if (u.endsWith('/')) u += 'index.html'; const f = path.join(root, u); r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'text/html'); if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); } r.end(fs.readFileSync(f)); }).listen(8765);
const exe = process.env.EXE;
const configs = JSON.parse(process.env.CONFIGS);
for (const c of configs) {
  const b = await chromium.launch({ executablePath: exe, headless: c.headless ?? true, args: c.args, channel: c.channel });
  const p = await b.newPage();
  await p.goto(c.url || 'http://localhost:8765/');
  await p.waitForFunction(() => document.title === 'done', null, { timeout: 30000 }).catch(e => {});
  const out = await p.evaluate(() => window.__out);
  console.log(JSON.stringify({ name: c.name, out }, null, 0));
  await b.close();
}
srv.close();
