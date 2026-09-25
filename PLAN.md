# Amorfus — Plan

**Status:** proposal, awaiting approval. No code has been written.
**Date:** 2026-09-23.
**Answers:** the "First deliverable" section of [REQUIREMENTS.md](REQUIREMENTS.md).

How to read this:
- **§0** summarises the plan.
- **§1** is the decisions table.
- **§2** lists the requirement changes that approval would make.
- **§3** is the conflicts register.
- **§4** is the evidence.
- **§5–§15** are the design; §16–§18 are traceability, dependencies and deferrals.
- **Appendix A** holds byte-level formats and pinned versions.

The plan is long because it is also the implementation contract. Approval needs only §0–§3.

Conflicts are `C-n` and decisions `D-n`. Once this plan is approved, a number is never reused: a settled item keeps its number and records what settled it. In M0 the register moves to `docs/conflicts.md` as a living document.

---

## 0. Summary

**Core idea: the world is blocks; smooth geometry is a view of them.**
- Everything that is synced, saved, hashed or conflict-resolved is a per-cell 16-bit block value.
- Every surface on screen is a deterministic function of those values, plus a density hint recomputed from the seed.
- That keeps "seed plus edits" sharing, convergence between peers, seam-freedom and picking all testable in Node.

**The stack:**

| Area | Choice |
|---|---|
| Rendering | Raw WebGPU, hand-written WGSL, `wgpu-matrix`. No engine. One terrain pipeline; chunks drawn from pooled buffers with integer camera-relative positions. |
| Smoothing | "Guarded surface nets": Minecraft's culled-face topology, with vertices moved inside their cells. Starting positions come from the generator's density. Edited blocks relax locally. "Sharp" blocks pin to exact cube faces. |
| World | 32³ cubic chunks of `u16` blocks. A chunk is `generate(seed, generatorVersion)` with edits applied on top. The main thread owns block data; a worker pool generates and meshes. |
| P2P | WebRTC full mesh (≤ 8 players) via Trystero. Signaling through six named public Nostr relays. STUN from Cloudflare and Google. No TURN unless the user brings one. |
| Sync | Per-cell last-writer-wins map ordered by a hybrid logical clock. Anti-entropy by SHA-256 chunk digests. Positions are ephemeral and owned by their player. |
| Persistence | IndexedDB. A gzip `.amorfus` file of seed, generator version and edits for export, import and sharing. |
| Build | Vite 8 and TypeScript 6 with `base: './'`. A dist audit and gateway-shaped end-to-end tests run inside `npm run check`. |
| Hosting | amorf.us on Cloudflare Workers static assets (no Worker script). IPFS: an ipfs-car CAR pinned on Filebase, with DNSLink for a stable name. |

**Approval changes these requirements** (exact wording in §2):
- "An IPFS gateway path" becomes a local kubo gateway plus the Service Worker Gateway (C-4).
- "A local static server" means localhost (C-5).
- "Current desktop Chrome and Edge" means platforms where Chrome enables WebGPU by default (C-5).
- "Two machines" is scoped to named networks (C-1).
- "60 fps" gets a definition, a device and a scenario (C-6).
- "Immediately" becomes ≤ 33 ms at p95 (C-12).
- A "code" is the full 21-character secret (C-11).
- "Saves survive reloads" holds per origin (C-3).

**Biggest risks:**
1. Players on hostile networks cannot connect without a TURN server, which we cannot bundle (C-1).
2. IPFS origins do not carry saves across releases (C-3).
3. The public IPFS gateways change hands on 2026-09-30 (C-4).
4. The smoothing look and the collision clearances are unmeasured at their final constants; M3 settles them (C-8, C-9).
5. No GPU timing has been measured on real hardware yet; M2 measures it (C-6).
6. Hand-built gentle slopes (1:4–1:16) keep a visible terrace: 7–11° rms and up to 32° max normal error, measured (C-7).

**What approval authorises:** the conflict resolutions in §3, the defaults in §1 you don't override, and milestones M0–M8.
- It does **not** authorise publishing.
- Each first-time external action — pinning on Filebase, deploying to amorf.us, changing the `_dnslink` record — waits for your explicit go-ahead.
- Cloudflare access uses a narrowly scoped API token, never your full-account login.

**What this rests on:**
- Owner repos read.
- Eight parallel research passes, a critic pass, and an adversarial review, on 2026-09-23/24.
- JS prototypes and probes measured on the dev machine.

All numbers are labelled measured, projected or estimated. §4 lists everything; the reports and prototypes are in [research/2026-09-23/](research/2026-09-23/).

---

## 1. Decisions needed from you

### Group A — needs your input

| # | Question | Default / proposal |
|---|---|---|
| D-1 | Reference device for the 60 fps test | **Target class:** Intel Arc 140V / Radeon 780M laptop, Windows, Chrome **and** Edge. **Floor preset:** Iris Xe 96EU (the dev laptop, in Windows Chrome). Please name the machine. If no target-class machine exists, the acceptance device is the i7-1255U laptop in Windows Chrome and Edge, and the Medium tier must pass on it; Medium's radius is then 160 (C-19). |
| D-2 | Networks for the two-machine test | **Must pass:** same LAN; two home broadband lines on different ISPs; one player on amorf.us with the other on the same release through a local kubo/Service Worker Gateway; 4 players on ≥ 3 networks. **Best effort** (the failure message is the expected result): home broadband plus a phone hotspot, two hotspots, UDP-blocked networks. Who provides machines and people for M0 and M7? |
| D-3 | Collision vs block-sized openings (C-9) | Collide with the smooth surface. Capsule 0.6 × 1.8. **Clearance zone:** near edited blocks, the surface may intrude into air by at most 0.15 horizontally and 0.05 vertically. That covers dug tunnels, and also rooms and gaps built on untouched ground. These values are **extrapolated, not measured**; M3 measures them and you sign off. **Cost:** the 0.05 vertical cap is close to the zero cap the research rejected as blocky (near-square inner corners in edited terrain); dents get deeper (about 0.95 on binary ground, 1.25 on hinted); edited 1-block steps reach 41–51° against a provisional 50° slope limit. Alternatives: a 1.5-high player with the measured isotropic 0.2; or vertical collision against blocks. |
| D-4 | Accept that hand-built gentle slopes (1:4–1:16) keep a visible terrace: 7–11° rms, up to 32° max normal error, measured (C-7) | Yes for the MVP. A wider-support smoother for edited regions, or a smoothing brush, comes later. |
| D-5 | Project license | MIT. |
| D-6 | Pinning, DNSLink, credentials | Filebase with its S3 CAR import. Update `_dnslink.amorf.us` by hand at first. Keys and tokens stay in your environment, never in the repo or CI. Your own kubo node is an optional second pin. |
| D-7 | Git remote and push identity for this repo | Settle them **before the first push of this plan**, as proposed in the hand-off message. Host aliases, account names and key paths never appear in this public repo. |

### Group B — defaults; override only if you disagree

| # | Question | Default |
|---|---|---|
| D-8 | Join-code form (C-11) | One ≥ 100-bit secret: 21 Crockford base32 characters, shown as `K7QM-2XDP-4TR8-WHZN-3VBC-7`. No short code, no separate password. |
| D-9 | Trust model | The link is a capability: anyone in the room can edit anything. "New invite link" sends a REKEY to the peers you tick. Eviction works only once every remaining member has switched, and edits already merged stay. |
| D-10 | Offline edits to a shared world | They merge on your next meeting. "Save as copy" forks instead. |
| D-11 | Lifetime of the room secret | One secret per world, kept, and used only after an explicit Host or Join. Cost: relays can link the group's IPs across sessions until it is rotated. |
| D-12 | Where secrets and TURN credentials persist | Only where the origin classifier (§12.4) matched row 5 or 6 **and** `navigator.serviceWorker.controller` is null. Amorfus never registers a service worker, so any controller is third-party code, such as the Service Worker Gateway's. Everywhere else they last for the session only. |
| D-13 | Clock skew between peers | Warn above 2 s; refuse above 30 s with "your clock is N s off". |
| D-14 | CSP on amorf.us | Fixed header: `script-src 'self'; connect-src 'self' wss:; object-src 'none'; base-uri 'none'`, so user relays and link relay hints still work. |
| D-15 | What "Helia-based loader" means | The IPFS Service Worker Gateway contract in §13.6. Loaders that inline the HTML are unsupported. |
| D-16 | Departures from the site conventions | `not_found_handling: "none"` instead of `"404-page"`. `observability.enabled: false`, because request logs would keep visitor IPs, which conflicts with "no tracking". `assets.directory: "./dist"` instead of `./public`, because in Vite `public/` is a source folder and `dist/` is the build output. |
| D-17 | CI | GitHub Actions runs `npm run check`. If the M0 spike shows hosted runners cannot run the `webgpu` project or the `wgsl` step, CI instead runs a separately named `check:ci` that leaves out exactly those, labelled partial. The local `npm run check` stays the definition of done. The `webgpu` project fails, never skips, when it finds no adapter. |
| D-18 | Cross-release save handoff (§12.5) | Ship the **sender** in the MVP. The receiver ships with the second release. |
| D-19 | An owner-run TURN credential service (a separate Worker minting short-lived credentials; 1,000 GB/month free) | No. Two players who both sit behind UDP-blocked or doubly-CGNAT networks stay unsupported. |
| D-20 | Manual copy-paste/QR signaling (no third party at all) | After the MVP. |
| D-21 | Texture source | Procedural, generated on the GPU at startup: nothing downloaded, no licences. You sign off the look in M2. CC0 files are the fallback. |
| D-22 | Peers on non-Chromium browsers | Admitted. The generator canary refuses any mismatch. |
| D-23 | Largest world that live sync handles | 4e6 entries or 64 MB per transfer. Beyond that: "world too large to sync — share by file". Revisited once M1 measures memory per entry. |
| D-24 | Compatibility between builds | Every released generator stays in the bundle forever. Peers must match `protocolVersion` exactly. Generator v1 freezes at the first public release (M8), not earlier. |
| D-25 | STUN operators | Cloudflare and Google. Two operators give redundancy. |
| D-26 | Internal render-resolution cap | On by default: 2.1 MP at Medium. |

---

## 2. Requirement changes this approval makes

REQUIREMENTS.md is yours, so these edits go in only after you approve, in one commit that cites the C-numbers. M8's exit is measured against the amended text.

| Requirement (current) | Amended wording | Why |
|---|---|---|
| "Opening that folder over a local static server and through an IPFS gateway path both work" | "Opening that folder over a static server on localhost, through a local IPFS gateway in path form (`http://127.0.0.1:8080/ipfs/<CID>/`) and subdomain form, and through a locally built IPFS Service Worker Gateway (pinned 3.4.15; the Helia-based loader), all work. Public gateways, inbrowser.link included, are best effort." | C-4, C-5, C-17 |
| "Two browsers on different machines can join the same world and see each other's edits" | "… on the networks named in `docs/acceptance.md`, over https or localhost, with system clocks within 30 s" | C-1, C-5, D-2, D-13 |
| "… at 60 fps on the target hardware" | "… meeting the frame-time criteria in `docs/acceptance.md` on the reference device" | C-6, D-1 |
| "Edits reshape the smoothed surface immediately" | "… visibly within 33 ms at p95 and 50 ms at p99" | C-12 |
| "Players can join a shared world via a link or code" | "… via a link, or the same secret typed as a 21-character code" | C-11 |
| "Worlds save locally in the browser and survive reloads" | "… survive reloads on the same origin. Moving to another host or pinned release goes through export/import or the handoff." | C-3 |
| "Targets current desktop Chrome and Edge with WebGPU" | "… on platforms where Chrome enables WebGPU by default: Windows x64, macOS, ChromeOS, and Linux with Intel Gen12+ or NVIDIA on Wayland" | C-5 |
| "Blocks adjust to their neighbors so the terrain forms smooth surfaces" | Unchanged, noting that player-built gentle slopes keep a visible terrace | C-7, D-4 |

---

## 3. Conflicts register

**Severity:**
- **Major:** changes an acceptance line, or leaves a residual you must accept.
- **Minor:** met by a definition or an internal trade-off.

**Status values:**
- *proposed — settled by approval*
- *proposed — settled by Mn measurement or sign-off*
- *accepted limitation — stays open*

Every minor item is *proposed — settled by approval*.

### Major

**C-1 — Serverless P2P cannot guarantee that two machines connect.**
- **Status:** accepted limitation — stays open.
- **Problem:**
  - About 20–30% of WebRTC sessions need a TURN relay (industry figures). Networks that block UDP, and pairs of hard NATs, cannot connect directly.
  - A TURN server needs either a credential in the bundle (a secret, abusable, billed to you) or a backend that mints short-lived credentials.
  - No keyless public TURN worked on 2026-09-23.
- **Proposed resolution:**
  - Scope the acceptance test to the D-2 networks.
  - Bring-your-own-TURN setting.
  - Peer relay for 3+ players.
  - A precise failure message.
  - A two-machine network spike in M0, so this risk is measured first, not last.
