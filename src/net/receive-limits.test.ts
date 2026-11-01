import { describe, it, expect, vi } from 'vitest';
// Trystero 0.26's receive path, imported past the package exports so the
// gate fails if a version bump changes the limits the threat model relies
// on (§10.1, §11: a peer cannot exhaust another's memory).
// @ts-expect-error deep file import past the package exports, by design
import { createActionWireManager } from '../../node_modules/@trystero-p2p/core/dist/action-wire.mjs';
import { RECEIVE_BUDGET_BYTES } from './room-config';

const WIRE_VERSION = 2;
const OFFER = 1;
const CHUNK = 2;
const ACCEPTED = 3;
const REJECTED = 4;
const BINARY = 2 << 4;
const CHUNK_BYTES = 16384 - 14; // a full chunk's payload

interface Manager {
  makeInternalAction: (type: string) => {
    onMessage: (f: (data: unknown, peerId: string) => void) => void;
  };
  handleData: (peerId: string, data: ArrayBuffer) => void;
}

/** A receiver with amorfus's budget, recording the control frames it
 *  answers with and the peers it disconnects. */
function receiver(): { m: Manager; controls: Array<[string, number]>; dropped: string[] } {
  const controls: Array<[string, number]> = [];
  const dropped: string[] = [];
  const m = (createActionWireManager as (deps: unknown) => Manager)({
    getPeer: (peerId: string) => ({
      sendData: (bytes: Uint8Array) => controls.push([peerId, bytes[1]! & 15]),
    }),
    getPeerIds: () => [],
    canReceiveFromPeer: () => true,
    onPeerError: (peerId: string) => dropped.push(peerId),
    maxReceiveBytes: RECEIVE_BUDGET_BYTES,
  });
  return { m, controls, dropped };
}

/** The offer that opens transfer `id`: `size` binary bytes for `type`. */
function offer(type: string, id: number, size: number): ArrayBuffer {
  const bytes = new Uint8Array(48);
  bytes[0] = WIRE_VERSION;
  bytes[1] = OFFER | BINARY;
  bytes.set(new TextEncoder().encode(type), 2);
  const view = new DataView(bytes.buffer);
  view.setUint32(36, id);
  view.setFloat64(40, size);
  return bytes.buffer;
}

function chunk(id: number, offset: number, length: number): ArrayBuffer {
  const bytes = new Uint8Array(14 + length);
  bytes[0] = WIRE_VERSION;
  bytes[1] = CHUNK;
  const view = new DataView(bytes.buffer);
  view.setUint32(2, id);
  view.setFloat64(6, offset);
  return bytes.buffer;
}

function sendChunks(m: Manager, peerId: string, id: number, size: number): void {
  for (let offset = 0; offset < size; offset += CHUNK_BYTES) {
    m.handleData(peerId, chunk(id, offset, Math.min(CHUNK_BYTES, size - offset)));
  }
}

describe('Trystero receive limits (§10.1)', () => {
  it('refuses a payload over the budget before buffering any of it', () => {
    const { m, controls } = receiver();
    m.makeInternalAction('amf').onMessage(() => undefined);
    m.handleData('peer-1', offer('amf', 1, RECEIVE_BUDGET_BYTES + 1));
    expect(controls).toEqual([['peer-1', REJECTED]]);
  });

  it('never accepts a transfer for an unregistered action, and drops a peer that sends it anyway', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { m, controls, dropped } = receiver();
    m.handleData('peer-1', offer('ghost', 1, 1000));
    expect(controls).toEqual([]);
    m.handleData('peer-1', chunk(1, 0, 1000));
    expect(dropped).toEqual(['peer-1']);
    vi.restoreAllMocks();
  });

  it('keeps transfers in flight within the budget, across peers', () => {
    const { m, controls } = receiver();
    const delivered: string[] = [];
    m.makeInternalAction('amf').onMessage((_data, peerId) => delivered.push(peerId));
    const size = (RECEIVE_BUDGET_BYTES * 5) / 8; // two do not fit at once
    m.handleData('peer-1', offer('amf', 1, size));
    m.handleData('peer-2', offer('amf', 1, size));
    expect(controls).toEqual([['peer-1', ACCEPTED]]);
    sendChunks(m, 'peer-1', 1, size);
    expect(delivered).toEqual(['peer-1']);
    expect(controls).toEqual([
      ['peer-1', ACCEPTED],
      ['peer-2', ACCEPTED],
    ]);
  });
});
