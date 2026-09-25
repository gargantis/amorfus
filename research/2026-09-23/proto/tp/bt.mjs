import {chromium} from 'playwright-core'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
import {createWsRelayServer} from '@trystero-p2p/ws-relay/server'
createWsRelayServer({port: 18081})
const srv = http.createServer((q, s) => { const f = path.join('web', q.url === '/' ? 'index.html' : q.url); s.writeHead(200, {'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html'}); s.end(fs.readFileSync(f)) }).listen(18090)
const browser = await chromium.launch({args: ['--disable-features=WebRtcHideLocalIpsWithMdns']})
const pages = await Promise.all([1,2].map(async () => { const c = await browser.newContext(); const p = await c.newPage(); await p.goto('http://127.0.0.1:18090/'); return p }))
await Promise.all(pages.map(p => p.waitForFunction(() => window.__done, null, {timeout: 20000})))
for (const [i,p] of pages.entries()) console.log('page', i, JSON.stringify(await p.evaluate(() => window.__log), null, 0))
console.log('chromium', browser.version())
await browser.close(); srv.close(); process.exit(0)