- **Residual:** two players who both need TURN cannot connect without one (D-19).

**C-2 — Signaling is permanent third-party infrastructure, and immutable builds freeze it.**
- **Status:** accepted limitation — stays open.
- **Problem:**
  - Public relays die, fill up, or refuse or rate-limit this kind of traffic. On 2026-09-23, 11 of Trystero's 28 default relays were unusable.
  - A pinned CID can never update its relay list.
- **Proposed resolution:** name the dependency and limit it.
  - Name six curated relays (§17).
  - Relays can be added in Settings.
  - Join links can carry relay hints; the joiner confirms them before connecting.
  - `probe:relays` blocks deploy and publish when fewer than 4 of 6 relays work.
- **Residual:** old CIDs may lose multiplayer.

**C-3 — "Saves survive reloads" breaks down on IPFS origins.**
- **Status:** accepted limitation — stays open.
- **Problem:** browser storage is per origin.
  - Subdomain gateways give every CID its own origin. This is now the norm: dweb.link's subdomain form redirects to inbrowser.link. So every new release starts with empty storage.
  - Path gateways share one origin with every other site on the gateway.
  - Sandboxed loaders have no storage at all.
  - Fresh CID origins are unlikely to be granted `persist()`.
- **Proposed resolution:**
  - Stable origins: amorf.us, and DNSLink `amorf-us.ipns.<gateway>`.
  - An ordered origin classifier with banners (§12.4).
  - Untrusted-read validation on shared origins.
  - Session-only mode where there is no storage.
  - A handoff sender in the MVP.
  - Prominent export.
- **Residual:** saves on a pinned-CID origin do not follow you into the next release unless you hand off or export.

**C-4 — "Through an IPFS gateway path" no longer describes the public gateways.**
- **Status:** proposed — settled by approval.
- **Verified 2026-09-23/24:**
  - Path requests to ipfs.io and dweb.link, browser navigations included, return HTTP 429 (`sunset: Mon, 21 Sep 2026`).
  - Subdomain URLs (`<cid>.ipfs.dweb.link`) redirect with a 302 to `<cid>.ipfs.inbrowser.link`, the subdomain-only Service Worker Gateway.
  - Interplanetary Shipyard ends its IPFS work on 2026-09-30; inbrowser.link is moving to the IPFS Foundation.
  - cloudflare-ipfs.com is gone. Pinata's gateway refuses HTML.
  - `ipfs.4everland.io` still serves the path form, but on a shared origin that is not on the Public Suffix List.
  - `ipfs.filebase.io` serves under `default-src 'self'`, which blocks signaling.
- **Proposed resolution:**
  - Acceptance runs on a local kubo, path and subdomain forms, and on a locally built Service Worker Gateway pinned at 3.4.15. That gateway is the Helia-based loader.
  - inbrowser.link and ipfs.4everland.io are best-effort manual checks.

**C-5 — "Current desktop Chrome and Edge" does not imply WebGPU, and WebGPU needs a secure context.**
- **Status:** proposed — settled by approval.
- **Problem:**
  - WebGPU is on by default (Chrome 153) on Windows x64, macOS, ChromeOS, and Linux only with Intel Gen12+ or NVIDIA-on-Wayland.
  - It is off by default on Linux AMD (the Radeon 780M included), NVIDIA-on-X11 and older Intel, and on Windows on ARM64.
  - `navigator.gpu` and `crypto.subtle` are undefined on `http://<LAN IP>` (verified). A second machine loading a LAN static server gets neither WebGPU nor Trystero.
- **Proposed resolution:**
  - "Local static server" means localhost.
  - Cross-machine tests use https, or `dev:lan` with a self-signed certificate.
  - The failure messages name each cause (§8.2).

**C-6 — "60 fps on mid-range hardware at a reasonable view distance" is not testable as written.**
- **Status:** proposed — settled by M2 measurement.
- **Problem:**
  - No device, resolution, view distance, scenario or metric is given.
  - High-DPR panels (4–5 MP) change the GPU load by 2× or more.
  - 120/144 Hz panels change what "fps" means.
  - No CI runner has a representative GPU.
- **Proposed resolution:** `docs/acceptance.md`, agreed at the M2 exit, fixes:
  - the device (D-1) and a panel set to 60 Hz;
  - the pixel cap (D-26) and the default view distance, from measurement;
  - **scenario A**, a scripted 90 s walk/fly/edit run;
  - **scenario B**, 4 peers, one joining a world of 1e5 edits mid-run, remote edits at 10/s.

  **A run passes only if:**
  - frame interval p95 ≤ 18.3 ms, p99 ≤ 25 ms, and max ≤ 50 ms after the 10 s load window;
  - no main-thread long task over 50 ms;
  - edit-to-visible p95 ≤ 33 ms and p99 ≤ 50 ms;
  - the quality tier never changes during the run;
  - persistence is on (from M6).

  These are logged manual runs: scenario A at the M5, M6, M7 and M8 exits, scenario B at the M7 and M8 exits.

**C-7 — Block data alone cannot produce smooth gentle slopes.**
- **Status:** accepted limitation — stays open for hand-built terrain.
- **Problem:** measured, no local smoother over binary occupancy removes terracing on gentle slopes.
  - 1:4 to 1:16 slopes keep 7–11° rms and 13–32° max normal error, even with 6–8 relaxation iterations.
  - Removing a terrace n blocks wide takes about n² iterations.
- **Proposed resolution:** the generator supplies a per-block density hint (int8), derived from the seed and never stored or synced. Measured on 1:2–1:16 slopes: generated terrain comes out within ≤ 0.1°.
- **Residual:** terrain the player builds or reshapes is smoothed from binary data, so hand-built 1:4–1:16 ramps keep a visible terrace (D-4). The M3 gallery shows hand-built slopes next to generated ones.

**C-8 — Smoothing fights single-block editability.**
- **Status:** proposed — settled by M3 sign-off.
- **Residual:** smooth placed blocks read as 0.75 bumps unless made sharp, and block edges show only through the outline and ghost.
- **Problem:** naive relaxation shrinks a floating block to volume 0.007, a pillar to 0.32 wide and a placed block to a 0.55 bump. Block boundaries are also invisible on a smooth surface.
- **Proposed resolution:**
  - A thin-feature guard (floating block ≥ 0.216, pillar ≥ 0.4, bump 0.75 on binary ground; measured at isotropic hE = 0.2).
  - The per-block "sharp" toggle.
  - Exact picking, with a target outline and a ghost cube.
  - The M3 gallery sign-off.

**C-9 — Smooth collision shrinks block-sized openings.**
- **Status:** proposed — settled by M3 measurement.
- **Problem:**
  - Symmetric smoothing narrows a dug 1×2 tunnel to 0.59 × 1.00, which traps a 0.6 × 1.8 player.
  - Openings bounded by untouched hinted ground also shrink. A 2-high room built on generated ground can drop to 1.45 of headroom, because hinted ground may sit up to 0.5 above its grid plane.
  - Colliding with blocks instead makes feet float or sink.
- **Proposed resolution:** the D-3 clearance zone (§7.4).
  - The tunnel arithmetic, (W − 0.3) × (H − 0.1), was reproduced by re-running the research prototype. The rest is extrapolated.
  - M3 re-derives the physics limits from the measured shapes.
  - Gate tests: dig a 1×2 tunnel and walk through it; walk under a roof placed 2 above untouched ground at any hint phase; walk through a 1-wide gap between a placed wall and a natural one.
- **Residual:**
  - The 0.05 vertical cap is close to the zero cap the research rejected as blocky, so inner corners in edited terrain come out near-square.
  - Dents are deeper.
  - Edited 1-block steps come out at 41–51° against a provisional 50° slope limit (re-run).

**C-10 — Seed-plus-edits sharing needs bit-exact terrain on every machine, forever.**
- **Status:** proposed — settled by approval.
- **Problem:**
  - ECMA-262 leaves `sin`, `exp`, `pow`, `**`, `tanh` and others implementation-approximated. Measured: `Math.pow` differs by 1 ulp in 10% of inputs between V8 12.4 and 13.6.
  - WGSL allows fusion and reassociation.
  - Changing the generator moves the ground under existing edits.
- **Proposed resolution:**
  - Occupancy is computed on the CPU, in float64, from an **allowlist** of exactly rounded operations, enforced by lint.
  - Golden hashes run in Node (x64 and arm64) **and in Chromium against the production bundle**.
  - A canary hash is compiled into the build and checked at startup. On a mismatch the app warns and disables Host, Join and share export. The canary is also exchanged in the handshake.
  - Every released generator is frozen and kept (D-24).
- **Residual:** terrain improvements apply only to new worlds.

**C-11 — "Join via a link or code".**
- **Status:** proposed — settled by approval.
- **Problem:**
  - A relay operator sees `SHA-1("Trystero@appId@roomId")` and can brute-force a roughly 40-bit code offline. That yields room access and the SDP key, which exposes IP addresses.
  - A link is a rendezvous, not a copy: it delivers edits only while a peer who holds them is online.
- **Proposed resolution:** the code is the full secret (D-8). Sharing while no one is online goes through the export file.

**C-12 — "Immediately" + "no seams" + "must not stall".**
- **Status:** proposed — settled by M3 and M5 measurement.
- **Problem:**
  - An edit near a chunk corner dirties up to 8 chunks.
  - Remeshing them on the main thread stalls it. Off-thread remeshing costs time. Swapping them one by one shows a crack.
  - With the chosen mesher, an 8-chunk remesh on E-cores may miss two frames (estimate).
- **Proposed resolution:**
  - Visible within 33 ms at p95 and 50 ms at p99 (in ms, independent of refresh rate).
  - Every affected chunk swaps in the same frame (§9.4).
  - If M3's measurement misses this, reserve more workers for edits, or ask you to accept ≤ 50 ms at p95 and ≤ 67 ms at p99.

### Minor

| # | Problem | Proposed resolution |
|---|---|---|
| C-13 | "All peers end up with the same world" has preconditions: it holds across a connected component, eventually. Edits by a player who leaves unsynced arrive when that player returns. Nobody has authority. | State P1–P7 and test them (§11.5). D-9 sets the trust model. |
| C-14 | Old CIDs live forever, so peers run different builds. | The handshake refuses protocol, generator or canary mismatches with a readable message. Links are built from `location`, so an IPFS link pins the inviter's build. D-24. |
| C-15 | "No tracking" vs what P2P exposes. Peers see each other's IPs. Relays and STUN servers see IPs, timing and a room topic. Millisecond stamps in share files would reveal play times. Cloudflare can inject analytics and keep request logs. | Zero third-party contact in single-player. A disclosure sheet generated from `third-party.json`. No analytics. Share files rebase their stamps (§12.6). Zone analytics off and `observability` off (D-16); `verify-live` hash-checks the served HTML. |
| C-16 | CSP-restricted hosts block signaling (ipfs.filebase.io). A per-host `connect-src` would block user relays. | Single-player works everywhere; the app shows "network blocked by this host". amorf.us uses D-14. |
| C-17 | "Helia-based loaders" is undefined. A loader that inlines the HTML breaks every relative URL. | The loader contract in §13.6 (D-15), tested by `swg-smoke`. |
| C-18 | Double-clicking `index.html` gives a blank page, because modules don't run from `file://` (verified). | A static message visible by default, plus a classic `boot.js` that detects `file://`. |
| C-19 | Without LOD, view distance tops out around 192–256 blocks on target iGPUs and 128–160 on the Iris Xe floor (projection). | No LOD in the MVP; fog at the edge. |
| C-20 | Departures from the site conventions: `not_found_handling: "none"`, because a `404.html` served at arbitrary depth can't use relative links; `assets.directory: "./dist"`; `observability` off. Like most of the owner's sites, there is no Worker script, and a www redirect, if wanted, becomes a zone Redirect Rule. | D-16. |
| C-21 | Rendering is outside "automated tests for the non-rendering core", but the owner's norm is a build-blocking gate. | WGSL compile check (Dawn for Node) and SwiftShader Playwright projects in the gate. Performance runs manually, and says so. |
| C-22 | Mobile is out of scope, but Android Chrome ships WebGPU. | A "desktop keyboard and mouse required" notice on coarse-pointer devices. |
| C-23 | The repo has no LICENSE, and bundled dependencies need their notices shipped. | D-5. `THIRD-PARTY-LICENSES.txt` is generated from npm, worker-only and vendored code, and checked against an expected list. |
| C-24 | Firefox and Safari now ship WebGPU, which widens the determinism surface. The exact-operations subset is identical per ECMA-262 in principle, but V8's non-contraction and other engines are not covered by the gate. | D-22: admitted. The canary refuses any mismatch. An optional Firefox golden run later. |

---

## 4. Evidence: what this plan rests on

