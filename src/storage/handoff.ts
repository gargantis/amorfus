// §12.5: the handoff SENDER (MVP; the receiver ships with the second
// release, D-18). A newer build opens this page as a POPUP (top-level —
// an iframe would see partitioned, empty storage) with
// #amorfus-handoff=<nonce>&to=<origin>; after explicit confirmation the
// sender posts every world's backup file to window.opener with that
// exact targetOrigin.

const CIDV1 = /^b[a-z2-7]{50,}$/;

export function parseHandoffHash(hash: string): { nonce: string; to: string } | null {
  const m = /^#amorfus-handoff=([A-Za-z0-9_-]+)&to=(.+)$/.exec(hash);
  if (m === null) return null;
  return { nonce: m[1]!, to: decodeURIComponent(m[2]!) };
}

/** The exact-match allowlist (§12.5) — never `*`. `currentHostname` is
 *  where THIS sender runs; "own gateway suffix" comes from it. */
export function handoffTargetAllowed(to: string, currentHostname: string): boolean {
  let url: URL;
  try {
    url = new URL(to);
  } catch {
    return false;
  }
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return false;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return false;

  const host = url.hostname;
  if (host === 'amorf.us') return true;

  // own gateway suffix: everything after `<label>.ipfs.` / `<label>.ipns.`
  // of the CURRENT host.
  const ownSuffix = /^[^.]+\.(?:ipfs|ipns)\.(.+)$/.exec(currentHostname)?.[1] ?? null;
  if (ownSuffix !== null) {
    if (host === `amorf-us.ipns.${ownSuffix}`) return true;
    const cidMatch = new RegExp(`^([^.]+)\\.ipfs\\.${escapeRe(ownSuffix)}$`).exec(host);
    if (cidMatch !== null && CIDV1.test(cidMatch[1]!)) return true;
  }
  // the local form, from anywhere
  const local = /^([^.]+)\.ipfs\.localhost$/.exec(host);
  if (local !== null && CIDV1.test(local[1]!)) return true;
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HandoffFile {
  name: string;
  bytes: Uint8Array;
}

/** Post the files to the opener with the EXACT target origin. */
export function postHandoff(
  opener: Window,
  targetOrigin: string,
  nonce: string,
  files: HandoffFile[],
): void {
  opener.postMessage(
    { type: 'amorfus-handoff', nonce, files },
    targetOrigin,
  );
}
