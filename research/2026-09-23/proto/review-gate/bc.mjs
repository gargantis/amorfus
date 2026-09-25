import { chromium } from '../vt/node_modules/playwright-core/index.mjs';
import http from 'node:http';
const html = `<!doctype html><script>window.got=[];const bc=new BroadcastChannel('t');bc.onmessage=e=>got.push(e.data);</script>`;
const srv = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html)}).listen(0);
await new Promise(r=>srv.on('listening',r));
const url='http://localhost:'+srv.address().port+'/';
const b = await chromium.launch({ executablePath: process.env.HOME+'/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' });
const c1=await b.newContext(), c2=await b.newContext();
const a=await c1.newPage(), s=await c1.newPage(), x=await c2.newPage();
for (const p of [a,s,x]) await p.goto(url);
await a.evaluate(()=>new BroadcastChannel('t').postMessage('hi'));
await a.waitForTimeout(500);
console.log('same-context page got:', await s.evaluate(()=>got), ' other-context page got:', await x.evaluate(()=>got));
// web lock: page a holds lock, page s (same ctx) tries ifAvailable, page x (other ctx) tries ifAvailable
await a.evaluate(()=>{navigator.locks.request('world-1',()=>new Promise(()=>{}));});
await a.waitForTimeout(200);
const tryLock = p=>p.evaluate(()=>navigator.locks.request('world-1',{ifAvailable:true},l=>!!l));
console.log('lock same ctx:', await tryLock(s), ' lock other ctx:', await tryLock(x));
await b.close(); srv.close();
