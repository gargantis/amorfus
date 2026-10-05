import { describe, it, expect } from 'vitest';
import thirdParty from '../../third-party.json';

// §10.1/§17: third-party.json is the single source for the runtime relay
// list, the STUN pair, the audit allowlist and the privacy sheet.
const KINDS = new Set(['signaling', 'stun', 'hosting', 'gateway', 'routing', 'link']);

describe('third-party.json', () => {
  it('names exactly the six curated relays', () => {
    const relays = thirdParty.filter((e) => e.kind === 'signaling');
    expect(relays.map((e) => e.url).sort()).toEqual(
      [
        'wss://nos.lol',
        'wss://nostr.bitcoiner.social',
        'wss://offchain.pub',
        'wss://relay.damus.io',
        'wss://relay.primal.net',
        'wss://yabu.me/v2',
      ].sort(),
    );
  });

  it('names exactly the two STUN operators (D-25)', () => {
    const stun = thirdParty.filter((e) => e.kind === 'stun');
    expect(stun.map((e) => e.url).sort()).toEqual([
      'stun:stun.cloudflare.com:3478',
      'stun:stun.l.google.com:19302',
    ]);
  });

  it('every entry carries host, kind, purpose, operator and sees', () => {
    for (const e of thirdParty) {
      expect(e.host).toMatch(/^[a-z0-9.-]+$/);
      expect(KINDS.has(e.kind)).toBe(true);
      expect(e.purpose.length).toBeGreaterThan(0);
      expect(e.operator.length).toBeGreaterThan(0);
      expect(e.sees.length).toBeGreaterThan(0);
    }
  });
});
