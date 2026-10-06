import { describe, it, expect } from 'vitest';
// The PATCHED module (patches/@trystero-p2p+core+0.25.4.patch): deep
// import of the file the patch edits, so the gate fails if the patch is
// missing or the behaviour regresses.
// @ts-expect-error deep file import past the package exports, by design
import { createActionWireManager } from '../../node_modules/@trystero-p2p/core/dist/action-wire.mjs';

// §10.1: stock trystero reassembles action payloads with no size limit
// and keeps payloads of unregistered types forever. The patch bounds
// per-peer buffering at ~64 KiB and drops unregistered types.

const PAYLOAD_INDEX = 36;

interface Manager {
  makeInternalAction: (type: string) => {
    send: unknown;
    onMessage: (f: (payload: unknown, peerId: string) => void) => void;
  };
  handleData: (id: string, data: ArrayBuffer) => void;
  clearPeer: (id: string) => void;
}

function makeManager(): Manager {
  return (createActionWireManager as (deps: unknown) => Manager)({
    getPeer: () => ({ sendData: () => void 0 }),
    getPeerIds: () => [],
    canReceiveFromPeer: () => true,
    throwIfAborted: () => void 0,
  });
}

/** Build one wire chunk frame for `type` (binary tag, not final). */
function frame(type: string, nonce: number, payloadBytes: number, isLast: boolean): ArrayBuffer {
  const buf = new Uint8Array(PAYLOAD_INDEX + payloadBytes);
  buf.set(new TextEncoder().encode(type), 0);
  buf[32] = (nonce >> 8) & 0xff;
  buf[33] = nonce & 0xff;
  buf[34] = (isLast ? 1 : 0) | 4; // tag: binary (+ last when set)
  buf[35] = 128; // progress
  return buf.buffer;
}

function pendingOf(id: string): number {
  const dbg = (globalThis as { __amfPendingBytes?: Record<string, number> }).__amfPendingBytes;
  return dbg?.[id] ?? 0;
}

describe('patched trystero reassembly (§10.1)', () => {
  it('caps per-peer buffering at ~64 KiB even when no final chunk comes', () => {
    const m = makeManager();
    m.makeInternalAction('amf');
    for (let i = 0; i < 40; i++) {
      m.handleData('peer-1', frame('amf', 1, 16 * 1024 - PAYLOAD_INDEX, false));
      expect(pendingOf('peer-1')).toBeLessThanOrEqual(64 * 1024);
    }
    m.clearPeer('peer-1');
  });

  it('releases the accounting once a transmission completes', () => {
    const m = makeManager();
    const action = m.makeInternalAction('amf');
    let delivered = 0;
    action.onMessage(() => {
      delivered += 1;
    });
    m.handleData('peer-2', frame('amf', 2, 1000, false));
    expect(pendingOf('peer-2')).toBeGreaterThan(0);
    m.handleData('peer-2', frame('amf', 2, 1000, true));
    expect(delivered).toBe(1);
    expect(pendingOf('peer-2')).toBe(0);
  });

  it('drops payloads of unregistered action types instead of keeping them', () => {
    const m = makeManager();
    m.handleData('peer-3', frame('ghost', 3, 2000, false));
    m.handleData('peer-3', frame('ghost', 3, 2000, true));
    expect(pendingOf('peer-3')).toBe(0);
    // Registering later must NOT deliver the dropped payload.
    let delivered = 0;
    const late = m.makeInternalAction('ghost');
    late.onMessage(() => {
      delivered += 1;
    });
    expect(delivered).toBe(0);
  });
});
