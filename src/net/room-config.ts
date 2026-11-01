// The exact config object handed to Trystero's joinRoom. Built here, as an
// object literal typed against the library's own JoinRoomConfig, so a
// misspelled or renamed key is a COMPILE error — a spread of an untyped
// object is not excess-property checked, which is how `relayUrls` slipped
// through and silently selected the library's default relays.
// (Type-only import: trystero-transport.ts stays the one runtime importer.)
import type { JoinRoomConfig } from '@trystero-p2p/nostr';
import { MAX_MESSAGE_BYTES } from '../core/sync/messages';

/** §10.1: the room's receive budget, four messages in flight. Trystero
 *  refuses a larger payload before buffering any of it. */
export const RECEIVE_BUDGET_BYTES = 4 * MAX_MESSAGE_BYTES;

export interface RoomConfigInput {
  appId: string;
  relayUrls: readonly string[];
  iceServers: RTCIceServer[];
}

export function buildRoomConfig(input: RoomConfigInput): JoinRoomConfig {
  if (input.relayUrls.length === 0) {
    // An empty list would leave the room no relay to meet on.
    throw new Error('no signaling relays configured');
  }
  const config: JoinRoomConfig = {
    appId: input.appId,
    relayConfig: { urls: [...input.relayUrls] },
    rtcConfig: { iceServers: input.iceServers },
    maxReceiveBytes: RECEIVE_BUDGET_BYTES,
  };
  return config;
}
