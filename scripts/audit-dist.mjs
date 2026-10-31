#!/usr/bin/env node
// The §14 dist audit. The logic and its planted-failure self-test are
// shared, in vendor/hermet/audit-dist.mjs; amorfus's exceptions are here.
import { runAuditDist } from '../vendor/hermet/audit-dist.mjs';

await runAuditDist({
  // §13.3: gateway-owned names and host-specific routing never ship.
  forbiddenFiles: [/^ipfs-sw-/, /^_redirects$/],
  // §13.4: amorf.us's response headers ship, and are scanned as text.
  textFiles: ['_headers'],
  // §8.2: the boot message tells the user how to serve the folder locally.
  loopbackFiles: ['boot.js'],
  // Trystero's built-in STUN list is a template literal,
  // `stun:stun${i}.l.google.com:19302`, whose prefix the scan reads as a
  // host named "stun". amorfus always passes its own iceServers, so the
  // defaults are never used (src/net/room-config.test.ts). The TURN
  // field's hint, `turn:host:port,user,credential`, names no real host.
  ignoredHosts: ['stun', 'host'],
  // Compared with a URL's pathname, never requested: the gateway prefixes
  // of §12.4's origin classifier and the handoff target's root (§12.5).
  ignoredPaths: ['/', '/ipfs/', '/ipns/'],
});
