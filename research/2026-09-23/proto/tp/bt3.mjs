import {chromium} from 'playwright-core'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const srv = http.createServer((q, s) => { const u = new URL(q.url, 'http://x'); const f = path.join('web2', u.pathname === '/' ? 'index.html' : u.pathname); s.writeHead(200, {'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html'}); s.end(fs.readFileSync(f)) }).listen(18091)
const browser = await chromium.launch({args: ['--disable-features=WebRtcHideLocalIpsWithMdns']})
for (const mode of ['curated', 'default']) for (let trial = 0; trial < 8; trial++) {
  const room = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const qs = `?room=${room}&app=${mode}${mode === 'default' ? '&default=1' : ''}`
  const ctxs = []; const pages = []
  for (let i = 0; i < 2; i++) { const c = await browser.newContext(); ctxs.push(c); const p = await c.newPage(); await p.goto('http://127.0.0.1:18091/' + qs); pages.push(p); if (i === 0) await p.waitForTimeout(3000) }
  try { await Promise.all(pages.map(p => p.waitForFunction(() => window.__done, null, {timeout: 45000}))); console.log(mode, trial, JSON.stringify(await Promise.all(pages.map(p => p.evaluate(() => window.__log))))) }
  catch (e) { console.log(mode, trial, 'FAILED', JSON.stringify(await Promise.all(pages.map(p => p.evaluate(() => window.__log))))) }
  for (const c of ctxs) await c.close()
}
await browser.close(); srv.close(); process.exit(0)
