import { chromium } from '../vt/node_modules/playwright-core/index.mjs';
import http from 'node:http';
const html = `<!doctype html><body style="margin:0"><div id=t style="width:400px;height:400px;background:#ccc">x</div><script>
window.res=[];
document.addEventListener('pointerlockchange',()=>res.push('change:'+!!document.pointerLockElement));
document.addEventListener('pointerlockerror',()=>res.push('error'));
t.addEventListener('click', async ()=>{ try { await t.requestPointerLock(); res.push('resolved:'+!!document.pointerLockElement);} catch(e){ res.push('reject:'+e.name+':'+e.message);} });
</script>`;
const srv = http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html'});r.end(html)}).listen(0);
await new Promise(r=>srv.on('listening',r));
const url = 'http://localhost:'+srv.address().port+'/';
for (const shell of [true,false]) {
  const b = await chromium.launch({ headless: true, executablePath: shell? process.env.HOME+'/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell' : process.env.HOME+'/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome', args: shell?[]:['--headless=new'] });
  const ctx = await b.newContext();
  try { await ctx.grantPermissions(['pointer-lock'], {origin:url}); console.log('grant ok'); } catch(e){ console.log('grantPermissions:', e.message.split('\n')[0]); }
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  try { await cdp.send('Browser.setPermission', {permission:{name:'pointer-lock'}, setting:'granted', origin: url}); console.log('cdp setPermission ok'); } catch(e){ console.log('cdp:', e.message.split('\n')[0]); }
  await p.goto(url);
  const q = await p.evaluate(async()=>{ try { return (await navigator.permissions.query({name:'pointer-lock'})).state } catch(e){ return 'query err '+e.message } });
  console.log('query:', q);
  await p.click('#t');
  await p.waitForTimeout(1500);
  console.log(shell?'headless-shell':'chromium new headless', await p.evaluate(()=>res), b.version());
  await b.close();
}
srv.close();
