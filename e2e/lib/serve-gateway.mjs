// §14: the strict gateway-shaped static server behind every e2e mount.
// Deliberately strict: no SPA fallback, exact files only, kubo's
// trailing-slash redirect, Host-header subdomain routing. Three listeners:
//   plainPort   /            and /ipfs/<cid>/…  and <cid>.ipfs.localhost
//   cspPort     the same tree under Content-Security-Policy: default-src 'self'
//   headersPort the same tree with dist/_headers applied (the amorf.us shape)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    if (/^\s/.test(raw)) {
      if (current) {
        const i = raw.indexOf(':');
        if (i > 0) current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
      }
    } else {
      current = { pattern: raw.trim(), headers: [] };
      rules.push(current);
    }
  }
  return rules;
}

const globToRe = (pattern) =>
  new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);

export async function startGateway({ distDir, cid, ports = {} }) {
  let headerRules = [];
  try {
    headerRules = parseHeadersFile(await readFile(join(distDir, '_headers'), 'utf8')).map((r) => ({
      re: globToRe(r.pattern),
      headers: r.headers,
    }));
  } catch {
    // no _headers in dist
  }

  async function serveFile(res, rel, extraHeaders) {
    const clean = normalize(rel).replace(/^([.][.][/\\])+/, '');
    if (clean.includes('..') || clean === '_headers' || clean.endsWith('/_headers')) {
      res.writeHead(404).end('not found');
      return;
    }
    let buf;
    try {
      buf = await readFile(join(distDir, clean));
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    const ext = clean.slice(clean.lastIndexOf('.'));
    const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream' };
    for (const [k, v] of extraHeaders(`/${clean}`)) headers[k.toLowerCase()] = v;
    res.writeHead(200, headers).end(buf);
  }

  function route(extraHeaders) {
    return (req, res) => {
      void (async () => {
        const host = (req.headers.host ?? '').split(':')[0];
        const url = new URL(req.url, 'http://x');
        let path = decodeURIComponent(url.pathname);

        if (host === `${cid}.ipfs.localhost`) {
          // Subdomain mount: the whole origin is this CID's root.
          await serveFile(res, path === '/' ? 'index.html' : path.slice(1), extraHeaders);
          return;
        }
        if (path.startsWith('/ipfs/')) {
          const rest = path.slice('/ipfs/'.length);
          const slash = rest.indexOf('/');
          const reqCid = slash === -1 ? rest : rest.slice(0, slash);
          if (reqCid !== cid) {
            res.writeHead(404).end('unknown cid');
            return;
          }
          if (slash === -1) {
            // kubo redirects the slashless directory form.
            res.writeHead(301, { location: `/ipfs/${cid}/` }).end();
            return;
          }
          const sub = rest.slice(slash + 1);
          await serveFile(res, sub === '' ? 'index.html' : sub, extraHeaders);
          return;
        }
        await serveFile(res, path === '/' ? 'index.html' : path.slice(1), extraHeaders);
      })();
    };
  }

  const none = () => [];
  const csp = () => [['Content-Security-Policy', "default-src 'self'"]];
  const fromHeadersFile = (path) => {
    const out = [];
    for (const rule of headerRules) if (rule.re.test(path)) out.push(...rule.headers);
    return out;
  };

  const listen = (handler, port = 0) =>
    new Promise((resolve) => {
      const server = createServer(handler);
      server.listen(port, '127.0.0.1', () => resolve(server));
    });

  const plain = await listen(route(none), ports.plain ?? 0);
  const cspServer = await listen(route(csp), ports.csp ?? 0);
  const headersServer = await listen(route(fromHeadersFile), ports.headers ?? 0);

  return {
    plainPort: plain.address().port,
    cspPort: cspServer.address().port,
    headersPort: headersServer.address().port,
    close: async () => {
      await Promise.all(
        [plain, cspServer, headersServer].map(
          (s) => new Promise((r) => s.close(r)),
        ),
      );
    },
  };
}
