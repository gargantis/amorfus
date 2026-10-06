import { describe, it, expect } from 'vitest';
import { buildRoomConfig } from './room-config';
import thirdParty from '../../third-party.json';

// Found by the WebSocket-aware e2e guard in the final review: Trystero
// 0.25 reads `relayConfig.urls`; an unknown `relayUrls` key is silently
// ignored and the library falls back to its OWN default public relays —
// not the six the plan curates and the privacy sheet discloses.
describe('buildRoomConfig', () => {
  const curated = (thirdParty as Array<{ kind: string; url: string }>)
    .filter((e) => e.kind === 'signaling')
    .map((e) => e.url);

  it('puts the relay list where Trystero 0.25 reads it', () => {
    const c = buildRoomConfig({ appId: 'x', relayUrls: ['ws://127.0.0.1:1'], iceServers: [] });
    expect(c.relayConfig?.urls).toEqual(['ws://127.0.0.1:1']);
    expect(Object.keys(c)).not.toContain('relayUrls');
  });

  it('never leaves the relay list unset (which would mean library defaults)', () => {
    const c = buildRoomConfig({ appId: 'x', relayUrls: curated, iceServers: [] });
    expect(c.relayConfig?.urls).toEqual(curated);
    expect(c.relayConfig?.urls?.length).toBe(6);
    expect(() => buildRoomConfig({ appId: 'x', relayUrls: [], iceServers: [] })).toThrow();
  });

  it('carries exactly the ICE servers it was given', () => {
    const ice = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
    expect(buildRoomConfig({ appId: 'x', relayUrls: curated, iceServers: ice }).rtcConfig).toEqual({
      iceServers: ice,
    });
  });
});