**Owner repos read:**
- **Public, named:** `gargantis/amorfus` (README, REQUIREMENTS, .gitignore, git log); `peatyscot/peatyscot` (wrangler.jsonc, package.json); `nytime5/nytime5` (wrangler.jsonc); `bitsy-services/wiki` (CI workflow); `uniteum/docs` (deploy workflow).
- **Private, neither named nor described here, because this repo is public.** The exact files are listed in the hand-off message.
- **The owner's written site-stack conventions** (not public). They are the source of the `404-page`, `./public` and `observability` defaults that D-16 departs from.

**Research on 2026-09-23/24:**
- Eight parallel investigations: one per area, plus a blind end-to-end draft.
- A critic pass that reconciled them.
- An eight-lens adversarial review of the first draft of this plan.

**Primary sources:**
- the WebGPU and WGSL editor's drafts (2026-09-23), ECMA-262, the IPFS gateway specs, RFC 9110;
- Kulkarni et al. 2014 (HLC), Gibson's TR99-24 (constrained elastic surface nets);
- the npm registry;
- source read from tarballs: Trystero 0.25.4, three r185, `@helia/verified-fetch` 8.1.2, and `ipfs/service-worker-gateway` 3.4.15.

**Measured** (i7-1255U / Iris Xe laptop under WSL2, Node 22.22.1, headless Chromium 149/153 on SwiftShader):
- **Smoothing prototype:** shapes, seams, costs.
- **Scaling of a simpler core mesher:** worker-pool scaling only; its absolute throughput does not carry over (§9.1).
- **Data formats:** CRDT library benchmarks; codec and file sizes, for the research codecs, not this plan's.
- **Build:** Vite 8.3 relative-URL output, loaded through a static server at `/` and at `/ipfs/<cid>/`, through kubo 0.43.1 path and subdomain gateways, and through a local Service Worker Gateway 3.4.15; ipfs-car vs kubo CIDs.
- **Rendering:** relative per-frame CPU cost of raw WebGPU, three r185 and Babylon 9.27.
- **Networking, on one machine only:** Trystero joins over public Nostr (signaling only; no NAT traversal); probes of relays, STUN and TURN.

**Projected or estimated** — M2–M5 measure these:
- every real-GPU timing;
- memory and triangle counts (projected from test terrain made by a different generator);
- throughput of the chosen mesher pipeline;
- NAT failure rates (industry figures);
- cross-machine CID reproducibility;
- the anisotropic clearance constants.

**Snapshot:** relays, gateways and pinning services are as observed on 2026-09-23/24.

---

## 5. Architecture overview

```
main thread ── input · physics · picking · scheduler · WorldStore + EditLog (authoritative blocks)
            ── renderer (WebGPU) · upload scheduler · DOM UI · networking (WebRTC) · IndexedDB
worker pool ── stateless module workers: GEN_MESH / REMESH jobs → mesh + pick/collision buffers + hint planes
              (ArrayBuffers transferred, never shared)
```

- **`src/core` is pure TypeScript:** no DOM, no GPU. It holds the world model, generator, mesher, physics maths, CRDT, codecs and session protocol, and runs in Node for tests, in workers, and on the main thread.
- **No SharedArrayBuffer:** it needs COOP/COEP isolation, and no gateway grants that. SAB was undefined on every mount tested.
- **Renderer on the main thread:** `GPUDevice` is not transferable. An OffscreenCanvas renderer is post-MVP.

**Module map:**

```
index.html                 static boot/fallback message, visible by default
public/boot.js             classic pre-module checks (file://, insecure context, no navigator.gpu, load timeout)
public/_headers            amorf.us only: immutable caching of assets/*, the D-14 CSP, nosniff, no-referrer
src/core/world/            block value codec, coordinates and bounds, chunk keys, ChunkStore, EditLog view
src/core/gen/v1/           frozen generator v1 + vendored FastNoiseLite + its LICENSE (lint: exact-ops allowlist)
src/core/mesh/             mesher kernel, dirty sets, pick/collision records
src/core/physics/          capsule controller, ray picking
src/core/sync/             HLC, LWW store, digests, session protocol (HELLO, anti-entropy, forwarding)
src/core/codec/            DataView reader/writer, varints, chunk-entries codec, .amorfus container
src/workers/               gen-mesh.worker.ts
src/render/                gpu-init, messages, renderer, pool allocator, upload scheduler, culling, tiers,
                           resize, profiler, procedural textures, shaders/*.wgsl
src/net/                   Transport interface, loopback and trystero transports, third-party config
src/storage/               IndexedDB, origin classifier, flush policy, locks, handoff
src/game/, src/ui/         scheduler, input, player, editing; menus, hotbar, banners, privacy sheet
e2e/                       Playwright specs, serve-gateway.mjs, local Nostr-compatible relay
scripts/                   audit-dist, licenses, public-scan, wgsl-check (Dawn for Node), cid, kubo-smoke,
                           swg-smoke, publish-ipfs, verify-live, probe-relays
patches/                   the patch-package patch for Trystero (§10.1)
third-party.json           every external host: kind, purpose, operator, what it sees (machine-checked)
docs/acceptance.md         reference device, scenarios, network matrix (agreed at M2)
docs/conflicts.md          the living C-register (from M0)
```

The lint rules and golden files depend on these paths, so the paths are part of the contract.

---

## 6. Chunk and world data model

### 6.1 Block value

A block is a canonical `u16`, used everywhere:

| Bits | Meaning |
|---|---|
| 0–7 | material id (0 = air) |
| 8 | `sharp` |
| 9–15 | reserved, must be 0 |

- Air always has `sharp = 0`.
- A non-canonical value is invalid everywhere: on the wire, in storage reads and in imports.
- The material registry is append-only and fixed per `protocolVersion`.
- MVP materials:
  - generated: grass, dirt, stone, sand;
  - player-only: planks, brick;
  - two spare slots, for 8 in total.

### 6.2 Chunks, bounds, memory

- **Chunks:** 32³, keyed by `(cx, cy, cz)` packed into one safe-integer Number.
- **World bounds** (protocol constants of generator v1): x, z ∈ [−2²³, 2²³); y ∈ [−256, 512).
  - Below the world the mesher treats cells as stone; above it, as air.
- **Storage kinds:** `uniform {value}`, or `dense Uint16Array(32768)`.
- **Hint state:** every loaded chunk records one (§7.1). It is either an int8 **hint plane**, when any hint is unsaturated (uniform chunks bordering a surface included), or the marker `saturated`, meaning every hint is ±127 with its sign equal to occupancy. GEN_MESH returns the state for every chunk it generates.
- **Projected** (from test terrain made by a different generator, 160-block band): at R = 192, about 25 MiB of voxels, plus up to about 13 MiB of hint planes, plus an estimated 15–30 MiB of collision copies; about 1.2 M triangles in total.

### 6.3 Source of truth

- **Effective value:** `W(cell) = edits.has(cell) ? edits.get(cell).value : G[generatorVersion](seed, cell)`.
- **Chunk data** is a cache and is never saved.
- **Edits** are final values with stamps (§11), so applying them is idempotent and order-free.
- **Entries are never deleted.** An edit whose value equals the current `W` is not written. Placing the generated value back leaves an entry, but `shapeEdited` (§7.1) comes out false for it, so the hint returns.

### 6.4 Terrain generator v1 (CPU, deterministic, frozen at the first public release)

- **Height:** `H(x,z) = 32 + 48·C(x/1024, z/1024) + 24·fBm₄(x/256, z/256)`, plus a ridged term masked by the continentalness `C`.
  - The ridged term's amplitude is bounded so that −56 < H < 152 for all (x, z), given the noise ranges. Then max H + 8 < 160 and min H − 8 > −64.
  - A golden property test samples H and asserts the bound, so ridges are never cut flat at the top of the 3D band.
- **3D band:** all 3D terms are evaluated only for y ∈ **[−64, 160)** (constants of v1).
  - Below the band every chunk is uniform stone; above it, uniform air.
  - The 3D fBm is evaluated only where |H − y| < 24.
  - Golden tests assert that chunks outside the band are uniform.
- **Density:** `d = min(H − y + 8·fBm₂³ᴰ(x/48, y/32, z/48), CAVE_K·(|N(x/40, y/24, z/40)| − 0.06))` inside the band.
  - The cave term applies only where y < H − 4.
  - `CAVE_K` is chosen so that both terms are roughly 1 per block.
  - Occupancy ⇔ `d > 0`.
- **Lattice:** 3D terms are sampled on a **world-aligned** 4-block lattice and interpolated trilinearly. Measured 2.5× faster than per-voxel sampling. A chunk-anchored lattice would break the apron.
- **Hint:**
  - `q = Math.round(127·clamp(d/SCALE, −1, 1))`;
  - `hint = solid ? max(1, q) : min(−1, q)`.

  So the hint is never 0 and its sign always equals occupancy. `SCALE` is a frozen constant covered by the golden hashes.
- **Materials:** grass (sand near sea level), then 3 dirt, then stone.
- **Arithmetic allowlist** (lint): `+ − * / %`, `Math.sqrt/floor/ceil/round/trunc/abs/min/max/fround/imul/clz32`, and bit operations.
  - Every other `Math` member fails, including `tanh`, which V8 routes through the host libm.
  - `Date`, `performance`, `crypto` and `Math.random` are also banned in `src/core/gen/**`.
- **Randomness:** a stateless `hash32(seed, x, y, z)` built from `Math.imul`; splitmix32 or sfc32 for features.
- **Noise:** FastNoiseLite 1.1.1 (MIT), vendored with its LICENSE. It uses only allowed operations. Its golden hash matched on Node 20, 22 and 24 (x64).

---

## 7. Smoothing technique

"Guarded surface nets on binary topology, initialised from generator density."

The design came out of a JS prototype that compared it with:
- naive relaxation;
- Gibson's linking;
- Taubin smoothing;
- blur-initialised starting positions;
- NoCubes-style naive surface nets.

The prototype's code and results are in `research/2026-09-23/`.

### 7.1 Inputs

| Input | Definition |
|---|---|
| `solid` | material ≠ 0 |
| `sharp` | bit 8 of the value |
| `hint` | a pure function of `(seed, generatorVersion, cell)` (§6.4), available for every block in any region a job meshes |
| `shapeEdited` | an edit entry exists and `sharp(W) ∨ (solid(W) ≠ (hint > 0))`. Derived, never synced. |

**ρ**, the per-block density fed to the mesher:
- ρ = hint/127 when the block is not shape-edited;
- ρ = ±1 when it is.

"Hint-less" blocks exist only in the binary test mode.

### 7.2 Topology, starting position, output

- **Vertices:** one per integer corner whose 8 blocks are mixed solid and air.
- **Quads:** one per face-adjacent solid/air pair, owned by the chunk of the pair's lower block.
- **Relaxation graph:** mesh edges only. Gibson's any-adjacent-cell linking collapsed a 1-thick slab to 0.41.
- **Diagonal-only contacts** stay pinched; the mesh is a closed 2-chain.
- **Cubes:** with every offset held at 0, the output is exactly Minecraft's cube mesh. Verified over 20 random worlds.
- **Starting offset d₀:** the mean of the interpolated zero crossings of ρ on the cell's sign-changing edges.
  - Generated slopes come out within ≤ 0.1° over the measured 1:2–1:16 range. Steeper slopes depend on `SCALE` and are checked in M3.
- **Output:**
  - Offsets are quantised to 1/256 of a block. Quantising in offset space is what makes shared vertices identical: measured over 821 shared vertices, 0 position and 0 normal mismatches, against 72 and 767 with chunk-local f32.
  - Normals are area-weighted over quads, including those owned by neighbouring chunks inside the apron, and excluding sharp faces. A zero normal falls back to the occupancy gradient. Encoded octahedral.
  - Sharp quads get flat-shaded vertices of their own.
  - A smooth quad takes its owning solid block's material, and vertices split per (corner, material), so a lone placed block shows 100% of its material.
  - `AO = clamp(1 − 1.2·max(0, f − 0.5), 0.55, 1)`, where `f` is the solid fraction of the 4×4×4 blocks around the corner.
  - Quads are triangulated on the shorter diagonal (0–2 on a tie).
- **Pick/collision record:** one `u32` per quad, `(lowerLocalIndex, axis, sign)`. `sign` says which block of the pair is solid. Records are sorted by lower block, with CSR offsets.

### 7.3 Relaxation

- **Relax set R:** vertices whose cell contains a shape-edited block. All other vertices keep `d₀`.
- **Update:** k = 6 damped Jacobi iterations (λ = 0.5) in corner-offset space, ping-pong buffered, visiting neighbours in the fixed order −x, +x, −y, +y, −z, +z:
  `m = mean(e_vw + d_w)`, then `d ← clampBox(d + λ(m − d))`.
- **Why Jacobi:** Gibson's sequential updates depend on visiting order.
- **Why damped:** undamped λ = 1 collapsed a pillar to 0.07.

### 7.4 Constraint box (per vertex, per axis)

