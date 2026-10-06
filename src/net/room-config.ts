// The exact config object handed to Trystero's joinRoom. Built here, as an
// object literal typed against the library's own JoinRoomConfig, so a
// misspelled or renamed key is a COMPILE error — a spread of an untyped
// object is not excess-property checked, which is how `relayUrls` slipped
// through and silently selected the library's default relays.
// (Type-only import: trystero-transport.ts stays the one runtime importer.)
import type { JoinRoomConfig } from '@trystero-p2p/nostr';

export interface RoomConfigInput {
  appId: string;
  relayUrls: readonly string[];
  iceServers: RTCIceServer[];
}

export function buildRoomConfig(input: RoomConfigInput): JoinRoomConfig {
  if (input.relayUrls.length === 0) {
    // An empty list would make the library fall back to its own defaults.
    throw new Error('no signaling relays configured');
  }
  const config: JoinRoomConfig = {
    appId: input.appId,
    relayConfig: { urls: [...input.relayUrls] },
    rtcConfig: { iceServers: input.iceServers },
  };
  return config;
}
