# p2p: P2P stack and signaling (WebRTC, third-party dependencies, NAT traversal)

## Recommendation

## Evidence base
**Read or run in this session:** Trystero 0.25.4 (README plus the shipped `dist` source for `core`, `nostr`, `torrent` and `mqtt`). PeerJS 1.5.5 `dist`. Kubo `docs/config.md`. The Cloudflare Realtime TURN docs. The Metered Open Relay page. NIP-01. RFC 9110. Chromium's `rtc_peer_connection.cc`. The Trystero GitHub issues. The Shipyard and IPFS blog posts. Private owner material (not described here).

**Measurements, all on 2026-09-23 from a single vantage point (the owner's WSL box):**
- Bundle sizes (esbuild 0.28.2, minified, gzip -9).
- An ephemeral-event round-trip probe on 41 Nostr relays.
- A WebSocket probe of the default trackers and MQTT brokers.
- STUN binding tests and TURN Allocate tests.
- Playwright on Chromium 149: 2-context and 4-context rooms over public Nostr, plus local-signaling runs with an extra negotiated channel.

Anything else is marked as inference below.

## Verdict on the stack
**Primary: Trystero (`@trystero-p2p/nostr`, pinned exactly at 0.25.4) using the Nostr strategy.**
- Pass an explicit, curated relay list. Do not use the library's default list.
- Pass explicit STUN servers.
- Bundle no TURN server.
- Configure it only through an adapter behind our own `Transport` interface.

**Fallback: the Trystero BitTorrent-tracker strategy (`@trystero-p2p/torrent`).**
- It adds about 1.3 KB gz because `core` is shared: nostr alone is 22.6 KB gz, nostr + torrent is 23.9 KB gz.
- The user selects it in Settings, and the join link carries the choice (`&sig=t`).
- Never run both strategies at the same time. Each strategy creates its own room and its own RTCPeerConnections, and Trystero does not dedupe peers across them (issue #100 is still open).

**Post-MVP: a no-third-party mode.** Players exchange compressed SDP manually or by QR code, in a star around the host.

## Libraries and versions
- `@trystero-p2p/nostr@0.25.4`. MIT. Pulls in `@trystero-p2p/core` and `@noble/secp256k1`.
- Upgrade to 0.25.5 when it ships. `main` has fixed #195 (a room can never be rejoined after a failed send), but that fix is not released yet.
- The API has changed within the pre-1.0 line: packages were renamed at 0.23, and a new action API arrived at 0.25. Keep Trystero behind `src/net/trystero-transport.ts` so that nothing else imports it.

## Signaling config
Keep this in one place, `src/net/config.ts`. It is the single source of truth: the runtime reads it, the privacy panel renders it, and a test asserts against it.
```ts
export const APP_ID = 'amorfus' // stable; app protocol version is checked in the handshake instead
export const NOSTR_RELAYS = [ // all 6 used simultaneously (relayConfig.urls disables the appId-shuffle)
  'wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol',
  'wss://offchain.pub', 'wss://nostr.bitcoiner.social', 'wss://yabu.me/v2',
]
export const STUN = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
]
// joinRoom({appId: APP_ID, relayConfig: {urls: [...NOSTR_RELAYS, ...userRelays, ...linkRelays]},
//           rtcConfig: {iceServers: [...STUN, ...userTurn]}}, roomSecret,
//          {onPeerHandshake, onJoinError, handshakeTimeoutMs: 10_000})
```
**Why pin the relays:**
- Trystero picks 5 of its 28 default relays with a shuffle seeded by `appId`.
- For `appId: 'amorfus'` that gives chorus.pjv.me (down), purplerelay.com (rejects writes: "No space left on device"), relay.sigit.io, top.testrelay.top and nostr-01.yakihonne.com. Only 3 of the 5 work today.
- Across the whole default list, only 17 of 28 relays passed a Trystero-format ephemeral event round-trip.
- The default list also changes between library versions, and a build pinned to IPFS can never be changed.

**Why these six relays:** all six passed the round-trip probe and both Chromium trials. Their NIP-11 documents show no auth or payment requirement.

**Why STUN goes in `rtcConfig.iceServers`:** setting it there replaces Trystero's four defaults (three Google hosts and one Cloudflare host) with a named pair.

**Relays a user adds** in Settings are appended to the list and never replace it. Peers only meet if they share at least one working relay.

## Room secret, link and code
The hypothesis had a 128-bit link id plus a short human-typeable code. Replace that with **one secret in two forms**.
- **Secret:** 20 Crockford-base32 characters (100 bits) from `crypto.getRandomValues`, plus one check character. It is shown as `K7QM-2XDP-4TR8-WHZN-3VBC-7`. Use 26 characters if the owner wants a full 128 bits.
- **Link:** `location.href.split('#')[0] + '#j=' + secret`. Build it from the current location, never hard-code `https://amorf.us`, so a player on an IPFS gateway path shares a gateway link. Parse it on `hashchange` and never use `pushState`.
- **Reserved optional link parameters:** `&sig=n|t` (signaling strategy) and `&r=<extra relay hosts>` (relay hints, so old immutable builds can still meet).
- **No separate room password.**

**Why no password:**
- Trystero already AES-GCM-encrypts every offer, answer and candidate. The key is `SHA-256("${password}:${appId}:${roomId}")`.
- Relays only see `SHA-1("Trystero@appId@roomId")` as the topic.
- With a 100-bit or longer room id, a password adds nothing.

**Why no short code:**
- A short code is the weakest secret, and it sets the security of the whole room.
- A relay operator can brute-force a roughly 40-bit code offline against the SHA-1 topic, on the order of a minute on one GPU (estimate). They can then decrypt the SDPs, which reveals players' IP addresses, and join the room.
- The fragment is never sent to a server: RFC 9110 keeps it out of requests and out of Referer. The link itself is still a bearer secret, though. Anyone who sees it, including the chat app it was pasted into, can join.

## Session layer (`src/net/session.ts`, transport-agnostic)
**Handshake.** Use Trystero's `onPeerHandshake`. Each side sends `{proto, build, worldId, replicaId, name}`.
- `replicaId` is a persistent random 64-bit id per world per browser.
- Do not use Trystero's `selfId`: it changes on every page load and comes from `Math.random`.
- Reject a peer on protocol mismatch, with the message "peer runs protocol vN; reload / open the same build".
- Reject a peer when the room is full. The cap is 8 players, which meets the requirement of at least 4.

**Reliable messages** use Trystero actions. Trystero only offers one channel, created by `createDataChannel('data')` and therefore reliable and ordered. It splits messages into 16 KB chunks with a 36-byte header plus a room frame of about 67 bytes, and applies backpressure at 64 KB. Actions:
- `hello`
- `op`: edit batches
- `sync`: version-vector anti-entropy
- `snap`: chunked snapshot on join
- `ctl`: neighbor sets, room-full notice, ping

**Unreliable positions.** Positions go on a second channel.
```ts
const pc = room.getPeers()[id]
pc.createDataChannel('pos', {negotiated: true, id: 42, ordered: false, maxRetransmits: 0})
```
- Create it on both sides in `onPeerJoin`.
- It must be `negotiated`. On the non-initiator side, Trystero's `pc.ondatachannel` replaces its internal channel with any incoming non-negotiated channel.
- Verified in Chromium 149: 30 of 30 position messages arrived, alongside Trystero actions on the same peer connection.
- Send at 15–20 Hz, about 20 bytes each (quantized position, yaw and pitch, sequence number).
- If `pos` is not open yet, fall back to an action.

**Peer relay.**
- Every peer broadcasts its neighbor set (`ctl`) whenever it changes and every 5 s.
- For each missing link X–Y, the forwarder is the peer Z with the smallest `replicaId` among those connected to both X and Y.
- Z forwards positions between X and Y.
- Ops are flooded with dedupe on `(replicaId, counter)`, TTL 2, and must be idempotent and commutative (the sync area owns that).
- Why this matters: if 10% of pairs failed independently, a 4-player full mesh would form only about 53% of the time (0.9^6), and an 8-player mesh about 5% (0.9^28). A connected graph is far more likely. These figures are an inference.
- Trystero issue #161 reports partial meshes in rooms of 3 or more.

## NAT traversal policy
- Bundle no TURN server.
- Settings → Network gets a "TURN server" field: urls, username, credential. It is appended to `iceServers`.
- Store it in IndexedDB only when the app is not served from a path gateway (`/ipfs/` or `/ipns/` path prefix). Path gateways share one origin across every CID on the gateway, so any other site there could read it. On a path gateway, keep it for the session only.
- In most cases only the restricted player needs to configure TURN. This is an inference from TURN relayed candidates.
- Trystero keeps a pool of 20 RTCPeerConnections, so a configured TURN server may receive about 20 Allocate requests per join. This is an inference from `offer-pool.mjs`.

**Failure messages.** Map Trystero state to plain messages:
- `getRelaySockets()` readyState → "n/6 signaling relays reachable". At 0 relays, inviting is disabled.
- `onJoinError` "could not connect to peer … after exchanging SDP" → "Direct connection blocked by one of your networks. If another player is connected to both of you, play continues through them. Otherwise try another network or add a TURN server."
- Handshake rejection → the version message.

## Privacy and disclosure
- **No network connection in single-player.** Relays and STUN are contacted only after the player clicks Host or Join.
- On first multiplayer use, show a "Multiplayer & privacy" sheet generated from `third-parties.json`.
- The sheet names every relay and STUN host and its operator, says what each one sees, and states: "players you connect to see your IP address".
- No analytics and no error reporting.
- **Nostr relays see:** your IP address, the page Origin (including the CID on subdomain gateways), User-Agent, timing, a SHA-1 topic hash (which IP addresses share a room), a Nostr key generated per page load, the Trystero peerId in plaintext, and one announce per minute. They do not see the room secret, the SDP (encrypted) or any game data.
- **STUN servers see:** your IP and port, and a burst of binding requests at join (20 pooled connections × 2 servers).
- **Peers see:** each other's public IP address (server-reflexive candidates). Chrome replaces local addresses with mDNS `.local` names. Peers also see all game data.

## Build gate additions (part of `npm run check`)
1. Vitest tests of `session.ts` running over `LoopbackTransport`.
2. A unit test asserting that `rtcConfig.iceServers` and `relayConfig.urls` equal the entries in `third-parties.json`.
3. Playwright net E2E (local signaling only, no internet), 2 and 4 contexts. Every WebSocket and request host must be listed in `third-parties.json`, and single-player must make zero non-origin requests.
4. **Not in the gate:** `npm run probe:relays`. It publishes and subscribes a Trystero-format ephemeral event on each relay and prints round-trip times. Public infrastructure is nondeterministic. Run it before every release and when editing the relay list.

## Rejected alternatives
| Option | Reason (evidence) |
|---|---|
| **PeerJS + 0.peerjs.com** | One operator with undocumented limits. SDP goes through the server in plaintext. The TURN hostnames bundled in 1.5.5 (`eu-0` and `us-0.turn.peerjs.com`) no longer resolve (DNS answer: none). Last release 2025-06. |
| **js-libp2p / Helia** | About 312 KB gz for a minimal browser stack. Needs relays and bootstrap nodes (browser P2P needs permanent signaling/relay infrastructure). Shipyard stops operating the IPFS bootstrap nodes and delegated-ipfs.dev, and stops js-libp2p work, on 2026-09-30. |
| **simple-peer + trackers** | simple-peer's last release was about 2022. Trystero's author discourages trackers ("only 4 public… spotty"). Only 3 of 5 trackers are reachable. |
| **Raw Nostr (nostr-tools)** | Would re-implement what Trystero's 22.6 KB Nostr strategy already does. |
| **MQTT** | 122 KB gz. The brokers are public test brokers: test.mosquitto.org says "do not… rely upon it". |
| **Firebase / Supabase** | Owner-run project plus an API key, which is a backend. |
| **Trystero IPFS (Waku)** | The author says it "rarely works". |
| **Manual SDP / QR** | Viable only post-MVP: a two-way exchange for each player, in a star around the host. |

## Hypothesis verdict

**The core of the hypothesis holds:** Trystero, Nostr signaling, public STUN, no default TURN, user-supplied TURN, a fragment link, and a full mesh of 8 or fewer peers. Several parts are wrong or weak.

1. **The short human-typeable code is a security hole.** The room's security equals its lowest-entropy secret. Relays see SHA-1("Trystero@appId@roomId"). A roughly 40-bit code can be brute-forced offline, and that gives both room access and the SDP key, which exposes IP addresses. Fix: the code is the same secret of at least 100 bits as the link, grouped for typing.

2. **The room password is redundant.** Trystero already derives the AES-GCM SDP key from SHA-256(password:appId:roomId). With a high-entropy roomId the password adds nothing. Drop it.

3. **"Nostr OR BitTorrent" undersells the difference.**
   - Trystero's author discourages trackers, and only 3 of 5 are reachable.
   - Nostr should be primary with a pinned curated relay list, not the library defaults. Only 17 of 28 defaults relay ephemeral events today, and the appId-derived pick for 'amorfus' yields 3 of 5 working relays.
   - Torrent is only a link-selected fallback. It must never run in parallel with Nostr, because peers would get duplicate connections.

4. **Public STUN should be pinned explicitly.** Name Cloudflare and Google through rtcConfig.iceServers instead of inheriting Trystero's four defaults.

5. **Positions need a separate channel.** Trystero offers only one reliable, ordered channel. Positions need an extra negotiated, unreliable channel via getPeers(). This works, and it must be negotiated.

6. **The link must not be hard-coded to https://amorf.us.** Build it from location so IPFS gateway users share working links.

7. **Peer relay is missing from the hypothesis and is needed for partial meshes.**

8. **"Optional user TURN" needs a storage rule.** Never persist it on a path-gateway origin.

The acceptance line "two browsers on different machines" is achievable without TURN only on networks that allow UDP hole punching. This must be flagged; it cannot be engineered away under the static, no-secrets constraints.

## Key decisions
- **Signaling library and strategy** → Trystero @trystero-p2p/nostr, exact pin 0.25.4 (then 0.25.5), behind an own Transport interface
  - why: Actively maintained (last push 2026-09-24; 1,218 of about 1,270 commits by one maintainer). 22.6 KB gz. Encrypts SDP end to end. getPeers() exposes RTCPeerConnection. Measured: 21 of 22 two-peer joins and 8 of 8 four-peer full meshes over public Nostr relays in Chromium 149. The joiner connected in 0.35–1.1 s.
  - rejected PeerJS + 0.peerjs.com: Single operator with undocumented limits. SDP is plaintext to the server. Its bundled TURN hostnames no longer resolve. Last release 2025-06-07.
  - rejected js-libp2p/Helia (WebRTC + circuit relay v2): Measured about 312 KB gz. Needs browser-reachable relays and bootstrap nodes (browser P2P needs permanent signaling/relay infrastructure). Shipyard stops operating the IPFS bootstrap nodes and delegated-ipfs.dev, and stops js-libp2p contributions, on 2026-09-30.
  - rejected simple-peer + WebTorrent trackers: simple-peer is unmaintained (9.11.1). Only 3 of 5 public trackers are reachable, and the Trystero author calls them spotty.
  - rejected Raw Nostr via nostr-tools: Duplicates Trystero's Nostr strategy with no benefit.
  - rejected Trystero MQTT / IPFS(Waku) / Firebase / Supabase: MQTT is 122 KB gz on test brokers. Waku 'rarely works' per the author. Firebase and Supabase need an owner-run project and an API key.
- **Relay list** → Pinned curated list of 6 Nostr relays passed via relayConfig.urls (all used at once). The user can append more, and the link can carry relay hints.
  - why: Trystero's appId-seeded default pick for 'amorfus' gives only 3 of 5 working relays today, and only 17 of 28 defaults passed an ephemeral round-trip. The default list changes between library versions, while IPFS builds are immutable.
  - rejected Trystero default list with redundancy 5: Selection depends on library version and is partly dead today.
  - rejected All 28 defaults: More operators see IP addresses, and more of them are dead.
- **ICE servers** → Explicit rtcConfig.iceServers: stun.cloudflare.com:3478 and stun.l.google.com:19302. No bundled TURN. Optional user-supplied TURN in Settings.
  - why: Names every third party. Two independent STUN operators. A TURN server cannot be bundled without a secret or a credential-minting backend.
  - rejected Trystero defaults (3 Google hosts + Cloudflare): Inherited, and changes with the library.
  - rejected Embedded static TURN credentials / Metered API key: Violates 'No secrets, API keys'. Invites abuse and billing on the owner.
  - rejected Cloudflare TURN via a credential-minting Worker: The Cloudflare docs require a backend holding the TURN key, which violates 'no backend' and 'no server run by me'.
  - rejected Free keyless TURN (Open Relay static credentials, freestun.net, PeerJS TURN): All failed on 2026-09-23: 400 response or no relay candidate, timeout, and DNS gone respectively. Open Relay now requires sign-up for an API key.
- **Join secret, link and code** → One secret of at least 100 bits (20 Crockford-base32 characters plus a check character) used as the Trystero roomId. The link is location-relative '#j=<secret>'. The code is the same string, grouped for typing. No separate password.
  - why: A short code is brute-forceable offline against the SHA-1 topic by any relay operator, which reveals IP addresses and grants room access. The SDP key already includes the roomId, so a password is redundant.
  - rejected 128-bit link id plus short human code (hypothesis): The low-entropy code sets the security of the whole room.
  - rejected Room password field: Adds nothing when the room id is high-entropy. Adds UX friction.
- **Channels** → Trystero actions (reliable, ordered) for ops, snapshots and control. An extra negotiated channel (id 42, unordered, maxRetransmits 0) on getPeers()[id] for positions.
  - why: Trystero opens only one reliable, ordered channel, so a snapshot transfer would delay positions behind it (head-of-line blocking). The negotiated channel is verified working in Chromium 149. A non-negotiated channel would replace Trystero's internal channel on the non-initiator side.
  - rejected Positions over Trystero actions only: Head-of-line blocking plus about 103 bytes of framing per message. Kept only as a fallback while 'pos' is not open.
- **Topology** → Full mesh capped at 8, plus app-level peer relay (deterministic forwarder per missing link, and op flooding with dedupe)
  - why: Partial meshes are common (Trystero #161), and some network pairs cannot connect without TURN. Relaying through a peer keeps a 3+ player session convergent when the connection graph is connected.
  - rejected Star through the host: The host becomes a single point of failure, and its upstream bandwidth scales with player count.
  - rejected Mesh without relay: One failed pair breaks consistency for everyone.
- **Fallback signaling** → Trystero torrent strategy, selected by the user and encoded in the link (&sig=t). Runs sequentially, never in parallel with Nostr.
  - why: Independent operators. About 1.3 KB extra gz. Same API. Parallel strategies create duplicate peer connections with no dedupe (#100).
  - rejected Nostr + torrent simultaneously: Duplicate connections to every peer, and app-level dedupe would be needed.
  - rejected PeerJS as fallback: A second WebRTC stack, plaintext SDP, and a single operator.
- **Network testing** → LoopbackTransport (seeded) for the deterministic gate. Playwright Chromium with 2 and 4 contexts against a local Nostr-compatible relay in the gate. Public relays only in a non-gating probe.
  - why: The owner's gate must be deterministic. Trystero accepts ws://127.0.0.1 relay URLs, which was verified.
  - rejected E2E against public relays in CI: Nondeterministic: one of 22 joins failed in the measurement, and relays die.

## Facts
- [V] Trystero latest is 0.25.4, published 2026-08-30. Packages are @trystero-p2p/{core,nostr,torrent,mqtt,ipfs,ws-relay}, all MIT. — npm view trystero time; https://www.npmjs.com/package/trystero
- [V] Trystero repo: 2,757 stars, 11 open issues, not archived, last push 2026-09-24. dmotz authored 1,218 commits; the next contributor has 22. — https://api.github.com/repos/dmotz/trystero ; /contributors
- [V] The Trystero strategies are Nostr (default), BitTorrent, MQTT, Supabase, Firebase, IPFS and a self-hosted WebSocket relay. Supabase needs an anon API key; Firebase needs your own databaseURL. — https://github.com/dmotz/trystero/blob/main/README.md
- [V] The Trystero 'IPFS' strategy is Waku (@waku/sdk). The author said on 2026-05-08 that 'Waku on the frontend seems very unreliable and the Trystero strategy rarely works'. — https://github.com/dmotz/trystero/issues/175
- [V] The Trystero author discourages the torrent strategy: 'only 4 public webtorrent trackers I'm aware of and all of them have spotty reliability' (2026-04-21). Torrent was broken in 0.23.0 and fixed in 0.23.1. — https://github.com/dmotz/trystero/issues/165
- [V] Minified ESM bundle size with esbuild 0.28.2 and gzip -9: nostr 61.3 KB (22.6 KB gz), torrent 51.8 KB (18.6 KB gz), mqtt 391 KB (122 KB gz), nostr+torrent 64.9 KB (23.9 KB gz). — Local measurement in the session scratchpad (tp/out-*.js)
- [V] Default relay selection: Nostr picks 5 of 28 defaults via a shuffle seeded from appId. Torrent uses the first 3 of 5 and MQTT the first 4 of 5. Passing relayConfig.urls uses the whole given list and ignores redundancy. — @trystero-p2p/core@0.25.4 dist/utils.mjs getRelays; nostr/torrent/mqtt dist/index.mjs
- [V] Trystero's default ICE servers are stun:stun.l.google.com:19302, stun1/stun2.l.google.com:19302 and stun:stun.cloudflare.com:3478. turnConfig is appended to these; rtcConfig.iceServers replaces them entirely. — @trystero-p2p/core@0.25.4 dist/peer.mjs (defaultIceServers, RTCPeerConnection ctor); README turnConfig
- [V] Trystero uses one data channel, created with createDataChannel('data') using default options (reliable and ordered). It chunks at 16 KB with a 36-byte header, sets bufferedAmountLowThreshold to 65535, and wraps each message in a room frame (3 bytes plus a 64-hex token). — @trystero-p2p/core@0.25.4 dist/peer.mjs, action-wire.mjs, shared-peer.mjs
- [V] getPeers() returns Record<string, RTCPeerConnection>. A negotiated channel (id 42, ordered:false, maxRetransmits:0) on it opens on both sides and coexists with Trystero actions: 30 of 30 position messages arrived in Chromium 149.0.7827.55 headless, and the same held in Node with node-datachannel 0.33.4. — README getPeers; local Playwright test tp/bt.mjs and Node test tp/peer.mjs
- [V] On the non-initiator side Trystero sets pc.ondatachannel to replace its internal dataChannel with any incoming channel. Extra channels must therefore be negotiated:true. — @trystero-p2p/core@0.25.4 dist/peer.mjs lines ~139-143
- [V] The SDP encryption key is SHA-256(`${password}:${appId}:${roomId}`) used with AES-GCM. The relay topic is SHA-1('Trystero@appId@roomId'). The announce content {peerId} is plaintext. selfId is 20 characters from Math.random, per page load. — @trystero-p2p/core@0.25.4 dist/crypto.mjs, strategy.mjs, topic-strategy.mjs, utils.mjs
- [V] Trystero warms a pool of 20 pre-made RTCPeerConnections (offers) on every non-passive join. — @trystero-p2p/core@0.25.4 dist/offer-pool.mjs (poolSize=20), strategy.mjs warmup
- [V] Nostr signaling uses event kinds 20000–29999 with an 'x' tag. NIP-01 defines 20000 <= n < 30000 as ephemeral, 'not expected to be stored by relays'. Steady-state announces are once per 60 s, and the client backs off on 'rate-limited:'. — @trystero-p2p/nostr@0.25.4 dist/index.mjs; https://github.com/nostr-protocol/nips/blob/master/01.md
- [V] On 2026-08-28 Trystero clients sent about 4,000 events/s to relay x.kojira.io (93% of its traffic) and took it down. 0.25.4 cut the announce volume. — https://github.com/dmotz/trystero/issues/192
- [V] Open issues: #196 reports slower Nostr room joins in 0.25.4, and #161 reports partial meshes in rooms of 3 or more. #195 (a room can never be rejoined after a failed send) is fixed on main (2026-09-24) but unreleased. — https://github.com/dmotz/trystero/issues/196 ; /issues/161 ; /issues/195 ; commits API
- [V] Running two strategies at once creates independent rooms and peer connections with no peer dedupe. The feature request (#100) is still open. — core dist/strategy.mjs (occupiedRooms per strategy instance); https://github.com/dmotz/trystero/issues/100
- [V] Of Trystero's 28 default Nostr relays, 17 passed an ephemeral Trystero-format round-trip on 2026-09-23. 4 failed to connect, 4 had no round-trip within 10 s, and 3 rejected the event (disk full; 'ephemeral kinds are not accepted'; empty reason). This is a single vantage point. — Local probe tp/rt.mjs using @trystero-p2p/nostr createEvent
- [V] For appId 'amorfus' the default pick is chorus.pjv.me (down), relay.sigit.io, top.testrelay.top, nostr-01.yakihonne.com and purplerelay.com (rejects writes), so 3 of 5 are usable. — Local computation tp/pick.mjs plus the probe above
- [V] These non-default relays passed the ephemeral round-trip: relay.damus.io, relay.primal.net, relay.snort.social, nostr.mom, offchain.pub, nostr.oxtr.dev, nostr.bitcoiner.social and nostr-pub.wellorder.net. relay.nos.social rejects with 'kind not allowed'. Their NIP-11 documents show no auth or payment requirement. — Local probe tp/rt2.mjs; NIP-11 fetches
- [V] Two Chromium contexts on one machine joining over public Nostr: 21 of 22 joins succeeded. The joiner connected in 0.77–1.1 s with the curated 6 relays and 0.35–0.43 s with the appId-derived 5. The one failure was 'could not connect … after exchanging SDP'. 4-context full meshes formed 8 of 8 times within 3.8–6.4 s, including 2.1 s of staggered joins. — Local Playwright runs tp/bt2.mjs, bt3.mjs, bt4.mjs (playwright-core 1.61.1, Chromium 149)
- [V] WebTorrent trackers reachable by WebSocket: open.ftorrent.com, tracker.webtorrent.dev and tracker.openwebtorrent.com. tracker.btorrent.xyz and tracker.files.fm failed. All 5 default MQTT brokers accepted WebSocket. — Local probe tp/probe.mjs
- [V] test.mosquitto.org says 'please do not abuse or rely upon it for anything of importance' and 'anybody could be listening'. — https://test.mosquitto.org/
- [V] PeerJS 1.5.5 (2025-06-07) ships default TURN turn:eu-0.turn.peerjs.com and us-0.turn.peerjs.com with username 'peerjs' and credential 'peerjsp'. On 2026-09-23 neither hostname had an A record. 0.peerjs.com answers and issues IDs. — peerjs@1.5.5 dist/bundler.mjs; https://dns.google/resolve?name=eu-0.turn.peerjs.com ; curl https://0.peerjs.com/peerjs/id
- [V] PeerJS sends offer and answer SDP payloads through the PeerServer WebSocket in plaintext. PeerServer's default concurrent_limit is 5000. The cloud server's limits are undocumented. — peerjs@1.5.5 dist/bundler.mjs (_makeOffer socket.send payload); https://github.com/peers/peerjs-server README
- [V] Metered Open Relay now requires signing up for an API key (20 GB/month free). The old static credentials openrelayproject/openrelayproject got a 400 on Allocate and no relay candidate through libdatachannel. freestun.net:3478 timed out. — https://www.metered.ca/tools/openrelay/ ; local tests turn.py and tp/turnprobe.mjs
- [V] Cloudflare TURN needs short-lived credentials minted by a back-end holding the TURN key ('keep your TURN key on the server side'). It costs $0.05/GB after 1,000 GB free. stun.cloudflare.com is free and unlimited. — https://developers.cloudflare.com/realtime/turn/generate-credentials/ ; https://developers.cloudflare.com/realtime/turn/faq/
- [V] stun.l.google.com:19302 and stun.cloudflare.com:3478 returned STUN Binding Success on 2026-09-23. — Local test stun.py
- [V] callstats.io (2017): 'on average about 30% of the P2P conferences has one endpoint connect via a TURN server'. — https://www.callstats.io/blog/2017/10/26/turn-webrtc-products (Wayback 20191119182741)
- [V] Tsahi Levent-Levi: 'Most large vendors I've spoken to report 20% TURN relay traffic. Some reported over 30%'. He has seen anywhere from 0 to 50%. — https://groups.google.com/g/discuss-webrtc/c/5d_EJwM6iJM ; https://bloggeek.me/webrtc-turn/
- [V] Tailscale: when both sides are behind hard (endpoint-dependent) NATs, a direct connection is essentially infeasible without birthday-paradox tricks. Networks that block all outbound UDP defeat every NAT trick. Their stack gets direct connections over 90% of the time. Browsers' ICE does not do birthday port-probing (that last point is inference). — https://tailscale.com/blog/how-nat-traversal-works
- [V] Chrome has replaced host candidate IPs with mDNS .local names since about M75/76. CI uses --disable-features=WebRtcHideLocalIpsWithMdns. — https://groups.google.com/g/discuss-webrtc/c/6stQXi72BEU ; local Playwright runs
- [V] Chromium caps RTCPeerConnections at kMaxPeerConnections = 500 ('Cannot create so many PeerConnections'). — https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/peerconnection/rtc_peer_connection.cc
- [V] A minimal js-libp2p browser stack (libp2p 3.3.11, @libp2p/webrtc 6.0.33, circuit-relay-v2 4.2.13, websockets, gossipsub 14.1.2, noise, yamux, identify, bootstrap) bundles to 1.12 MB minified, 312 KB gz. — Local esbuild measurement lp/out.js
- [V] Kubo's default RelayService is enabled with ConnectionDurationLimit 2m, ConnectionDataLimit 128 KiB, MaxReservations 128 and MaxCircuits 16. AutoTLS (libp2p.direct) is run by Interplanetary Shipyard. — https://github.com/ipfs/kubo/blob/master/docs/config.md
- [V] Shipyard ends IPFS work on 2026-09-30 and will stop operating ipfs.io, dweb.link, delegated-ipfs.dev and the IPFS bootstrap nodes. Its contributions to js-libp2p cease, and Helia and the Service Worker Gateway lose dedicated maintainers. — https://ipshipyard.com/blog/2026-the-end-of-ipfs-at-shipyard/
- [V] Browser-to-browser libp2p needs a circuit relay node to establish the WebRTC connection. — https://libp2p.io/docs/browser-connectivity/
- [V] simple-peer's latest is 9.11.1 (npm metadata last modified 2023-01-26). The maintained fork @thaunknown/simple-peer is 10.1.2 (2026-07). — npm view simple-peer / @thaunknown/simple-peer
- [V] On a path gateway all pages share one origin, so localStorage and IndexedDB are shared across CIDs. Subdomain gateways isolate origins. — https://docs.ipfs.tech/how-to/address-ipfs-on-web/
- [V] User agents MUST NOT include the fragment in Referer, and the http(s) request target carries no fragment. — https://www.rfc-editor.org/rfc/rfc9110 §4.2, §10.1.3
- [V] Trystero does not enforce wss://. A local ws://127.0.0.1 relay works for tests, and Trystero peers run in Node with the node-datachannel polyfill (one peer per process, because selfId is module-global). — core dist/utils.mjs makeSocket; local tests tp/peer.mjs and bt.mjs
- [unverified] Browsers send an Origin header on the WebSocket handshake, so relays learn the serving origin (amorf.us or a gateway/CID subdomain). — RFC 6455 §4.1 (recollection)
- [unverified] Usually only the restricted peer needs a TURN config: its relayed candidate is reachable from the other peer's server-reflexive address. — Inference from ICE/TURN mechanics (RFC 8445/8656)
- (removed: private source)

## Risks
- (high) Public Nostr relays die, fill up, or block Trystero-style ephemeral traffic. On 2026-09-23, 11 of 28 defaults were unusable, and x.kojira.io was overloaded and knocked offline on 2026-08-28. | impact: New sessions cannot find each other. Sessions already connected are unaffected. | mitigation: Pin 6 curated relays from independent operators, all used at once. User-appendable relays. Relay hints in the link. `npm run probe:relays` before every release. Torrent fallback. A relay-health indicator.
- (high) Immutable IPFS builds carry a relay list and a Trystero wire format that decay over time. | impact: Old CIDs lose multiplayer, or cannot meet newer builds. | mitigation: Relay hints in the link and relays editable in Settings. A handshake protocol version with a clear message. Document that old pinned builds may lose multiplayer.
- (medium) Pairs behind UDP-blocking firewalls, both-sides-symmetric/CGNAT, or VPN/extension policies (disable_non_proxied_udp) cannot connect without TURN. Industry data says 20–30% of sessions use TURN. | impact: The acceptance test fails on those networks. Two-player sessions have no workaround without TURN. | mitigation: Peer relay for 3+ players. User-supplied TURN. A precise failure message. Acceptance run on named, UDP-permissive networks.
- (medium) Trystero pre-1.0 API churn and regressions: package rename at 0.23, API change at 0.25, torrent broken in 0.23.0, slower Nostr joins in 0.25.4 (#196), rejoin bug #195. It is a single-maintainer project. | impact: Upgrades break joins, and a bus-factor risk remains. | mitigation: Exact version pin. An adapter behind the Transport interface. Playwright net E2E gates every upgrade. The library is MIT and small (23 KB gz), so it can be forked.
- (medium) Partial meshes from missed signaling (#161) or failed ICE pairs. | impact: Divergent views or missing players. | mitigation: Neighbor-set gossip plus a deterministic forwarder per missing link. Ops flooded with dedupe. Anti-entropy on (re)connect.
- (medium) The join link or code leaks, for example through a chat unfurler, a screenshot or history sync. Anyone holding it can join and grief, with no revocation. | impact: World vandalism and IP addresses exposed to strangers. | mitigation: At least 100-bit secrets. An 'Invite' action creates a new secret. Post-MVP: host-driven rekey over existing channels to kick a player.
- (high) Player IP addresses are visible to other players and to relay and STUN operators. | impact: Privacy expectations, since the requirements say 'no tracking'. | mitigation: Zero third-party contact in single-player. A disclosure sheet generated from third-parties.json on first multiplayer use. No analytics.
- (medium) User TURN credentials saved on a path-gateway origin are readable by every other CID on that gateway. | impact: The user's TURN account is exposed. | mitigation: Keep them for the session only when served from an /ipfs/ or /ipns/ path. Persist only on amorf.us or subdomain origins.
- (medium) Head-of-line blocking on Trystero's single reliable channel during a snapshot transfer. | impact: Rubber-banding of remote players. | mitigation: Positions on a negotiated unreliable channel. Snapshots chunked and throttled through Trystero's backpressure.
- (low) The 20-connection offer pool causes STUN bursts, and possibly about 20 TURN Allocates per join when TURN is configured. Repeated rejoin loops can approach Chromium's 500-PeerConnection cap. | impact: Quota exhaustion on a user's TURN server. Join failures after many rejoins. | mitigation: Throttle join retries. Document it. Watch Trystero #197 (configurable pool size).
- (high) Tests that depend on public relays make the build gate flaky: one of 22 joins failed even on a single machine. | impact: A red gate that is not caused by our code. Temptation to weaken the gate. | mitigation: The gate uses only LoopbackTransport and a local Nostr-compatible relay. Public-relay probes run outside the gate.

## Requirement conflicts
- [major] Acceptance: 'Two browsers on different machines can join the same world and see each other's edits' vs 'No game server run by me', 'Deploys as a fully static site: no backend' and 'No secrets, API keys, or tracking': There is no way to guarantee connectivity without TURN. A TURN server needs either a long-lived credential in the bundle (a secret, abusable, billed to the owner) or a backend that mints short-lived credentials (Cloudflare's documented model). No keyless public TURN worked on 2026-09-23. About 20–30% of WebRTC sessions industry-wide use TURN, and networks that block UDP or pairs of hard NATs cannot connect directly. → Scope the acceptance test to named networks that allow UDP hole punching: the same LAN, and two home broadband connections on different ISPs. Ship user-supplied TURN in Settings, peer relay for 3+ players, and an explicit failure message. The owner decides whether an optional owner-run credential Worker would ever be acceptable (default: no).
- [major] 'No game server run by me; any third-party signaling/relay dependency must be named' vs 'Build output is a single folder that can be pinned as-is' (IPFS immutability): A pinned build hard-codes its relay list, and public relays decay: 11 of 28 Trystero defaults were unusable today, and Trystero prunes the list between releases. A named dependency list is only accurate at build time. → Name the curated list in the plan, the README and the in-app sheet. Allow relays to be added in Settings and through link hints. Probe relays before each release. Document that old pinned CIDs may lose multiplayer.
- [major] 'Players can join a shared world via a link or code' (hypothesis: short human-typeable code) vs privacy and security: A short code is brute-forceable offline from the SHA-1 topic that relay operators see. That yields room access and the SDP key, which exposes IP addresses. → The code is the same secret of at least 100 bits as the link, grouped (20 Crockford-base32 characters plus a check character). No separate password.
- [minor] 'Supports at least 4 simultaneous players' plus 'Conflicting edits resolve deterministically so all peers end up with the same world' vs NAT reality: A full mesh needs N(N-1)/2 pair connections. One failed pair splits the mesh, so convergence is only eventual, and impossible while a player is unreachable by any path. → State convergence as eventual across the connected component. Add peer relay and anti-entropy on reconnect. Test partitions in LoopbackTransport.
- [minor] Owner norm: a deterministic build-blocking check vs P2P behaviour that depends on public infrastructure: Any gate test that touches public relays is nondeterministic. → The gate uses LoopbackTransport plus a local Nostr-compatible relay. `probe:relays` and the two-machine tests run outside the gate as a release checklist.
- [minor] 'If WebGPU is unavailable, show a clear message' vs automated multiplayer tests in headless CI: Headless CI browsers may lack WebGPU, so the real app would stop at the message and never reach the network code. → Add a test-only harness entry that boots the core and net modules without the renderer, used by Playwright net E2E.
- [minor] 'No secrets, API keys, or tracking' vs third-party signaling and STUN: The app does no tracking, but relay and STUN operators see IP addresses, timing, and which IP addresses share a room (topic hash). Peers see each other's IP addresses. → No third-party connection until the player chooses Host or Join. An in-app disclosure generated from the same manifest the runtime uses. No telemetry.

## Third-party deps
- relay.damus.io (Nostr relay) (damus.io (NIP-11 contact on file)) runtime (only after Host/Join): Signaling: peer discovery and encrypted SDP exchange | sees: IP, Origin, User-Agent, timing, SHA-1 room topic, ephemeral Nostr pubkey, plaintext Trystero peerId, sizes of the encrypted SDP
- relay.primal.net (Nostr relay) (Primal (NIP-11 'Primal Public Relay')) runtime (only after Host/Join): Signaling | sees: Same as the other Nostr relays
- nos.lol (Nostr relay) (nos.lol (no contact in NIP-11; operator unverified)) runtime (only after Host/Join): Signaling | sees: Same as the other Nostr relays
- offchain.pub (Nostr relay) (offchain.pub (NIP-11 contact on file)) runtime (only after Host/Join): Signaling | sees: Same as the other Nostr relays
- nostr.bitcoiner.social (Nostr relay) (bitcoiner.social (NIP-11 contact on file)) runtime (only after Host/Join): Signaling | sees: Same as the other Nostr relays
- yabu.me/v2 (Nostr relay) (yabu.me (NIP-11 contact on file)) runtime (only after Host/Join): Signaling | sees: Same as the other Nostr relays
- stun.cloudflare.com:3478 (Cloudflare, Inc.) runtime (only after Host/Join): STUN: discovers the public address for NAT traversal | sees: Public IP and port, timing (burst of about 20 binding requests at join)
- stun.l.google.com:19302 (Google LLC) runtime (only after Host/Join): STUN (redundant second operator) | sees: Public IP and port, timing
- Other players' browsers (The invited players) runtime: WebRTC peers and possible forwarders (peer relay) | sees: Your public IP (server-reflexive candidate), mDNS-obfuscated host candidates, all game data including forwarded ops and positions
- User-supplied TURN server (optional) (Whoever the user configures) runtime (opt-in): Relays WebRTC traffic when a direct connection fails | sees: IP, timing and volume of DTLS-encrypted traffic
- WebTorrent trackers tracker.webtorrent.dev, tracker.openwebtorrent.com, open.ftorrent.com (optional fallback) (Unverified (community-run)) runtime (opt-in fallback): Alternate signaling when the link or Settings select sig=t | sees: IP, Origin, timing, hashed room topic ('info_hash'), encrypted offers
- amorf.us static hosting (Cloudflare (Workers static assets, owner's account)) runtime (page load): Serves the static bundle. Not part of P2P. | sees: HTTP request logs (never the #fragment)
- IPFS gateway used by the player (e.g. inbrowser.link, a path gateway, or a local node) (The gateway operator (Shipyard operated ipfs.io, dweb.link and inbrowser.link until 2026-09-30; after that, Protocol Labs decides their future)) runtime (page load): Serves the static bundle on IPFS | sees: IP, requested CID (never the #fragment)
- @trystero-p2p/core, @trystero-p2p/nostr, @trystero-p2p/torrent, @noble/secp256k1 (Dan Motzenbecker (Trystero); Paul Miller (noble). npm registry) build-time: Bundled libraries. No runtime fetch. | sees: Nothing at runtime

## Test ideas
- LoopbackTransport: 4 peers do 1,000 random ops under seeded 0–200 ms latency, 10% reorder and 5% duplication, and must converge to identical world hashes.
- Partition test: block the A–B link in a 4-peer room. Ops and positions from A must reach B through the designated forwarder, with no duplicates applied. Restore the link, and neighbor sets must update and forwarding stop.
- A late joiner receives snapshot plus op tail and converges. Kill the source peer mid-snapshot and the joiner must resume from another peer.
- Handshake: a protocol-version mismatch is rejected on both sides with the version message. A 9th peer is rejected as room-full.
- Link and code: round-trip encode/decode. Case-insensitive, dash-tolerant, Crockford aliases (O to 0, I/L to 1). A bad check character is rejected. The link is built from location on http://localhost/ipfs/<cid>/ and on a subdomain origin, and the fragment never appears in any request.
- A unit test asserts that the joinRoom config's rtcConfig.iceServers and relayConfig.urls exactly equal the entries in third-parties.json.
- Playwright (Chromium, --disable-features=WebRtcHideLocalIpsWithMdns): 2 and 4 contexts on the harness page, against a local Nostr-compatible relay at ws://127.0.0.1. All pairs connect, ops converge, and the 'pos' channel opens with ordered=false.
- Playwright: record page.on('websocket') and all requests. Single-player must make zero non-origin requests. Multiplayer hosts must all be in third-parties.json.
- Playwright: kill the local relay after the mesh forms. Gameplay must continue, and a new joiner must see the 'no relays reachable' status.
- Playwright with a local coturn and iceTransportPolicy 'relay' (optional, non-gating job) checks the user-TURN settings plumbing.
- Persistence rule: TURN credentials entered on an /ipfs/ path origin are not persisted after reload. They are persisted on a subdomain or amorf.us origin.
- probe:relays (outside the gate): publish and subscribe a Trystero-format ephemeral event on each configured relay and report the round-trip. Fail the release checklist if fewer than 4 of 6 relays work.
- Manual release matrix: same LAN; two ISPs; home plus mobile hotspot; two hotspots (expect the failure message); UDP-blocked network with and without TURN; one player on amorf.us and one on an IPFS gateway; 4 players on at least 3 networks, measuring time-to-join and mesh completeness.

## Milestone notes
**Networking work in dependency order:**

1. **net-0 (with the core model, no Trystero yet).**
   - `Transport` interface (`sendReliable`, `sendUnreliable`, peer join/leave, status).
   - Seeded `LoopbackTransport`: latency, loss, reordering, duplication, partitions, churn.
   - `session.ts`: hello/handshake, op batches, positions, neighbor-set gossip, peer-relay forwarding, anti-entropy hooks.
   - Deterministic Vitest suites in `npm run check`.
2. **net-1.**
   - `TrysteroTransport` using `@trystero-p2p/nostr@0.25.4` with pinned relays and STUN from `config.ts`.
   - Secret, link and code generation and parsing, with a Crockford check character, built from the current location.
   - `onPeerHandshake` version and room-full checks.
   - Negotiated `pos` channel.
   - Test-only net harness page (no WebGPU).
   - Local Nostr-compatible test relay (about 60 lines of Node).
   - Playwright 2- and 4-context E2E served from a `/ipfs/<fake-cid>/` subpath.
   - Network-host allowlist assertion.
   - `third-parties.json` rendered into the privacy sheet.
3. **net-2.**
   - Failure UX: relay health from `getRelaySockets`, `onJoinError` classification.
   - Settings: user TURN (persistence rule for path gateways), extra relays.
   - Room cap of 8.
   - `probe:relays` script (outside the gate).
4. **net-3 (acceptance).** Manual two-machine matrix:
   - Same LAN.
   - Two ISPs.
   - Home plus mobile hotspot.
   - Two hotspots (expected failure, message verified).
   - UDP-blocked network plus TURN.
   - Gateway-served build plus amorf.us build in the same room.
   - Four players on at least 3 networks.

**Deferrable past MVP:**
- Torrent fallback. It is cheap, so it could land in net-2 if Nostr looks flaky.
- Manual/QR zero-third-party mode (star topology).
- Peer-assisted signaling for late joiners.
- Host rekey/kick.
- Per-peer op signatures.
- Daily topic rotation (so relays cannot link sessions across days).
- libp2p integration, only if browser P2P stops needing permanent signaling/relay infrastructure.
- A dockerized NAT lab (coturn plus symmetric-NAT namespaces) as a non-gating CI job.

## Open questions
- Does the owner accept that multiplayer will fail for some network pairs without TURN, and that the acceptance test runs on named, UDP-permissive networks?
- Would an optional, owner-run TURN credential Worker on Cloudflare (1,000 GB/month free) ever be acceptable, given 'no backend'? Default assumption: no.
- Is the owner comfortable with large social Nostr relays (damus, primal, nos.lol and others) seeing player IP addresses and which IP addresses share a room? Or should the list favour smaller relays?
- Code length: 20 characters (100 bits) or 26 characters (128 bits)?
- Should a room link be persistent per world (rejoinable forever) or per session (new secret per 'Invite')?
- Compatibility policy: should old IPFS-pinned builds interoperate with current amorf.us, or only matching protocol versions?
- Should Amorfus deliberately exercise a libp2p/Helia stack? Shipyard's 2026-09-30 wind-down makes that riskier, and that would change the libp2p verdict.
- Room cap: 8 players, or larger (for example 12 with peer relay)?