1. **Thin-feature guard.** The half-width is `min G[n6]` over the non-sharp blocks in the cell, with `G = [0.20, 0.25, 0.30, 0.5, 0.5, 0.5, 0.5]`. It protects dents and shafts too.
2. **Clearance zone (D-3).** In cells with a shape-edited block, **and** in cells whose air blocks have a shape-edited solid within 2 blocks above or 1 block beside:
   - cap intrusion toward the air-majority side at 0.15 horizontally and 0.05 vertically;
   - clamp the `d₀` of vertices outside R to the same cap.

   Openings then keep (W − 0.3) × (H − 0.1). Extrapolated from the measured isotropic rule; M3 measures it.
3. **Sharp pinning, per axis.** For each incident (sharp solid, air) pair, pin that pair's axis to 0.
   - Sharp faces stay exactly on their planes: 62,600 of 62,600 vertices measured.
   - Smooth ground meets a sharp wall at its own height.

### 7.5 Apron, seams, dirty sets

- **Apron:** `A = k + 4 = 10` (relaxation, normals, guard, and the clearance zone's reach), always derived from k in code.
  - When the main thread's EditLog shows no shape-edited block within reach of the chunk, nothing relaxes or clamps, and `A = 3` suffices: a 38³ region.
  - Otherwise the region is 52³.
  - M3's partition-invariance test must prove this.
- **Seam guarantee:** a shared vertex is computed in both chunks from identical inputs (blocks and hints) by identical operations, then quantised. An apron one or two short measurably breaks normals (27 of 821).
- **Dirty set:** an edit at `b` dirties every chunk whose corner range meets `[b − k − 3, b + k + 4]` on every axis. That is at most 8 chunks, and about 4.3 on average (estimate).

### 7.6 Measured shapes and cost

Measured at **isotropic hE = 0.2** (cube = 1.00):

| | bump | dent | floating block (volume) | pillar | 1:4 slope error | sphere r=7 error |
|---|---|---|---|---|---|---|
| Naive surface nets (NoCubes) | 0.67 | 0.67 | 0.04 | 0.50 | 16.6° rms | 12.7° |
| Relaxation without the guard, k = 4 | 0.55 | 0.55 | 0.007 | 0.32 | 12.0° | 10.0° |
| This design, binary input | 0.75 | 0.80 | 0.22 | 0.40 | 7.8° | 6.3° |
| This design, with hints | +0.45 on generated ground | −1.10 | 0.22 | 0.40 | 0.0° | 4.9° |

- **Expected under D-3's 0.15/0.05** (re-run of the prototype): dents about 0.95 on binary ground and 1.25 on hinted ground; edited 1-block steps at 41–51°.
- **Cost per 32³ chunk** (single thread, k = 6, a 50³ region, prototype): 3.9 ms for hills and 10.2 ms for caves. These are upper bounds, since hinted cells skip relaxation. The production mesher at 38³/52³, with generation, is measured in M3.

### 7.7 Rejected alternatives

| Alternative | Reason |
|---|---|
| Marching cubes / Transvoxel | 1-block features vanish; about 4× the vertices; quads stop mapping to block pairs. |
| Dual contouring | Binary data has no real normals, and the QEF keeps sharp features. |
| Blur, then isosurface | An isolated block's density is 1/27, so the block disappears. |
| Taubin | Barely smooths. |
| Density edits (Astroneer style) | Edits stop being block-sized. |
| GPU meshing | Not testable in Node, needs readback, not deterministic. |

### 7.8 Look sign-off (M3)

A static gallery page with sliders for k, G, the clearance caps and hints on/off renders these scenes:
- bump, dent, floating block, pillar, wall;
- 1×2 and 2×3 dug tunnels;
- a 2-high room on generated ground;
- stairs;
- generated slopes from 1:2 to 1:16, **next to hand-built 1:4 and 1:8 ramps**;
- a block dug out of a slope;
- a sphere;
- a sharp wall on a slope.

You approve the constants there. The invariants in §14 pin down the mechanics; they cannot judge taste.

---

## 8. Rendering approach

### 8.1 Raw WebGPU

**Measured** median JS time per frame (headless Chromium, SwiftShader, on the target CPU class):

| | 500 meshes | 2,000 meshes | Bundle (gzip) |
|---|---|---|---|
| Raw WebGPU, pooled buffers, `firstInstance` slots | 0.4 ms | 1.0 ms | ~10 KB (wgpu-matrix) |
| three r185 `WebGPURenderer` | 2.4–3.8 ms | 8.6–11.9 ms | ~210 KB |
| Babylon 9.27 | 6.3–6.6 ms | 22.8–23.5 ms | ~317 KB |

- **Absolute numbers:** pessimistic, since SwiftShader shares the CPU. The ratios are the finding.
- **Fallback:** three falls back to WebGL2 automatically, which would suppress the "WebGPU unavailable" message.
- **Hidden fetches:** Babylon fetches from its CDN by default.
- **Scope:** four pipelines (terrain, sky, selection lines, avatars). Estimated 2,000 lines of TS plus 400 of WGSL.
- **Plan B:** three r186 with a pre-created device and a single `BatchedMesh`. The core does not depend on the renderer.

### 8.2 Boot and failure messages (never a blank page)

- **`index.html`** shows "Loading Amorfus…" and a `<noscript>` by default.
- **Classic `public/boot.js`** (no imports) checks, in order:
  1. `file:` → **F**
  2. `!isSecureContext` → **S**
  3. no `navigator.gpu` → **U**
  4. otherwise starts a 20 s load timer → **L**
- **The module `gpu-init`** returns a typed result. Mapping a result to a message is a pure, unit-tested function.
  - `requestAdapter()` resolves null → **A**.
  - `isFallbackAdapter` → a warning banner **W**.
  - `requestDevice` rejects → one retry with a **fresh `requestAdapter()`** (adapters are single-use) → **D**.
  - All pipelines, including the variants for every tier, are created with `createRenderPipelineAsync` before the first frame.
- **Runtime `device.lost`** (reason not `destroyed`) → overlay **R**.
  - It first flushes pending writes, then says "The GPU was reset. Your world is saved." with Reload.
  - On `no-storage` origins it says "Export before reloading, or this world is lost" and offers Export, which needs no GPU.
  - Automatic re-initialisation is post-MVP.
- **Message content:** the cause; how to serve the folder; https or localhost; the supported platforms, with a link to the WebGPU Implementation-Status page (a `link`-kind host in `third-party.json`); `chrome://gpu` as copyable text.
- **Accessibility:** focus lands on the heading, and axe runs in Playwright. `<meta name="referrer" content="no-referrer">`.

### 8.3 Frame

- **Passes:** one render pass — terrain (smooth and sharp in one pipeline), then sky (fullscreen triangle), selection outline and ghost cube, instanced avatars.
- **Depth:** `depth32float`, reversed Z.
- **HUD, hotbar, menus and name labels** are DOM.
- **Vertex:** 16 B, as specified in Appendix A.1. Vertices split per material, so the material id needs no interpolation. Indices are `uint32`.
- **Exact positions:**
  - The shader rebuilds the camera-relative position **in integers**: `p = (origin − cameraBlock)·256 + pos.xyz − 128` (i32), then `rel = vec3f(p)/256`. This is exact while |p| < 2²⁴, which covers ±65,536 blocks.
  - The camera's sub-block fraction lives in the view matrix, so no float operation ever mixes a chunk input with the fraction. WGSL may reassociate float chains; that is why this is done in integers.
  - Chunk origins come from a storage buffer indexed by `instance_index`. Each chunk is one direct `drawIndexed(…, firstInstance = slot)`, which is core WebGPU.
  - `@invariant` is kept for cross-pipeline consistency only.
- **Textures (D-21):**
  - A `texture_2d_array` of 8 layers at 256², format `rgba8unorm` with `viewFormats: ['rgba8unorm-srgb']`, usage `STORAGE_BINDING | TEXTURE_BINDING`.
  - Compute passes write sRGB-encoded texels, and build each mip by decoding to linear, averaging and re-encoding.
  - The terrain samples through an explicit sRGB view (`usage: TEXTURE_BINDING`), so filtering happens in linear space.
  - Sampling is triplanar with `pow(|n|, 4)` weights. Gradients are computed in uniform control flow, and planes under 3% are skipped using `textureSampleGrad`.
- **Lighting:** Lambert sun plus hemispheric ambient, both scaled by AO, then exp² fog to the horizon colour at `R − 16`. No shadows in the MVP.
- **Colour:** the canvas is configured non-sRGB with an sRGB `viewFormat`. MSAA is 1× or 4× (the spec allows nothing else).
- **Buffers:**
  - 64 MiB vertex and index pool pages with a TLSF-style offset allocator; never a buffer per chunk.
  - Uploads use `queue.writeBuffer`. Its ordering on the queue timeline lets a freed range be reused with no fences.
  - Streaming uploads are capped at ≤ 2 MB and ≤ 1.5 ms per frame (the upload cap). Edit transactions bypass it.
- **Culling:** CPU frustum culling, sorted front to back. No render bundles, no indirect draws.
- **Profiling:** `timestamp-query` when present (Chrome quantises it to 100 µs). A debug HUD shows CPU and GPU ms, chunk and triangle counts, uploads and pool occupancy.

### 8.4 Tiers and budgets

**Internal resolution is always capped (D-26).** Rendering at the full `devicePixelRatio` would push 5 MP on a 2.8K laptop panel.

| Tier | Pixel cap | MSAA | View radius | Anisotropy |
|---|---|---|---|---|
| Low (floor preset) | 1.2 MP | off | 128 | 1 |
| **Medium (default)** | 2.1 MP | 4× | **160 or 192, chosen at M2** (160 if the D-1 fallback device applies) | 4 |
| High | 3.7 MP | 4× | 256 | 8 |

- **Tier changes are manual in the MVP.** If main-thread p95 exceeds 8 ms, or GPU p95 exceeds 12 ms, over 3 s, a banner suggests a lower tier.
  - Automatic downgrade is post-MVP, because it could hide an acceptance failure.
- **Frame cap:** auto, half refresh, or uncapped.
- **Budgets:** main-thread CPU p95 ≤ 8 ms and GPU ≤ 12 ms at Medium.
  - The world model projects about 0.5 M visible triangles and about 135 draws at R = 192.
  - The rendering estimate was 3–4× lower, so the GPU budget at R = 192 is unproven until M2.

---

## 9. Streaming, player, editing

### 9.1 Worker pool and jobs

- **Pool:** `clamp(hardwareConcurrency − 2, 2, 6)` module workers.
  - The only carried-over measurement is the pool scaling of a simpler core mesher on this 2P+8E CPU: 6 workers reached 2,937 chunks/s and 10 workers 2,586/s.
  - The iGPU shares package power with the CPU.
- **In-flight cap during play:** ≤ `min(2, pool − 1)` streaming jobs, with at least one worker always free for edits.
- **`GEN_MESH {coord, seed, generatorVersion, edits in region, version}`:** the worker generates the 38³ or 52³ region itself (§7.5), applies the edits and meshes it.
  - It returns: block data, the core hint plane (if any hint is unsaturated), the render mesh and the collision/pick buffers, all transferred.
- **`REMESH {coord, padded blocks, padded hints, version}`:** the main thread assembles the 52³ region from loaded blocks and hint states. A `saturated` neighbour supplies ±127 from its blocks. If any neighbour, or its hint state, is missing, fall back to GEN_MESH.
- **Stale results:** a stale version is dropped; edits that arrived mid-flight are patched in and requeued.
- **Priorities:**
  - P0: local edits
  - P1: remote edits
  - P2: the 3×3×3 physics region
  - P3: in-frustum chunks by distance
  - P4: the rest
- **Unloading:** beyond R + 32.
- **Estimated for this pipeline** (§7.6 costs, 38³ generation ≈ 2.9 ms):
  - initial fill at R = 192: about 3–5 s of worker time, about 0.5–0.9 s wall on 6 workers;
  - sprint-flying: about 15–30% of one core.

  M3 and M4 measure these on the D-1 device, E-cores included.

### 9.2 Controls

| Input | Action |
|---|---|
| Click-to-play overlay | Pointer lock (`unadjustedMovement`, plain lock on `NotSupportedError`). Chrome 131+ asks permission the first time; the overlay says so. Esc pauses. |
| Mouse | Left removes, right places, middle picks the material. |
| 1–8 / wheel | Hotbar material. |
| Q | Sharp placement mode (hotbar and ghost show it). |
| R | Toggle `sharp` on the targeted block. |
| Double-tap Space or F | Fly. Space rises, Shift descends. |
| Double-tap W | Sprint; sprint-fly when flying. Ctrl is never bound, because Ctrl+W closes the tab. |

All keys use `KeyboardEvent.code`, so WASD is independent of keyboard layout.

### 9.3 Collision and picking

- **What you see is what you hit.**
  - Collision and picking use each chunk's CPU copy of positions, indices and pick records, swapped atomically with its GPU mesh.
  - Re-extracting from voxels instead would need a kernel of ±2 blocks, and relaxation is wider than that.
- **Player shape:** a capsule of radius 0.3 and height 1.8, eye at 1.62. On a 45° slope an AABB floats 0.30 above the surface; a capsule floats 0.12.
- **Controller:** collide-and-slide in substeps of ≤ 0.1 block (dt clamped to 50 ms), with up to 4 contact iterations.
  - Slope limit and step-up are **provisionally** 50° and 0.6, re-derived from the M3 shapes.
  - A 1-block auto-step is rejected: it would defeat sharp walls.
  - Chunks that aren't ready count as solid.
  - Depenetration is bounded.
- **Constants** (provisional, Minecraft-derived):

  | Walk | Sprint | Fly | Sprint-fly | Gravity | Terminal velocity | Jump v₀ | Reach |
  |---|---|---|---|---|---|---|---|
  | 4.3 b/s | 5.6 b/s | 11 b/s | 22 b/s | 32 b/s² | 50 b/s | 9 b/s (apex ≈ 1.27) | 5 blocks |

- **Picking:**
  - An Amanatides–Woo DDA walks the ray.
  - At each block, test the quads whose **lower block** is within Chebyshev distance 1, taken from whichever chunk holds that lower block. That is sufficient, because every vertex stays inside its cell.
  - Möller–Trumbore on both triangles; the nearest hit wins.
  - Targets: remove = the quad's solid block; place = its air block.
  - A wireframe marks the target and a ghost cube the placement cell.
- **Two guards cover the swap window:**
  - a pick is applied only if the voxel store still agrees (the solid is still solid, the air still air);
  - an edit equal to the current `W` is not written.
- **Placement** that would intersect any player's box is refused.

### 9.4 Edit transactions

1. The edit is written to the EditLog and the voxels synchronously.
2. The dirty set is computed.
3. The padded copies are dispatched as one transaction: P0 for a local edit, P1 for a remote one.
4. **Every chunk in the transaction swaps its render and collision buffers in the same frame, bypassing the upload cap.** A split-swap counter must read 0 during the acceptance runs.

- **Timing:** measured from the input event, or from message receipt for remote edits, to the frame that swaps. Target ≤ 33 ms at p95 and ≤ 50 ms at p99 (C-12).
- **No backlog:** 10 edits/s sustained must not build a backlog.

---

## 10. P2P stack and signaling

### 10.1 Stack

- **Trystero `@trystero-p2p/nostr` 0.25.4**, pinned exactly (0.25.5 once #195's rejoin fix ships).
  - MIT, 22.6 KB gzipped. SDP is AES-GCM encrypted end to end. A single, active maintainer.
  - Wrapped behind our own `Transport`; only `src/net/trystero-transport.ts` imports it.
  - **Patched with patch-package:** Trystero reassembles action payloads with no size limit and keeps payloads of unregistered types forever. The patch drops unregistered types and caps pending reassembly at about 64 KiB per peer.
- **Measured on one machine only** (signaling, not NAT traversal): 21 of 22 two-context joins, 0.77–1.1 s with the chosen relays; 8 of 8 four-context meshes in 3.8–6.4 s. The one failure was an ICE failure after the SDP exchange.
  - Open issues: #196 (slower joins), #161 (partial meshes).
  - Cross-network success is unmeasured; the M0 spike measures it.
- **Relays:** six curated Nostr relays, used all at once: relay.damus.io, relay.primal.net, nos.lol, offchain.pub, nostr.bitcoiner.social, yabu.me/v2.
  - The library's default pick for our appId had 3 of 5 working. Only 17 of its 28 defaults passed an ephemeral round-trip.
  - The list lives in `third-party.json`, which drives the runtime, the privacy sheet and a unit test.
- **STUN:** exactly `stun.cloudflare.com:3478` and `stun.l.google.com:19302` (D-25).
- **Relay hints:** relays added in Settings, or carried by a link (`&r=`), are appended to the list. The joiner is shown link-supplied relays and asked before connecting.
- **Rejected:**

  | Option | Why |
  |---|---|
  | PeerJS | Plaintext SDP through one cloud server; its TURN hosts are gone. |
  | js-libp2p / Helia | 312 KB gzipped; needs relay infrastructure; its main steward exits on 2026-09-30. |
  | simple-peer | Unmaintained. |
  | MQTT | Public test brokers. |
  | Firebase / Supabase | API keys. |
  | Trystero's IPFS strategy (Waku) | "Rarely works" (its author). |
  | Trystero's BitTorrent-tracker strategy | Deferred: its author discourages it, and only 3 of 5 trackers were reachable. |

### 10.2 Join secret, link, code

- **Secret:** 100 bits from `crypto.getRandomValues`, written as 20 Crockford characters plus a mod-32 check character drawn from the same base32 alphabet. It is Trystero's `roomId`; the code is the same string (D-8).
- **Link:** `location.href.split('#')[0] + '#join=' + secret`, optionally with `&r=<relay hosts>`.
  - Built from `location`, so an IPFS link pins the inviter's gateway and CID.
  - The fragment never reaches a server.
  - Parsed on `hashchange`; no History API.
- **Storage and use (D-11, D-12):** a world stores its secret only where D-12 allows. It is used only after an explicit Host or Join. Fork, Save as copy and share imports never copy it.
- **Rekey:** "New invite link" sends `REKEY {newSecret}` directly (never forwarded) to the peers you tick. Each of them replaces and retires the old secret, then leaves the old room.

### 10.3 Session

- **Handshake:** inside Trystero's `onPeerHandshake`, with a 10 s timeout.
  - **HELLO carries:** `protocolVersion`, `hasWorld`, and when it has one, `worldId`, `seed`, `generatorVersion` and `genCanary`. Also the session peer id, wall-clock time, HLC, and name and colour.
  - **A peer without a world** skips the world checks. It binds to the first HELLO that carries a world: it opens that world if it exists locally (taking the Web Lock) and adopts the link's secret, or creates it. Every later HELLO must match.
  - **Refusals, each with a specific message:** protocol mismatch; generator or canary mismatch; a different world in this room; clock skew over 30 s; room full. The refusing peer sends `REFUSE {reason}` before closing; the refused joiner shows the reason and calls `room.leave()`.
  - **Admission is deterministic:** members gossip their member sets. Beyond 8, every peer refuses the latest arrivals by (first-seen HELLO time, session id), and nobody forwards for a refused session.
- **Channels:**
  - Trystero actions carry control messages (Appendix A.3).
  - Two **negotiated** channels are added per `RTCPeerConnection`: `bulk` (id 43, reliable) and `pos` (id 42, `ordered: false, maxRetransmits: 0`).
    - Verified: 30 of 30 position messages arrived alongside the actions.
    - Trystero shares one connection per remote peer across rooms and keeps it for about 123 s after leaving. So the channels are created once per connection (a WeakMap), reused, and every frame carries a 4-byte room epoch. We never join two rooms at once.
  - Every message is ≤ 16 KiB.
- **Topology:** a full mesh, capped at 8.
- **Peer relay:** each peer gossips its neighbour set when it changes and every 5 s.
  - **Ops:** forward-on-change applies **only to live EDITS whose origin session is announced in a current HELLO**, and to local edits. They are forwarded to neighbours not connected to that origin.
  - Entries from `CHUNK_ENTRIES` or imports are never forwarded; pairwise anti-entropy spreads them.
  - **Positions** for a missing link X–Y go through the peer with the smallest session id among those connected to both.

### 10.4 NAT policy, failure messages, privacy

- **TURN:** none bundled. Settings → Network takes a TURN URL, username and credential, persisted per D-12.
  - Each join pre-warms 20 peer connections, so a user's TURN server sees about 20 Allocates per join. Rejoin retries are throttled.
- **Status messages:**
  - "n/6 signaling relays reachable"; inviting is disabled at 0.
  - ICE failure: "Direct connection blocked by one of your networks. If another player is connected to both of you, play continues through them; otherwise try another network or add a TURN server."
  - CSP violation: "network blocked by this host".
- **Privacy:**
  - No third-party host is contacted in single-player; e2e asserts this.
  - A disclosure sheet generated from `third-party.json` appears before the first Host or Join.
  - What each party sees is listed in §17; the sheet renders that column.
  - No analytics.

---

## 11. Sync and conflict model

### 11.1 What is replicated

| Class | Contents | Rule |
|---|---|---|
| Converged, persisted | `edits: cell → Entry`; header `{worldId (16 random bytes), seed (u32×2), generatorVersion}` | LWW semilattice |
| Ephemeral, owned by one player | pose, name (≤ 32 bytes, rendered as text), colour, held material | latest value from its owner; loss is fine |
| Derived per machine | meshes, normals, lighting, collision | local only |

- **"Same world" means identical block state**, shown as an equal root digest. The mesher version is not part of world identity.
- **Positions never enter the CRDT.** They are ephemeral and owned by one player: a lost update is superseded by the next one, so nothing needs merging and no authority is needed.

### 11.2 Entry, order, clock

- **Entry:** `{value: u16, l: u48 (HLC ms), c: u16, peer: u64}`.
  - `peer` is 64 random bits drawn fresh each session and never persisted as an identity. That means no tracking, and two tabs never share an id.
- **Order:** `(l, c, peer, value)`. The value tiebreak is required: fast-check found a divergence without it whenever a tag is duplicated.
- **Clock:** a hybrid logical clock (Kulkarni et al. 2014).
  - Under pure Lamport, the busiest offline peer wins, and a peer claiming about 2⁵³ wins forever.
  - Opening a world sets `l ≥` the largest stored `l`.
- **Guarantees:**
  - causality: an edit made after seeing another always wins;
  - concurrent edits: the later wall-clock edit wins, to within clock skew;
  - offline edits keep their real time.
- **Clock-ahead repair:** if a world's stored `l` exceeds `now + 60 s` (a fast clock during offline play), the app warns, **replaces** those local entries with fresh local stamps (same values, same relative order) and re-seeds the HLC.
  - This is convergence-safe because no honest peer can have accepted the replaced entries: every peer defers stamps beyond `now + 60 s`, and the skew check refuses a fast-clocked peer. The restamps are ordinary new ops with the same values.

### 11.3 Validation (depends only on the op's bytes)

- **Structural check:** bounds, a canonical value, `l < 2⁴⁷`, `peer ≠ 0`. Failure is invalid and closes the connection.
- **Future stamps:** `l > now + 60 s` → **deferred**, never rejected.
  - Deferred ops live in one replica-wide map keyed by `(cell, tag)`, capped at 4,096.
  - On overflow, the largest `l` is evicted. Those ops were never accepted, and anti-entropy offers them again.
- **Handshake skew:** above 2 s warns, above 30 s refuses (D-13).
- **Caps** close the connection; they never silently drop a valid op:
  - ≤ 16 KiB per message;
  - a total decoder;
  - live EDITS limited to 50/s with bursts of 500 **per (connection, origin session)**;
  - bulk transfers ≤ 4e6 entries or 64 MB (D-23).
- **A peer cannot:** crash others; exhaust their memory (given the Trystero patch); make honest peers diverge (given SHA-256 digests, §11.4); push clocks more than 60 s ahead; inject markup.
- **A peer can:** overwrite any cell up to the rate limit, lie about its own position, and withhold data.
- **Eviction** follows D-9. Signed ops are post-MVP.

### 11.4 Store, digests, anti-entropy

- **Store:** entries are loaded in full when a world opens. 1e5 edits encode to about 2 MB at 20 B per live cell; in-memory size is unmeasured (the sync research estimated over 100 MB per 1e6 edits), and M1 measures it. Lazy loading is post-MVP.
- **Digests:**
  - `chunkDigest` = SHA-256 of the chunk's canonical chunk-entries blob (Appendix A.2), recomputed lazily for dirty chunks;
  - `root` = SHA-256 over the sorted `(chunkKey ‖ chunkDigest)` list, sent truncated to 16 bytes.
  - XOR-of-hashes digests were rejected: they are linear, so a malicious member can construct two states with equal digests and leave honest peers silently diverged.
- **Reconciliation:**
  1. Exchange ROOTs.
  2. If they differ, stream CHUNK_DIGESTS nearest-first.
  3. Send WANT for mismatches; both sides push CHUNK_ENTRIES on `bulk`.
- **When it stops:** a round that applies nothing on either side ends the loop. The next round runs at `max(15 s, earliest deferred maturity)`.
- **Main-thread budget:** applying CHUNK_ENTRIES is time-sliced to ≤ 2 ms per frame.
- **Estimated cost** (synthetic data): a full join of 1e5 clustered edits is about 0.9 MB.
- **Why custom** (measured, 1e6 ops):

  | Store | Apply time | Other |
  |---|---|---|
  | Custom LWW map | 2.1 s | 20 B per live cell, encoded |
  | Yjs | 6.5 s | 212 B per live cell, encoded (keeps history) |
  | Loro | 9.4 s | 228 B per live cell, encoded; 1.07 MB of WASM |
  | Automerge | 72 s, 1 GB heap | 1.14 MB of WASM |

  None of them orders by physical time.

### 11.5 Convergence argument and preconditions

**Claim:** a replica's state is a function of the *set* of ops it has applied. Replicas that share `(worldId, seed, generatorVersion)` and the same set agree on `W`. This is strong eventual consistency (Shapiro et al. 2011).

**Preconditions,** each tested:

| | Precondition |
|---|---|
| P1 | Eventual delivery over a connected graph: pairwise anti-entropy on connect and on its schedule, plus live forwarding. |
| P2 | Acceptance depends only on the op's bytes. Time only defers. |
| P3 | The same comparator everywhere; canonical values. |
| P4 | Bit-identical generators, kept forever. |
| P5 | The material registry is fixed per protocol version. |
| P6 | No accepted entry is ever deleted. The one exception is the clock-ahead repair (§11.2), which replaces local entries that no honest peer can have accepted. |
| P7 | Exact save/load and import round-trips; one writer per world (Web Locks). |

**Non-goal:** block simulation (sand, water) needs a total order over inputs, which per-cell LWW does not provide. Any such feature must propose an ordering model first.

### 11.6 Positions

- **POS message:** 31 B — seq, send time, `i32` position in 1/256 of a block, velocity, yaw, pitch, flags, held material.
- **Rate:** 20 Hz while moving, 4 Hz idle. Sent on a timer, never on requestAnimationFrame, which stops in hidden tabs.
- **Remote players** are drawn with Hermite interpolation 150 ms behind (adaptive 100–200 ms), with ≤ 250 ms of extrapolation. They are not solid.
- **Bandwidth:** under 100 kbps each way per player with 4 players (estimate).

---

## 12. Persistence format

### 12.1 Engine and schema

- **IndexedDB** via `idb` 8.0.3 (ISC, about 1.2 kB).
  - Not OPFS: it has the same origin model, and no transactions.
  - Not localStorage or Cache Storage: the Service Worker Gateway deletes caches it does not own.
- **Database `amorfus`, v1:**

  | Store | Key | Value |
  |---|---|---|
  | `worlds` | `worldId` | `{lineageId, name, seed, seedText?, generator:{id, version}, chunkSize: 32, materials[], hlc, roomSecret? (per D-12), status: 'ready' \| 'importing'}` |
  | `chunks` | `[worldId, cx, cy, cz]` | chunk-entries blob (Appendix A.2), self-contained |
  | `players` | `[worldId, 'local']` | position, look, fly flag, held material |
  | `kv` | string | settings (TURN per D-12) |

- **Writes:**
  - from the main thread, debounced to 1.5 s idle and at most 5 s;
  - also on `visibilitychange → hidden` and on `pagehide`;
  - relaxed durability, except strict for imports and deletes.
- **One Web Lock per world:** a second tab gets "open in another tab", with take-over.
- **Version changes:** `versionchange` → close and ask to reload. `VersionError` → "saved by a newer Amorfus".
- **Migrations:** stepwise, with lazy per-blob codec migration.
- **World list** (M6): create from a seed, open, rename, delete, Save as copy.

### 12.2 Quota

- **Quota:** Chrome allows up to 60% of the disk per origin, with least-recently-used eviction.
- **Persistence:** `persist()` is granted or denied silently. Call it after the first save and show the result: "Protected from automatic cleanup", or "may be cleared if disk space runs low — Export to keep a copy".

### 12.3 One codec on disk, in files, on the wire

- **One codec, three uses:** Appendix A.2 defines the chunk-entries codec. Each blob carries its own sorted peer table, so it is canonical (identical states give identical bytes) and self-contained. It is the IndexedDB value, the file's `CHNK` payload and, split into ≤ 16 KiB parts, the `CHUNK_ENTRIES` wire format.
- **Size:** unmeasured for this codec.
  - Research codecs measured 29 KiB (gzip) per 1e5 clustered edits for a Lamport-ordered columnar layout on flattering synthetic data, and about 9 B per edit raw for a row layout like this one.
  - M1 measures this codec, and considers a columnar layout.

### 12.4 Origin classification (ordered; first match wins)

| # | Rule | Kind | Survives a new release | Behaviour |
|---|---|---|---|---|
| 1 | opaque origin, or `indexedDB.open` throws | `no-storage` | — | session-only, with a persistent Export prompt |
| 2 | path starts with `/ipfs/` or `/ipns/` | `shared-gateway` | yes | warning banner; every read goes through the structural check of §11.3 (future stamps get the clock-ahead repair, not deferral); secrets per D-12 |
| 3 | `/^b[a-z2-7]{50,}\.ipfs\./` | `release-pinned` | **no** | banner "saves stay with this version"; the handoff sender (§12.5); secrets per D-12 |
| 4 | `/^[a-z0-9-]+\.ipns\./` | `stable` (gateway-hosted) | yes | normal; secrets per D-12 |
| 5 | exactly `amorf.us`, `localhost`, `127.0.0.1`, `[::1]` | `stable` | yes | normal |
| 6 | anything else | `stable` (self-hosted) | yes | normal |

Every row is unit-tested, including `localhost:PORT/ipfs/<cid>/` → `shared-gateway`.

### 12.5 Stable origins and the handoff

- **Stable origins:** amorf.us is primary. Each release updates `_dnslink.amorf.us`, which gives IPFS users `amorf-us.ipns.inbrowser.link`. Each origin is a separate save set.
- **The handoff sender (MVP):**
  - It is opened as a popup by a newer build: `#amorfus-handoff=<nonce>&to=<origin>`.
  - It parses `to` with `new URL()`. It requires https, or http on a loopback host (`localhost`, `*.localhost`, `127.0.0.1`), which browsers treat as secure contexts.
  - The origin must match an allowlist **exactly**: `amorf.us`, `amorf-us.ipns.<own gateway suffix>`, `<cidv1>.ipfs.<own gateway suffix>`, or the local form `<cidv1>.ipfs.localhost:<port>`. Never `*`.
  - It shows the full origin, asks for confirmation, and posts the export files to `window.opener` with that exact `targetOrigin`. Each world's room secret goes along only where D-12 let it persist.
  - A popup is used because it is top-level. An iframe would see partitioned, empty storage.
- **The receiver** (with the second release, D-18) checks `event.origin`, `event.source` and the nonce. It imports with **Restore**, or with **Merge** when that worldId already exists locally. It lists earlier CIDs from a `releases.json` embedded at build time.

### 12.6 Export file `.amorfus`

- **Layout:** Appendix A.4 — a 16-byte uncompressed preamble, then one gzip member of tagged sections: `META`, `CHNK`, `plyr`, `END `.
- **Profiles:**
  - **Backup** (profile 0): real stamps, player state, worldId.
  - **Share** (profile 1): **no worldId**, no player data, and stamps rebased to an order-preserving counter, so the file reveals no play times (C-15). Share files can only be forked. Seed + generator + `CHNK` is the whole of "seed plus edits"; no geometry is stored.
- **Saving:** `showSaveFilePicker` where available, otherwise Blob plus `<a download>`.
- **Import:**
  1. Check the magic bytes and major version.
  2. Decompress in a stream capped at 256 MiB and 64× the compressed size.
  3. Validate with the same pure validator as sync (§11.3).
  4. Write in stages under an `importing` status flag; leftovers are cleaned up at startup.
- **Import modes:**
  - **Fork** (default): new worldId, lineage kept. Future stamps are rebased.
  - **Restore:** only when the worldId does not exist locally. Keeps worldId and stamps. For entries with `l ≤ now + 60 s` it equals a sync join into an empty replica; later entries get the clock-ahead repair (§11.2).
  - **Merge:** only for backup files whose worldId, seed and generator match. It is exactly the sync join, and a test asserts the equivalence. A file with any stamp beyond `now + 60 s` is refused for Merge, with an offer to Fork or Restore it instead, so no imported entry ever waits in the in-memory deferral map.
- **URL-fragment sharing:** post-MVP. About 5k clustered edits fit in a 2,000-character chat link at rebased stamps.

---

## 13. Build tooling, deploy, publish

### 13.1 Toolchain

- **Tools:** Vite 8.3 (Rolldown inside), TypeScript ~6.0.3, ESLint 10 with typescript-eslint 8.70, vitest 4.1, fast-check 4.10, Playwright 1.63.0, `webgpu` (Dawn for Node) 0.6.1, ipfs-car 3.1.0, wrangler 4.137, and kubo 0.43.1 via `npx` in release scripts only. Pins and reasons: Appendix A.5.
- **Why TypeScript 6:** TypeScript 7 is out, but typescript-eslint 8.70 requires `typescript < 6.1`, and the determinism lint depends on typescript-eslint.
- **`npm install && npm run build` stays light:** Playwright browsers and kubo install separately.

### 13.2 `vite.config.ts` essentials (each verified)

- `base: './'`: every emitted URL is relative — HTML, modulepreload links, the preload helper, CSS `url()`, dynamic chunks, module workers and their nested imports.
- `worker.format: 'es'`: **required**, because the default `'iife'` silently inlined worker dynamic imports.
- `build.target: 'esnext'`, `sourcemap: false`.
- `build.license: { fileName: '.license-npm.json' }` writes npm-module licences as JSON. A post-build `scripts/licenses.mjs` merges those with worker-only dependencies and the vendored `LICENSE` files into `THIRD-PARTY-LICENSES.txt`, then deletes the JSON before `audit-dist` runs. The audit checks the text file against an expected package list.

### 13.3 Source rules (lint, audit, e2e)

- **Assets:** only through the module graph (`?url`, `?raw`, or `new URL('./x', import.meta.url)` written literally). Never a leading `/`, never `BASE_URL`, never string surgery on `location.pathname`.
  - Vite leaves hand-written literals alone: a planted `fetch('/x')` survived into `dist`.
- **Workers:** `new Worker(new URL('./….worker.ts', import.meta.url), {type: 'module'})`.
- **`public/`:** holds only `boot.js` and `_headers`.
- **Forbidden:**
  - a service worker (the Service Worker Gateway owns `/`);
  - the History API;
  - `ipfs-sw-*` file names;
  - `_redirects`;
  - dotfiles;
  - any `.md` in `dist` (for example a stray `CLAUDE.md`);
  - Cache Storage and localStorage for world data.
- **No WASM on the critical path:** a gateway CSP blocked `WebAssembly.compile` (verified).

### 13.4 amorf.us

- **`wrangler.jsonc`** (Appendix A.6): assets-only, no `main`. `not_found_handling: "none"`, `observability.enabled: false` (D-16), apex via `routes` with `custom_domain: true`.
- **`public/_headers`:**
  - `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`;
  - everything: the literal CSP from D-14, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`;
  - no COOP/COEP.
- **Checks:**
  - an e2e mount serves `dist` with `dist/_headers` applied, so the production CSP is exercised before deploy;
  - a unit test asserts that `wrangler.jsonc` has no `main` and no `run_worker_first`;
  - `verify-live` compares the served HTML's sha256 with `dist/index.html`, which catches any injected analytics.
- **Deploy:** local, `npm run deploy` = `check && probe:relays && wrangler deploy`, with a scoped API token. The first run waits for your go-ahead.

### 13.5 IPFS publishing

- **CID:** `ipfs-car pack dist`. It is byte-identical to kubo's `unixfs-v1-2025` profile, whereas `ipfs add -r --cid-version=1` with kubo's defaults diverged once a file exceeded 256 KiB.
- **`check:release`:**
  1. `npm run check`.
  2. In a temporary kubo repo with that profile, `ipfs add -r -Q --only-hash dist` must equal `ipfs-car roots`. This is an independent re-chunking.
  3. `dag import`, then the e2e spec against the kubo path and subdomain gateways.
  4. `swg-smoke`: the pinned Service Worker Gateway 3.4.15, built once and cached, served from that kubo, with the spec re-run.
- **`publish:ipfs`:**
  1. `check:release && probe:relays`.
  2. Upload the CAR to Filebase with `--metadata import=car`; the key comes from your environment.
  3. Verify the CID. Which response header carries it is confirmed in the M0 spike.
  4. Update DNSLink.
  5. Record the CID and git tag in `RELEASES.md`.

  First run: your go-ahead.
- **`verify-live`:** a delegated routing endpoint lists a provider, and a trustless gateway returns the root block. Then a manual look at inbrowser.link.
  - The endpoint is `delegated-ipfs.dev`, or its successor recorded in `third-party.json`, since Shipyard stops operating it on 2026-09-30.
  - Fallback: `ipfs routing findprovs` from the release kubo.
- **Rejected pinning services:** Pinata (CAR upload is paid) and Storacha (appears wound down, according to secondary sources).

### 13.6 Loader contract (D-15)

The loader must:
- serve the UnixFS directory at a URL whose directory is `index.html`'s base;
- use JS MIME types by extension (verified-fetch does; unknown extensions become octet-stream, hence the extension allowlist);
- not require the app to register a service worker.

Verified: the build loads through the Service Worker Gateway 3.4.15 built locally against kubo, including module workers and nested imports. Loaders that inject the HTML via `srcdoc`, `blob:` or `document.write` are unsupported.

### 13.7 CI and repo hygiene

- **`.github/workflows/check.yml`**, following the bitsy-services/wiki pattern. On push and PR:
  1. `npm ci`
  2. Mesa Vulkan drivers
  3. Playwright's Chromium shell
  4. `npm run check`, or `check:ci` per D-17
- **An `ubuntu-24.04-arm` job** runs the determinism goldens.
- **No secrets in CI.**
- **Repo `CLAUDE.md`:** the gate as the definition of done. It may add a `Stop` hook, as bitsy-services/wiki does. It holds no identity details (D-7).
- **`public-scan`:** part of `npm run check`. It scans tracked text files for absolute home paths and for terms from an optional denylist file kept **outside** the repo (`$AMORFUS_PRIVATE_TERMS`). The denylist never enters the repo; CI runs the built-in patterns only.

---

## 14. Testing and the gate

**What the gate is:**
- `npm run check` = `lint && public-scan && typecheck && test && build && wgsl && e2e`.
- It must pass before any deploy or publish, and it is never weakened to make a build pass.
- `npm run build` = `typecheck && vite build && licenses && audit-dist`, so a plain build can never emit a folder that breaks under a subpath.

**Lint**
- The generator arithmetic allowlist and banned globals (§6.4), with a fixture file that must fail.
- Banned: `history.pushState/replaceState`, `serviceWorker.register`, localStorage/caches for world data, and string URLs starting with `/`.

**World and generator (vitest)**
- Golden SHA-256 hashes for about 32 `(seed, chunk)` cases per generator, including negative and ±2²² coordinates.
- Chunks outside the 3D band are uniform.
- Order independence.
- Apron consistency.
- Hint sign and non-zero property around `d ≈ 0` and `±SCALE`.
- Canonical value codec.

**Mesher (vitest)**
- **Cube reproduction:** with offsets forced to 0 (a test-only switch) and k = 0, or with every block sharp, every vertex sits on its corner and the quads equal the solid/air face pairs.
- **Watertight:** a closed 2-chain.
- **Seam identity,** with negative controls that must fail.
- **Partition invariance:** one 64³ region equals 8 chunks. The 38³ shortcut equals the 52³ result, including next to a material-only edit on hinted ground.
- **REMESH ≡ GEN_MESH** byte for byte, including chunks next to uniform chunks.
- Every vertex inside its box; sharp faces on their planes.
- Thin-feature minimums; clearance-zone openings.
- Picking round trip, including rays across −x, −y and −z chunk borders.
- Finite, non-zero normals.
- Golden hashes of 6 worlds.

**Physics (vitest)**
- Walk up a built smooth 1-block rise.
- Walk out of a one-layer pit dug into hinted ground.
- Blocked by a 2-block rise and by a sharp 1-block wall; a jump clears the wall.
- **Dig a 1×2 tunnel and walk through it.**
- **Walk under a roof placed 2 above untouched ground, at every hint phase.**
- **Walk through a 1-wide gap between a placed wall and a natural one.**
- Sprint-fly into a wall with 100 ms hitches and never end inside solid.
- A fall at terminal velocity lands.
- Collision and picking across chunk borders.

**Sync (vitest + fast-check)**
- Semilattice laws, including duplicate tags.
- **Network simulator** with 2–6 replicas running the real session protocol over `LoopbackTransport`: skewed and backward clocks, drops, duplicates, reordering, partitions. All replicas end with identical bytes and roots.
- Causality.
- HLC monotonic.
- Deferral and eviction.
- Clock-ahead repair: offline edits at +3 h, clock corrected, reconnect, converge.
- `validate(bytes)` is pure.
- Codec round-trips, and fuzzing with no uncaught throws.
- An XOR-collision construction is told apart by the SHA-256 digests.
- Forwarding stays within the rate caps during a 1e5-entry join.
- Import-merge ≡ live sync (backup profile); share files cannot be merged.

**Persistence (vitest + fake-indexeddb)**
- Round-trip with byte-identical re-encoding.
- Golden `.amorfus` fixtures for each format version.
- Truncation and bit-flip fuzzing.
- A decompression bomb; unknown sections.
- Migration, `VersionError`, `versionchange`.
- Staged-import crash cleanup.
- The ordered `classifyOrigin` table.
- Fork, Restore and Merge semantics.

**Render**
- Frustum culling.
- Allocator property tests.
- Upload scheduler: edit groups never split.
- The integer-reconstruction mirror gives identical values for shared vertices at camera positions of ±1e6.
- Capability-to-message table.
- Resize maths.
- **Dawn for Node compiles every WGSL module and creates every pipeline** in both sample counts, plus the texture views and compute pipelines. A fixture with `textureSample` inside a skip branch must fail.
- **Budget proxies** at the benchmark seed and viewpoint, R = 192: triangles, meshed chunks and dense voxel memory stay under thresholds set from M3 data, with the production mesher at the benchmark seed. World research proposed 1.5 M / 400 / 32 MiB.

**Build**
- `audit-dist` fails on:
  - a root-absolute or unresolved URL in HTML, CSS or JS;
  - an external host missing from `third-party.json` (the `link` kind covers click-only help links; loopback literals are allowed only in `boot.js` text);
  - the forbidden files of §13.3;
  - an extension outside the allowlist (`_headers` is exempt by exact name);
  - a file over 25 MiB;
  - a secret pattern;
  - a licence list that doesn't match the expected set.
- The audit has a self-test with planted failures.

**E2E (Playwright, strict gateway-like server, no SPA fallback)**
- **Mounts:**
  - `/`;
  - `/ipfs/<real CID>/`, navigated without the trailing slash;
  - `<cid>.ipfs.localhost`;
  - a CSP-restricted mount;
  - the amorf.us mount with `_headers` applied.
- **Browser projects:**
  - `webgpu`: SwiftShader flags `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-webgpu-adapter=swiftshader`, loading `#test=smoke` (a small seeded world, R = 32, 800×600, MSAA off). It asserts ≥ 60 frames and checks pixels through offscreen render-to-texture readback; it never asserts fps.
  - `no-webgpu`, `no-adapter`, an insecure host, and `file://`: each fallback message shows its reason and passes axe.
  - `core`: `#test=core` boots world, storage and net **without the renderer**. It runs the reload, handoff, networking, zero-third-party-request and CSP-mount tests, so they stay in CI whatever D-17 decides.
- **Everywhere:**
  - no failed requests or console errors;
  - every request stays under the mount's base URL or goes to an allowlisted host;
  - the golden-hash canary computed by the production bundle in Chromium equals the Node value.
- **Networking:** the Trystero adapter against a local Nostr-compatible relay on `ws://127.0.0.1`.
  - `iceServers: []` and `--disable-features=WebRtcHideLocalIpsWithMdns`, so the gate contacts nothing public.
  - 2 and 4 contexts, including one blocked pair to exercise forwarding.
  - Leave and rejoin within 5 s, with no channel errors.
  - A 10 MB flood of non-final chunks leads to a disconnect with bounded heap.
- **Handoff:** two `<cid>.ipfs.localhost` origins with a test receiver fixture. A wrong origin or nonce is rejected.
- **Pointer lock** is granted through CDP `Browser.setPermission`, because Playwright's permission API does not know it.

**Outside the gate** (manual, results committed to `docs/acceptance.md`):
- the scenario A and B runs on the D-1 device, in Chrome and Edge;
- the D-2 network matrix;
- inbrowser.link and ipfs.4everland.io.

`probe:relays` gates deploy and publish, but stays out of `check`, so the gate is offline and deterministic.

---

## 15. Milestones

- **Order:** each milestone retires the riskiest remaining unknown. There are no calendar estimates; they would be guesses.
- **Every milestone** ends with `npm run check` green.
- **Staging:** each §14 item joins the gate in the milestone that builds its subject. In M0 the `webgpu` project draws only the `?raw` test shader.
- **Owner prerequisites** gate the start.
- **External actions** wait for your go-ahead.

**M0 — Skeleton, gate, early spikes**
- *Prerequisites:* D-5, D-6 and D-7 answered; a Filebase key; a scoped Cloudflare token; Actions enabled; two machines on two networks for the network spike.
- *Build:*
  - Vite, TS, ESLint, vitest and Playwright scaffolding;
  - `index.html` with the static message, `boot.js` and the WebGPU probe;
  - one module worker and one `?raw` shader;
  - `audit-dist`, `licenses`, `public-scan`, and `serve-gateway` with all mounts;
  - the release scripts `cid`, `kubo-smoke`, `swg-smoke`, `publish-ipfs`, `verify-live` and `probe-relays`, and the npm scripts `check:release`, `publish:ipfs`, `deploy` and `probe:relays`;
  - the Playwright projects; `third-party.json`; the CI workflow including arm64;
  - `wrangler.jsonc`, LICENSE, README skeleton, repo `CLAUDE.md`, `docs/conflicts.md`;
  - the coarse-pointer notice and `dev:lan`.
- *Spikes:*
  1. **Network:** a `#test=net` page joins through the §10.1 relays and STUN, exchanges messages on the negotiated channels, and reports the selected ICE candidate-pair type. Run on the D-2 must-pass legs over https.
  2. **CI adapter:** do hosted runners get a SwiftShader adapter and Dawn-for-Node on Mesa? (D-17; WSL2 is already verified.)
  3. **Pipeline:** publish the skeleton CAR, which also confirms the Filebase CID header, then load it on kubo path and subdomain and on `swg-smoke`, and deploy to amorf.us with `verify-live`.
- *Exit:*
  - the skeleton loads on every local mount, on `swg-smoke` and on amorf.us, and inbrowser.link's result is recorded;
  - both fallback paths show their messages;
  - two-machine connectivity has been observed on the must-pass networks. If it fails, revisit C-1 and D-2 now, not in M7.

**M1 — Deterministic core** (pure TS)
- *Build:*
  - block codec, bounds and keys; ChunkStore and EditLog;
  - generator v1 with the 3D band, hints, the lint allowlist and goldens (Node and production-bundle Chromium);
  - HLC and the LWW store with SHA-256 digests;
  - the chunk-entries and container codecs, with sizes measured;
  - **the session protocol** (HELLO, anti-entropy, forwarding rules) over `LoopbackTransport`;
  - the convergence simulator.
- *Exit:* each of P1–P6, the codec round-trip part of P7, and every §14 world, sync and codec item except import-merge maps to a named test ID in `docs/acceptance.md`, and all are green. Memory per entry is measured (D-23).

**M2 — Renderer spike on real hardware** (starts once generator v1's goldens are in)
- *Prerequisite:* the D-1 device is named.
- *Build:*
  - `gpu-init` with every message; resize with the pixel cap; reversed Z;
  - the pool allocator;
  - the **production terrain shader**: procedural sRGB texture array, triplanar, Lambert + hemispheric + AO, fog, sky;
  - drawing generator-v1 terrain at R = 192, meshed with a simple binary surface-nets mesher;
  - a material swatch scene: all 6 materials on flat ground, on a slope and as a lone block, at the Low and Medium tiers;
  - timestamp HUD; `?bench=flythrough`, the scripted 22 b/s flight used at M2 and M4; Dawn-for-Node check.
- *Exit:*
  - p95/p99 measured on the D-1 device;
  - provisional tier defaults set;
  - **`docs/acceptance.md` agreed**;
  - **you sign off the material look on the swatch scene (D-21).**

**M3 — Mesher and smoothing gallery**
- *Build:*
  - topology, starting positions, guard, clearance zone, sharp pinning, relaxation, quantisation, normals, AO, materials, pick records;
  - the pure REMESH region assembler (52³ from loaded blocks and hint states);
  - the mesher invariants in the gate, and the budget proxies (§14);
  - the gallery (§7.8), rendered with the M2 shader.
- *Measure on the D-1 CPU, E-cores included:*
  - GEN_MESH at 38³ and 52³;
  - the REMESH kernel for an 8-chunk corner edit, run in parallel ad-hoc workers (M4 and M5 re-measure it through the pool and transactions);
  - every feature size at the chosen caps.
- *Then:* re-derive the slope limit and step-up.
- *Exit:*
  - **you sign off the look, the clearance caps and hand-built slopes (D-3, D-4)**;
  - C-12 either confirmed or escalated.

**M4 — Streaming world**
- *Build:* worker pool, priorities and caps; GEN_MESH/REMESH; the upload scheduler with atomic groups; the tier setting, the frame-cap setting and the tier-suggestion banner; the device-lost overlay.
- *Exit,* over the scripted 22 b/s flight on the D-1 device:
  - zero frames with an unready in-frustum chunk inside R − 32;
  - main-thread p95 ≤ 8 ms;
  - no long task over 50 ms;
  - fill time and jobs/s recorded.

**M5 — Player and editing** (single-player playable)
- *Build:*
  - pointer lock; capsule controller; walk, jump, fly, sprint;
  - hotbar and material selection; picking with outline and ghost; place and remove; sharp placement and toggle;
  - edit transactions;
  - the physics tests;
  - the scenario A script (walk, fly, edit) on top of `?bench=flythrough`.
- *Exit:* **scenario A passes** on the D-1 device with the tier fixed, and the split-swap counter reads 0.

**M6 — Persistence**
- *Build:*
  - IndexedDB, flush policy, Web Locks, load-all on open;
  - the world list and Save as copy;
  - the ordered classifier, banners and storage status;
  - `.amorfus` export and import (Fork, Restore, Merge), with the share profile;
  - the handoff **sender** and a test receiver fixture;
  - golden fixtures and fuzzing.
- *Exit:*
  - reload survives on every storage-capable mount;
  - the handoff e2e passes;
  - P7 in full (save/load, import round trips, Web Locks) and import-merge ≡ live sync are green;
  - scenario A re-passes with persistence on.

**M7 — Multiplayer**
- *Prerequisites:* D-2 participants and machines booked.
- *Build:*
  - the Trystero transport and its patch; negotiated channels with room epochs;
  - handshake with admission, avatars and interpolation;
  - privacy sheet, relay health and failure UX, user relays and `&r=` confirmation, TURN setting;
  - New invite link with REKEY;
  - a relay-health indicator backed by the same round-trip as `probe:relays`.
- *Exit:*
  - the network e2e tests are in the gate;
  - **the D-2 matrix passes**;
  - **scenario B passes**.

**M8 — Release**
- *Build:*
  - README: run, build, publish to IPFS; the secure-context and localhost rule; platforms; privacy; saves and origins; Edge Enhanced Security note;
  - accessibility pass.
- *Release steps:*
  - `check:release`; publish, with go-ahead; DNSLink; deploy; `RELEASES.md`;
  - freeze generator v1 (D-24);
  - before tagging, publish a throwaway second CID and run the handoff from it through `swg-smoke` and inbrowser.link.
- *Exit:* every line of REQUIREMENTS.md, as amended (§2), passes on its named conditions.

---

## 16. Traceability

| Requirement | Where | Verified by |
|---|---|---|
| Minecraft-style place and remove | §9.3 | picking round trip; M5 |
| Blocks smooth into neighbours | §7 | mesher invariants; M3 gallery, including hand-built slopes (C-7) |
| Organic yet editable block by block | §7.4, §9.3, C-8 | thin-feature minimums; outline + ghost; M3 sign-off |
| Walk, jump, fly, collision | §9.2–9.3, C-9 | physics tests, including clearance cases |
| Mouse and keyboard editing | §9.2 | M5 |
| ≥ 4 distinct materials | §6.1, §8.3 | 6 materials shipped; M2 material sign-off |
| Terrain extends as you explore | §9.1 | M4 streaming exit |
| Edits immediate, no seams | §7.5, §9.4, C-12 | seam and REMESH ≡ GEN_MESH tests; edit latency in scenarios A and B |
| Keep a block sharp | §7.4 | sharp-plane test; Q and R controls |
| P2P; no owner-run server; third parties named | §10, §17, C-1, C-2 | `third-party.json` audit and e2e allowlist |
| Join via link or code | §10.2, C-11 | codec test; e2e join |
| Edits and positions sync | §11 | simulator; network e2e |
| Deterministic conflict resolution | §11.2–11.5 | semilattice properties; simulator; digest collision test |
| ≥ 4 players | §10.3 | 4-context e2e with a blocked pair; D-2 matrix |
| Local saves survive reloads | §12, C-3 | reload e2e on every storage-capable mount |
| Export and import | §12.6 | round trip, fixtures, fuzzing |
| Seed + edits sharing | §12.6, C-10 | share profile; generator goldens in Node and Chromium |
| JS/TS | §13.1 | TypeScript 6 |
| WebGPU rendering | §8 | Dawn compile check; `webgpu` project |
| Fully static | §13.4 | `wrangler.jsonc` unit test (no `main`) |
| IPFS subpaths, Helia loaders, relative references | §13.2–13.6, C-4, C-17 | audit; gateway mounts; kubo smoke; `swg-smoke` |
| Single pinnable folder | §13.5 | `dist/`; independent CID cross-check |
| amorfus repo and amorf.us | §13.4 | `verify-live` |
| Chrome/Edge; 60 fps; no stalls | §8.4, §9.1, C-5, C-6 | scenario runs in Chrome and Edge: max frame ≤ 50 ms, no long tasks |
| WebGPU-unavailable message | §8.2 | fallback projects with axe |
| Readable code; README | §5, M8 | review; README |
| Tests for world, smoothing, sync | §14 | gate |
| No secrets, keys or tracking | §10.4, §13.4, §14, C-15 | secret scan; HTML hash check; zero third-party requests in single-player; observability off |
| Acceptance: `npm install && npm run build` | §13 | CI |
| Acceptance: local server and gateway path | §2, C-4, C-5 | localhost mount; kubo path and subdomain; `swg-smoke` |
| Acceptance: two machines | §2, C-1, D-2 | M0 spike; M7 matrix |
| Acceptance: smooth, seamless, 60 fps | §2, C-6, D-1 | scenario A at M5–M8; scenario B at M7–M8 |

---

## 17. Third-party dependencies

**Runtime.** Contacted only after Host or Join, except hosting and click-only links. The "Sees" column is the single source for the privacy sheet.

| Dependency | Operator | Role | Sees |
|---|---|---|---|
| relay.damus.io, relay.primal.net, nos.lol, offchain.pub, nostr.bitcoiner.social, yabu.me/v2 | independent relay operators (nos.lol's operator unverified) | signaling | IP, Origin, User-Agent, timing, SHA-1 room topic, per-load Nostr key, per-load Trystero peer id, encrypted SDP sizes |
| Relays from Settings or a link (`&r=`) | chosen by the user or the inviter; confirmed before use | signaling | as above |
| stun.cloudflare.com, stun.l.google.com | Cloudflare, Google | STUN | IP and port; about 40 binding requests per join |
| User-supplied TURN (optional) | the user's choice | relay for blocked pairs | IP, traffic volume |
| Other players | — | peers | your public IP, all game data |
| github.com (WebGPU Implementation-Status page) | GitHub | help link, on click only | IP, User-Agent; no Referer |

**Delivery**

| Dependency | Operator | Role | Sees |
|---|---|---|---|
| amorf.us | Cloudflare (Workers static assets, DNS) | hosting; `_dnslink` TXT record | HTTP requests (never the `#fragment`); logs off per D-16 |
| inbrowser.link Service Worker Gateway | IPFS Foundation (from September 2026) | IPFS delivery; the Helia loader | CID or DNSLink name, IP. **Its service worker runs on the app's origin, so it could read saves there** (D-12). |
| delegated-ipfs.dev, trustless-gateway.net | Shipyard until 2026-09-30, then undetermined | routing, DNSLink, blocks for the Service Worker Gateway | CIDs, names, IP |
| ipfs.4everland.io (optional, best effort) | 4EVERLAND | path gateway | CID, IP; shared origin |

**Publish and build**

| Dependency | Operator | Role |
|---|---|---|
| Filebase | Filebase, Inc. | pinning (your key) |
| npm registry | npm, Inc. | packages |
| Playwright browser CDN | Microsoft | test browsers |
| GitHub Actions | GitHub | CI, no secrets |
| kubo via GitHub releases | IPFS project | release smoke tests |
| ipfs/service-worker-gateway (pinned tag) | IPFS Foundation | `swg-smoke` |

**Bundled** (MIT unless noted; notices ship in `THIRD-PARTY-LICENSES.txt`):
- `@trystero-p2p/{core,nostr}` with `@noble/secp256k1`
- `wgpu-matrix`
- `idb` (ISC)
- vendored FastNoiseLite

---

## 18. Deferred past the MVP, and non-goals

**Deferred:**
- **Renderer:** automatic quality downgrade; automatic device-lost recovery; LOD (seam strips or skirts); shadows; water and transparency; soft material blending; GPU-driven culling; an OffscreenCanvas renderer; palette compression; WASM or GPU meshing.
- **Networking:** Trystero's torrent fallback; manual/QR signaling (D-20); signed ops and membership; host kick beyond REKEY; daily topic rotation.
- **Storage:** lazy loading of edits; URL-fragment sharing; linking a world to a file on disk; Storage Buckets.
- **Gameplay:** undo; more than 8 materials; a wider-support smoother for edited terrain (C-7).

**Non-goals** (each would reopen a decision above):
- block simulation that rewrites cells (§11.5);
- an owner-run TURN credential service (D-19);
- an app service worker or offline PWA (§13.3);
- libp2p networking, until relay-free browser transport exists.

---

## Appendix A — Formats, constants, versions

### A.1 Terrain vertex (16 B)

| Field | Format | Contents |
|---|---|---|
| position + AO/flags | `uint16x4` | xyz = (chunk-local + 0.5)·256, i.e. 1/256-block fixed point, range 0..8,448; w = AO (8 bits) \| flags (8 bits) |
| normal | `snorm16x2` | octahedral |
| material | `uint8x4` | x = material id, read with `@interpolate(flat)`; y–w reserved |

Indices are `uint32`.

### A.2 Chunk-entries codec v1 (disk, file, wire)

```
u8 codec=1
varint npeer | npeer × u64le peer        (strictly ascending; only peers referenced in this blob)
varint n     | varint base_l
n × { Δl varint | c varint | peerIdx varint | zigzag Δindex | u16le value }
```

- **Order:** entries are sorted by `(l, c, peer, index)`, so Δl is never negative.
- **Index:** `index = (y·32 + z)·32 + x`.
- **Canonical:** one encoding per state.
- **On the wire:** a chunk is split greedily into parts, each a valid v1 blob over a contiguous run of the canonical order, sized so that the framed `CHUNK_ENTRIES` message stays within 16 KiB. Parts apply independently.

### A.3 Session messages

| Channel | Messages |
|---|---|
| Trystero actions | `HELLO`, `REFUSE` (reason code), `EDITS` (live ops, with a per-message peer table), `ROOT`, `CHUNK_DIGESTS`, `WANT`, `PEERS` (neighbour and member sets), `REKEY` |
| `bulk` (negotiated id 43) | `CHUNK_ENTRIES`: payload = chunk key (u64le) ‖ one A.2 part |
| `pos` (negotiated id 42) | `POS` (31 B) |

- Every message: `[u8 type][payload]`, little-endian.
- `pos` and `bulk` frames are prefixed with a 4-byte room epoch.
- Every message, epoch and type byte included, is ≤ 16 KiB.

### A.4 `.amorfus` file

```
0   8  magic 41 4D 4F 52 46 55 53 1A ("AMORFUS" + 0x1A)
8   2  u16 major = 1       10  2  u16 minor = 0
12  1  u8 compression (1 = gzip)   13  1  u8 profile (0 = backup, 1 = share)   14  2  reserved
16  …  one gzip member: sections  tag[4] | u32 len | payload
       META  UTF-8 JSON ≤ 64 KiB: worldId (backup only), lineageId, name, seed, generator, chunkSize,
             material names, appVersion
       CHNK  sorted chunk keys + A.2 blobs
       plyr  player state (backup only)
       END
```

An uppercase tag is critical, so a reader that doesn't know it rejects the file. A lowercase tag is skipped.

### A.5 Toolchain pins (checked 2026-09-23)

| Tool | Version | Note |
|---|---|---|
| Node | ≥ 22.12 (`.nvmrc` 22) | Vite 8's engine range |
| vite | ^8.3 | Rolldown 1.1 inside |
| typescript | ~6.0.3 | typescript-eslint 8.70 requires `< 6.1` |
| eslint / typescript-eslint | 10 / 8.70 | |
| vitest | ^4.1 | 5.0 is three weeks old |
| fast-check | 4.10 | |
| @playwright/test | 1.63.0 (exact) | Chromium headless shell 153 |
| webgpu (Dawn for Node) | 0.6.1 | needs Mesa lavapipe on Linux |
| ipfs-car | 3.1.0 (exact) | its maintainer organisation appears wound down |
| kubo | 0.43.1 | `npx`, release scripts only |
| wrangler | ^4.137 | |
| @trystero-p2p/nostr | 0.25.4 (exact) + patch | |
| wgpu-matrix | 3.4.2 | |
| idb | 8.0.3 | |
| fake-indexeddb | 6.2 | |

### A.6 `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "amorfus",
  "compatibility_date": "2026-09-23",
  // Assets only: no "main", so no Worker script ever runs.
  "assets": { "directory": "./dist", "html_handling": "auto-trailing-slash", "not_found_handling": "none" },
  "observability": { "enabled": false }, // C-15, D-16
  "routes": [{ "pattern": "amorf.us", "custom_domain": true }]
}
```

The research validated this with a wrangler 4.137 dry run and `wrangler dev`, without the `observability` key.
