// Serves dist/ at "/" and at "/ipfs/<CID>/", gateway-style: no rewrites, no SPA fallback,
// directory without trailing slash -> 301 to slash, unknown path -> 404.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(process.argv[2] ?? 'dist'); const PORT = +(process.argv[3] ?? 4180);
const CID = process.argv[4] ?? 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.wasm':'application/wasm', '.json':'application/json', '.svg':'image/svg+xml',
  '.png':'image/png', '.map':'application/json', '.wgsl':'text/plain; charset=utf-8', '.bin':'application/octet-stream' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  const prefix = `/ipfs/${CID}`;
  if (p === prefix) { res.writeHead(301, { Location: prefix + '/' + u.search }); return res.end(); }
  if (p.startsWith(prefix + '/')) p = p.slice(prefix.length);
  else if (p.startsWith('/ipfs/')) { res.writeHead(404); return res.end('bad cid'); }
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { Location: u.pathname + '/' + u.search }); return res.end(); }
    f = path.join(f, 'index.html');
  }
  if (!fs.existsSync(f)) { console.log('404', req.url); res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...(process.env.CSP ? { 'Content-Security-Policy': process.env.CSP } : {}) });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('listening', PORT));
