import { describe, it, expect } from 'vitest';
import { handoffTargetAllowed, parseHandoffHash } from './handoff';

// §12.5: the sender posts worlds to window.opener ONLY when the `to`
// origin matches the allowlist exactly — never `*`. https, or http on a
// loopback host.

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const CID2 = 'bafybeiftpcorw6jk4rnxdnod7n7c4kmamz2oc47gdsaeje2qfrvxvu3xcm';

describe('handoffTargetAllowed', () => {
  it('allows amorf.us over https only', () => {
    expect(handoffTargetAllowed('https://amorf.us', 'anything.example')).toBe(true);
    expect(handoffTargetAllowed('http://amorf.us', 'anything.example')).toBe(false);
  });

  it('allows the own-gateway ipns and cid origins', () => {
    const current = `${CID}.ipfs.inbrowser.link`;
    expect(handoffTargetAllowed('https://amorf-us.ipns.inbrowser.link', current)).toBe(true);
    expect(handoffTargetAllowed(`https://${CID2}.ipfs.inbrowser.link`, current)).toBe(true);
    // a DIFFERENT gateway suffix is not "own"
    expect(handoffTargetAllowed(`https://${CID2}.ipfs.dweb.link`, current)).toBe(false);
  });

  it('allows the local <cid>.ipfs.localhost:<port> form over http', () => {
    expect(handoffTargetAllowed(`http://${CID2}.ipfs.localhost:8080`, `${CID}.ipfs.localhost`)).toBe(true);
  });

  it('refuses everything else', () => {
    expect(handoffTargetAllowed('https://evil.example.com', 'amorf.us')).toBe(false);
    expect(handoffTargetAllowed('http://169.254.0.1', 'amorf.us')).toBe(false);
    expect(handoffTargetAllowed('*', 'amorf.us')).toBe(false);
    expect(handoffTargetAllowed('not a url', 'amorf.us')).toBe(false);
    expect(handoffTargetAllowed(`https://${CID2}.ipfs.inbrowser.link.evil.com`, `${CID}.ipfs.inbrowser.link`)).toBe(false);
  });
});

describe('parseHandoffHash', () => {
  it('extracts nonce and target', () => {
    const p = parseHandoffHash(`#amorfus-handoff=abc123&to=${encodeURIComponent('https://amorf.us')}`);
    expect(p).toEqual({ nonce: 'abc123', to: 'https://amorf.us' });
  });

  it('returns null without the marker', () => {
    expect(parseHandoffHash('#join=xyz')).toBeNull();
  });
});
