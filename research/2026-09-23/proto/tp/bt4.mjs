import {chromium} from 'playwright-core'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const srv = http.createServer((q, s) => { const u = new URL(q.url, 'http://x'); const f = path.join('web2', u.pathname); s.writeHead(200, {'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html'}); s.end(fs.readFileSync(f)) }).listen(18092)
const browser = await chromium.launch({args: ['--disable-features=WebRtcHideLocalIpsWithMdns']})
const N = 4
for (const mode of ['curated','default']) for (let trial = 0; trial < 4; trial++) {
  const room = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const qs = `?room=${room}&app=${mode}${mode === 'default' ? '&default=1' : ''}`
  const ctxs = [], pages = []
  const t0 = Date.now()
  for (let i = 0; i < N; i++) { const c = await browser.newContext(); ctxs.push(c); const p = await c.newPage(); await p.goto('http://127.0.0.1:18092/mesh.html' + qs); pages.push(p); await p.waitForTimeout(700) }
  let full = false, t
  for (t = 0; t < 40 && !full; t++) { await pages[0].waitForTimeout(500); const counts = await Promise.all(pages.map(p => p.evaluate(() => window.__peers.size))); full = counts.every(c => c === N - 1) }
  const counts = await Promise.all(pages.map(p => p.evaluate(() => window.__peers.size))); const errs = await Promise.all(pages.map(p => p.evaluate(() => window.__errs)))
  console.log(mode, trial, full ? `FULL MESH in ${Date.now() - t0}ms (incl ${(N-1)*0.7}s staggered joins)` : 'PARTIAL after 20s', 'peerCounts=' + counts.join(','), 'errors=' + JSON.stringify(errs.flat()))
  for (const c of ctxs) await c.close()
}
await browser.close(); srv.close(); process.exit(0)
