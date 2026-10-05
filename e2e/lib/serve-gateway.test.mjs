import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startGateway, parseHeadersFile } from './serve-gateway.mjs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// §14 E2E mounts: a strict gateway-shaped server — no SPA fallback, kubo's
// trailing-slash redirect, subdomain Host routing, a CSP mount, and an
// amorf.us mount that applies dist/_headers.

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
let dir;
let gw;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'amorfus-gw-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>t</title>ok');
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'assets', 'a.js'), 'export {}');
  await writeFile(
    join(dir, '_headers'),
    '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/*\n  X-Content-Type-Options: nosniff\n',
  );
  gw = await startGateway({ distDir: dir, cid: CID });
});
afterAll(async () => {
  await gw.close();
  await rm(dir, { recursive: true, force: true });
});

const get = (port, path, host) =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    headers: host ? { Host: host } : {},
    redirect: 'manual',
  });

describe('serve-gateway', () => {
  it('serves the plain mount with correct MIME', async () => {
    const r = await get(gw.plainPort, '/index.html');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/^text\/html/);
    const js = await get(gw.plainPort, '/assets/a.js');
    expect(js.headers.get('content-type')).toMatch(/^text\/javascript/);
  });

  it('404s instead of SPA-falling back', async () => {
    const r = await get(gw.plainPort, '/nope.html');
    expect(r.status).toBe(404);
  });

  it('serves the /ipfs/<cid>/ path mount and redirects the slashless form', async () => {
    const r = await get(gw.plainPort, `/ipfs/${CID}/index.html`);
    expect(r.status).toBe(200);
    const redir = await get(gw.plainPort, `/ipfs/${CID}`);
    expect(redir.status).toBe(301);
    expect(redir.headers.get('location')).toBe(`/ipfs/${CID}/`);
  });

  it('rejects an unknown CID on the path mount', async () => {
    const r = await get(gw.plainPort, '/ipfs/bafybeifake/index.html');
    expect(r.status).toBe(404);
  });

  it('routes the subdomain mount by Host header', async () => {
    const r = await get(gw.plainPort, '/index.html', `${CID}.ipfs.localhost`);
    expect(r.status).toBe(200);
    const bad = await get(gw.plainPort, '/ipfs/x/index.html', `${CID}.ipfs.localhost`);
    expect(bad.status).toBe(404);
  });

  it('adds a restrictive CSP on the CSP mount', async () => {
    const r = await get(gw.cspPort, '/index.html');
    expect(r.headers.get('content-security-policy')).toBe("default-src 'self'");
  });

  it('applies _headers rules on the headers mount', async () => {
    const asset = await get(gw.headersPort, '/assets/a.js');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('x-content-type-options')).toBe('nosniff');
    const html = await get(gw.headersPort, '/index.html');
    expect(html.headers.get('cache-control')).toBeNull();
    expect(html.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('never serves _headers itself from the headers mount', async () => {
    const r = await get(gw.headersPort, '/_headers');
    expect(r.status).toBe(404);
  });
});

describe('parseHeadersFile', () => {
  it('parses blocks into pattern + header pairs', () => {
    const rules = parseHeadersFile('/a/*\n  X-One: 1\n\n/*\n  X-Two: 2\n');
    expect(rules).toEqual([
      { pattern: '/a/*', headers: [['X-One', '1']] },
      { pattern: '/*', headers: [['X-Two', '2']] },
    ]);
  });
});
