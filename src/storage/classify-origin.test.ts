import { describe, it, expect } from 'vitest';
import { classifyOrigin } from './classify-origin';

// §12.4: the ORDERED origin classifier — first match wins. Every row is
// unit-tested, including localhost:PORT/ipfs/<cid>/ → shared-gateway.

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';

describe('classifyOrigin', () => {
  it('row 1: opaque origin or broken indexedDB → no-storage', () => {
    expect(classifyOrigin({ origin: 'null', hostname: '', pathname: '/', indexedDbOk: true }).kind)
      .toBe('no-storage');
    expect(
      classifyOrigin({ origin: 'https://amorf.us', hostname: 'amorf.us', pathname: '/', indexedDbOk: false }).kind,
    ).toBe('no-storage');
  });

  it('row 2: /ipfs/ or /ipns/ paths → shared-gateway, even on localhost', () => {
    const r = classifyOrigin({
      origin: 'http://localhost:8080',
      hostname: 'localhost',
      pathname: `/ipfs/${CID}/`,
      indexedDbOk: true,
    });
    expect(r.kind).toBe('shared-gateway');
    expect(r.survivesRelease).toBe(true);
    expect(
      classifyOrigin({ origin: 'https://ipfs.4everland.io', hostname: 'ipfs.4everland.io', pathname: '/ipns/x/', indexedDbOk: true }).kind,
    ).toBe('shared-gateway');
  });

  it('row 3: <cidv1>.ipfs.* subdomains → release-pinned (saves stay with this version)', () => {
    const r = classifyOrigin({
      origin: `https://${CID}.ipfs.dweb.link`,
      hostname: `${CID}.ipfs.dweb.link`,
      pathname: '/',
      indexedDbOk: true,
    });
    expect(r.kind).toBe('release-pinned');
    expect(r.survivesRelease).toBe(false);
  });

  it('row 4: <name>.ipns.* subdomains → stable', () => {
    const r = classifyOrigin({
      origin: 'https://amorf-us.ipns.inbrowser.link',
      hostname: 'amorf-us.ipns.inbrowser.link',
      pathname: '/',
      indexedDbOk: true,
    });
    expect(r.kind).toBe('stable');
    expect(r.survivesRelease).toBe(true);
  });

  it('row 5: amorf.us and loopback hosts → stable', () => {
    for (const hostname of ['amorf.us', 'localhost', '127.0.0.1', '[::1]']) {
      const r = classifyOrigin({ origin: `https://${hostname}`, hostname, pathname: '/', indexedDbOk: true });
      expect(r.kind).toBe('stable');
    }
  });

  it('row 6: anything else → stable (self-hosted)', () => {
    const r = classifyOrigin({
      origin: 'https://example.com',
      hostname: 'example.com',
      pathname: '/game/',
      indexedDbOk: true,
    });
    expect(r.kind).toBe('stable');
  });

  it('order matters: a cid subdomain with an /ipfs/ path is row 2', () => {
    const r = classifyOrigin({
      origin: `https://${CID}.ipfs.localhost:8080`,
      hostname: `${CID}.ipfs.localhost`,
      pathname: `/ipfs/${CID}/`,
      indexedDbOk: true,
    });
    expect(r.kind).toBe('shared-gateway');
  });

  it('secrets persist only on rows 5 and 6 (D-12 precondition)', () => {
    expect(classifyOrigin({ origin: 'https://amorf.us', hostname: 'amorf.us', pathname: '/', indexedDbOk: true }).secretsMayPersist).toBe(true);
    expect(classifyOrigin({ origin: 'https://x.com', hostname: 'x.com', pathname: '/', indexedDbOk: true }).secretsMayPersist).toBe(true);
    expect(classifyOrigin({ origin: `https://${CID}.ipfs.d.link`, hostname: `${CID}.ipfs.d.link`, pathname: '/', indexedDbOk: true }).secretsMayPersist).toBe(false);
    expect(classifyOrigin({ origin: 'https://g', hostname: 'g', pathname: '/ipfs/x/', indexedDbOk: true }).secretsMayPersist).toBe(false);
  });
});
