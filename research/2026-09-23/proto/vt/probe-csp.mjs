import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) errs.push(m.text().slice(0, 160)); });
await p.goto('http://127.0.0.1:4181/');
await p.waitForFunction(() => window.__workerResult, null, { timeout: 5000 }).catch(() => errs.push('worker TIMEOUT'));
const r = await p.evaluate(async () => {
  const out = { worker: !!window.__workerResult, lazy: !!window.__lazy };
  try { await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])); out.wasm = 'ok'; } catch (e) { out.wasm = 'BLOCKED ' + e.name; }
  out.ws = await new Promise(res => { try { const s = new WebSocket('wss://echo.websocket.org'); s.onopen = () => res('open'); s.onerror = () => res('error'); setTimeout(() => res('timeout'), 4000); } catch (e) { res('THROW ' + e.name); } });
  try { const r = await fetch('https://delegated-ipfs.dev/routing/v1/providers/bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq'); out.fetchXorigin = r.status; } catch (e) { out.fetchXorigin = 'BLOCKED ' + e.name; }
  try { const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); pc.createDataChannel('x'); await pc.setLocalDescription(await pc.createOffer()); await new Promise(r => setTimeout(r, 2500)); out.rtc = 'created, sdp candidates: ' + (pc.localDescription.sdp.match(/a=candidate/g) || []).length; } catch (e) { out.rtc = 'ERR ' + e.message; }
  return out;
});
console.log(JSON.stringify(r)); console.log(errs.slice(0, 6));
await b.close();
