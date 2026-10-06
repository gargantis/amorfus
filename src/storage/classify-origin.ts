// §12.4: the ordered origin classifier — first match wins. It decides the
// storage banner, whether saves survive a release, and (with D-12's
// service-worker check, applied by the caller) whether secrets may persist.

export type OriginKind = 'no-storage' | 'shared-gateway' | 'release-pinned' | 'stable';

export interface OriginInput {
  origin: string; // location.origin ('null' when opaque)
  hostname: string;
  pathname: string;
  indexedDbOk: boolean;
}

export interface OriginClass {
  kind: OriginKind;
  row: 1 | 2 | 3 | 4 | 5 | 6;
  survivesRelease: boolean;
  /** D-12 first half; the caller must ALSO check that
   *  navigator.serviceWorker.controller is null. */
  secretsMayPersist: boolean;
}

const CIDV1_SUBDOMAIN = /^b[a-z2-7]{50,}\.ipfs\./;
const IPNS_SUBDOMAIN = /^[a-z0-9-]+\.ipns\./;
const STABLE_HOSTS = new Set(['amorf.us', 'localhost', '127.0.0.1', '[::1]']);

export function classifyOrigin(input: OriginInput): OriginClass {
  if (input.origin === 'null' || !input.indexedDbOk) {
    return { kind: 'no-storage', row: 1, survivesRelease: false, secretsMayPersist: false };
  }
  if (input.pathname.startsWith('/ipfs/') || input.pathname.startsWith('/ipns/')) {
    return { kind: 'shared-gateway', row: 2, survivesRelease: true, secretsMayPersist: false };
  }
  if (CIDV1_SUBDOMAIN.test(input.hostname)) {
    return { kind: 'release-pinned', row: 3, survivesRelease: false, secretsMayPersist: false };
  }
  if (IPNS_SUBDOMAIN.test(input.hostname)) {
    return { kind: 'stable', row: 4, survivesRelease: true, secretsMayPersist: false };
  }
  if (STABLE_HOSTS.has(input.hostname)) {
    return { kind: 'stable', row: 5, survivesRelease: true, secretsMayPersist: true };
  }
  return { kind: 'stable', row: 6, survivesRelease: true, secretsMayPersist: true };
}

/** The §12.4 banner line for each kind; null means no banner. */
export function bannerFor(c: OriginClass): string | null {
  switch (c.kind) {
    case 'no-storage':
      return 'This page cannot save worlds — play is session-only. Export to keep a copy.';
    case 'shared-gateway':
      return 'This address shares storage with every site on this gateway. Saves here are best-effort; prefer amorf.us.';
    case 'release-pinned':
      return 'Saves stay with this version of Amorfus. Moving to a newer version goes through the handoff or Export.';
    case 'stable':
      return null;
  }
}
