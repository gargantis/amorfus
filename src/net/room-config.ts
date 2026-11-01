// The exact config object handed to Trystero's joinRoom, built by the
// shared vendor/hermet/room-config.ts from the hosts third-party.json
// declares, as an object literal typed against the library's own
// JoinRoomConfig: a misspelled or renamed key is a COMPILE error — a
// spread of an untyped object is not excess-property checked, which is how
// `relayUrls` slipped through and silently selected the library's default
// relays. (Type-only import: trystero-transport.ts stays the one runtime
// importer.)
import type { JoinRoomConfig } from '@trystero-p2p/nostr';
import thirdParty from '../../third-party.json';
import { declaredUrls, roomConfig } from '../../vendor/hermet/room-config';
import { MAX_MESSAGE_BYTES } from '../core/sync/messages';

export const CURATED_RELAYS: string[] = declaredUrls(thirdParty, 'signaling');
export const STUN_SERVERS: RTCIceServer[] = [{ urls: declaredUrls(thirdParty, 'stun') }];

/** §10.1: the room's receive budget, four messages in flight. Trystero
 *  refuses a larger payload before buffering any of it. */
export const RECEIVE_BUDGET_BYTES = 4 * MAX_MESSAGE_BYTES;

export interface RoomConfigInput {
  appId: string;
  relayUrls: readonly string[];
  iceServers: RTCIceServer[];
}

export function buildRoomConfig(input: RoomConfigInput): JoinRoomConfig {
  return roomConfig({
    appId: input.appId,
    relays: input.relayUrls,
    iceServers: input.iceServers,
    maxReceiveBytes: RECEIVE_BUDGET_BYTES,
  });
}
