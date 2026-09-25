# independent: Independent architect (blind draft of the whole plan)

## Recommendation

# Amorfus: independent end-to-end plan (research draft)

## 0. What this rests on

**Read during this session (on record):**
- `amorfus/README.md`, `.gitignore`, git log and remote.
- Private owner material (not described here).
- Private owner material (not described here).
- Private owner material (not described here).
- `package.json` scripts in the owner's other repos.
- Source read from npm tarballs:
  - Trystero 0.25.4 (core, nostr and torrent packages).
  - @helia/verified-fetch 8.1.2.
  - three 0.186.0. Its bundle size was measured, not read from docs.
  - The ipfs/service-worker-gateway repo on GitHub.
- Specs: WebGPU, WGSL, ECMA-262 and Secure Contexts.
- Docs: Kubo, the IPFS gateway concepts page, the Shipyard redirect post, Vite, Cloudflare, and the ambientCG and Poly Haven licenses.

**Inference, flagged where it is used:**
- Every performance number: ms per chunk, triangle counts, fps, memory. All of them are budgets to measure in M1 and M2.
- The conflict between Amorfus's own service worker and the gateway's service worker.
- NAT failure rates.

## 1. Shape of the system

**The core decision is that the world is blocks, and smooth geometry is a view derived from them.** Everything that gets synced, persisted, hashed or conflict-resolved is a per-cell block value. Geometry is a deterministic function of blocks. That keeps these things tractable and testable:
- sharing as "seed plus edits",
- peer convergence,
- seam-freedom,
- testing.

Three layers:
- **`src/core`**: pure TypeScript with no DOM and no WebGPU. Holds the world model, terrain generator, mesher, CRDT, codecs, protocol and physics math. All of it runs in Node under vitest.
- **Worker pool**: 2 to 4 module workers. Each runs one pure job: `buildChunk(seed, generatorId, chunkCoord, editsInRegion) → { mesh, pickTable }`. Workers hold no shared state and can use an optional LRU cache of generated base chunks.
- **Main thread**: input, player physics, picking, the streaming scheduler, GPU submission, DOM UI, networking and IndexedDB.

SharedArrayBuffer is not used. It needs COOP and COEP headers (cross-origin isolation), which IPFS gateways do not send (verified via MDN). Workers exchange transferable ArrayBuffers instead.

## 2. Rendering approach

**Recommendation: raw WebGPU and WGSL with a small bespoke renderer**, about 2 to 3 thousand lines (estimate).
- Math comes from `wgpu-matrix` 3.4.2 (MIT).
- Mip generation can optionally use `webgpu-utils` 2.1.1 (MIT).
- No three.js.

Why raw WebGPU rather than three.js WebGPURenderer:
1. **Fallback.** three's docs say `WebGPURenderer` "falls back to a WebGL 2 backend" automatically, and there is no documented switch to turn that off (verified). The requirement is WebGPU or a clear message. With three.js this must be defeated by a pre-check, and it silently hides the very case the message exists for. Example: a page served on the LAN over plain http has no `navigator.gpu`, so three.js quietly runs on WebGL2 there.
2. **Terrain needs things a scene graph works against:**
   - pooled vertex and index arenas,
   - packed vertex formats,
   - per-chunk origins passed through `firstInstance`,
   - atomic multi-chunk mesh swaps,
   - rebuild after device loss.
3. **Size.** A minimal three r186 WebGPURenderer scene bundles to about 788 KB minified, 215 KB gzip (measured with esbuild this session). The bespoke renderer is estimated at tens of KB.

**Acceptable alternative:** three r186 with a guarded init. The core, workers, mesher and sync layers do not depend on the renderer, because the mesher emits plain typed arrays.

**Initialisation order.** Each failure maps to a distinct message:
1. `window.isSecureContext` is false: "Amorfus needs HTTPS or localhost". This covers LAN http dev servers and http gateways.
2. `!('gpu' in navigator)`: "This browser does not provide WebGPU".
3. `await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })` returns null: "WebGPU is turned off or your GPU is blocklisted". Include a hint for Linux and Windows-on-ARM, where Chrome keeps it behind a flag, and plain text telling the user to open `chrome://gpu` (chrome:// URLs cannot be links).
4. `adapter.info.isFallbackAdapter` is true: a non-blocking warning that this is software rendering and fps will be low.
5. `requestDevice()` rejects: a message.
6. `device.lost` fires at runtime: an overlay with a Reload button. Edits are already flushed to IndexedDB.

**Pipelines:**
- terrain: opaque, depth-tested, 4x MSAA by default, with a setting to turn it off,
- sky: a full-screen triangle with a gradient,
- selection box: the targeted cell drawn as a thin-edged cube, plus a ghost cube for placement,
- avatars: instanced boxes, with name labels as a projected DOM overlay.

**Terrain vertex (20 bytes):**

| Field | Format | Contents |
|---|---|---|
| `pos` | `uint16x4` | xyz in 1/256-voxel fixed point relative to chunk min minus 1 voxel; w = AO (8 bits) and flags |
| `nrm` | `snorm8x4` | normal xyz; w = 1 on sharp faces |
| `w0..7` | `uint8x4` ×2 | 8 material weights |

All three formats are valid WebGPU vertex formats.
- MVP caps at 8 materials and ships 8: stone, dirt, grass, sand, snow, planks, brick and cobble.
- The fragment shader picks the 2 largest weights and blends triplanar samples. That is at most 6 texture samples per fragment.

**GPU memory:**
- One vertex arena (for example 128 MiB, within the default `maxBufferSize` of 256 MiB, verified).
- One `uint32` index arena.
- Both use a 4 KiB-block free-list allocator.
- Each chunk costs one `drawIndexed(indexCount, 1, firstIndex, baseVertex, firstInstance = chunkSlot)`.
- The vertex shader reads the chunk origin from a storage buffer at `instance_index`. Non-indirect `firstInstance` needs no optional feature. Only indirect draws need `indirect-first-instance` (verified in the spec).

**Precision and seams:**
- Chunk origins are `i32`.
- The shader computes `(chunkOrigin − cameraCell)` in integer math, converts to f32 (exact for |d| < 2^24), then adds `pos/256` (exact).
- The sum has at most about 20 significant bits, so the camera-relative position is exact.
- Vertices shared between two chunks therefore reach the view transform bit-identical. The position output is `@invariant`: WGSL guarantees identical results across programs for identical data (verified).

**Shading:**
- Triplanar mapping over a `texture_2d_array` in `rgba8unorm-srgb`, with mips generated at load and anisotropic filtering.
- Triplanar UVs are computed from `(chunkOrigin mod P) + local`, so they stay seam-free and precise far from the origin.
- Lighting is Lambert sun plus hemisphere ambient plus per-vertex AO.
- Exponential fog blends into the sky color at the view distance, which hides chunk pop-in.
- Shadow maps are post-MVP.

**Resolution:** backing store = CSS size × min(devicePixelRatio, 1.5) by default, adjustable in settings.

**Per-frame work:**
- Frustum-cull chunk AABBs on the CPU.
- Upload budget: at most 8 chunks or 2 MB per frame through `queue.writeBuffer`.
- An old allocation is freed only after `onSubmittedWorkDone`.

**Culling and draw calls:** the target is at most about 600 visible chunk draws (estimate). If CPU encoding shows up in profiles, fall back to render bundles.

## 3. Smoothing technique

**Recommendation: Constrained Surface Nets (Gibson 1998) on binary block occupancy, with pinning for sharp blocks.**

Gibson's method was designed for binary segmented data. It keeps every node inside its original surface cube, so fine detail such as single blocks and thin walls survives (verified). A block world is exactly binary data.

**Algorithm, for each chunk region:**
1. **Occupancy.** A voxel is solid when its material ≠ 0.
2. **Active dual cells.** A dual cell `c` has corners at 8 voxel centers. Its center is the shared corner point of those voxels. The cell is active when its corners mix solid and air.
3. **Initial vertex.** Use naive Surface Nets: the mean of the midpoints of the sign-changing edges, stored as an offset from the cell center in [−0.5, 0.5]³.
   - A zero offset for every vertex reproduces exact Minecraft cubes. The 0fps article states that snapping gives "the same boxy, cubical meshes" (verified).
   - So blocky and smooth are the two ends of one continuum, with no change in topology.
4. **Pinning.** If any of the 8 corners is a solid block with the SHARP flag, the offset is fixed at (0,0,0). A sharp block's 8 corners are all pinned, so it renders as an exact cube.
5. **Relaxation.** Run K = 3 **Jacobi** iterations, which are order-independent, unlike Gauss-Seidel.
   - Update: `off ← clamp((1−λ)·off + λ·mean_j(neighbor_j − cellDelta_j), −0.5, 0.5)`, with λ = 0.5.
   - Neighbors are the vertices that share a quad edge.
   - Everything is computed in a translation-invariant frame: per-cell offsets plus integer cell deltas. Two chunks therefore do bit-identical float64 arithmetic for the same vertex.
6. **Quantize.** Offsets are rounded to 1/256 voxel and stored as integers.
7. **Quads.** Emit one quad for each sign-changing grid edge owned by the chunk, meaning the edge's lower voxel lies in the chunk.
   - The quad joins the 4 dual-cell vertices around that edge.
   - Winding follows which side is solid.
   - Each edge has exactly one owner, so there are no gaps and no T-junctions at a single LOD.
8. **Sharp faces.** Quads whose solid voxel is sharp get their own 4 vertices with the axis normal, giving a flat-shaded cube face.
9. **Smooth normals.** Area-weighted sum of the incident quad normals, computed from the quantized integer positions with exact integer cross products, normalized last, then encoded to snorm8.
10. **AO.** Solid fraction of the 4×4×4 voxels around the vertex, quantized to 8 bits.
11. **Material weights.** Counts of each material among the solid corners of the dual cell, normalized. Sharp faces are one-hot.
12. **Pick table.** For every quad, store `(solidCellIndex, airCellIndex)` as a local index plus a direction. This is what makes picking exact (section 4).

**Apron (neighborhood a chunk must read):**
- 1 voxel for the dual cells, K for relaxation, and 1 for normals and AO.
- That is 5 voxels on the low side and 6 on the high side.
- A 32³ chunk therefore meshes from a 43³ region, about 2.4× the voxels of the chunk itself.
- Every vertex, normal, AO value and weight is a pure function of voxels in that bounded world-space neighborhood.

**Why seams cannot appear, by construction:**
- Shared vertices, normals, AO, material weights and triplanar UVs are bit-identical in both chunks.
- The GPU transform is exact up to the view matrix.
- The remaining ways a seam can appear:
  - **Transient seams during remeshing.** An edit within the apron of a border dirties up to 8 chunks. They are committed as one transaction: all affected meshes are swapped in the same frame.
  - **LOD seams.** LOD is deferred past the MVP. Later work would use Transvoxel or skirts.

**Rejected alternatives:**
- **Marching Cubes:** about twice the triangles of Surface Nets. 0fps measured 154k vs 73k primitives (verified). It also has ambiguous cases and no clean path to a sharp-cube mode.
- **Dual Contouring:** needs Hermite data and QEF solves that binary data does not have.
- **Smoothing a blurred density field** (for example a 3×3×3 box filter): an isolated block's center density is 1/27 < 0.5, so it vanishes (inference, simple arithmetic). That breaks "easy to edit block by block".
- **GPU compute meshing:** WGSL may reassociate and fuse float operations (verified), so meshes may differ between GPUs. That would be acceptable for visuals, but it would complicate seam guarantees and tests.

**Known visual limit:** the clamp keeps the surface within half a block of the block grid. Shallow slopes below about 1:2 keep a gentle ripple. Tuning knobs: K, λ, and blurred normals. This must be judged in the M1 spike.

**Budget (estimate, to verify in M1):** at most 8 ms median per 43³ generate-plus-mesh job in a worker on the reference CPU.

## 4. Chunk and world data model

- **Coordinates:** world voxels as int32. Chunks are 32³ cubes.
  - The world is bounded vertically: y ∈ [−128, 384), which is 16 chunk layers.
  - Horizontally |x|, |z| < 2^24 voxels.
  - `chunkKey` packs (cx 20 bits, cz 20 bits, cy 12 bits) into a safe-integer Number.
- **Voxel:** `uint16`.
  - Bits 0–7: material, where 0 = air. IDs are frozen forever and never reused.
  - Bit 8: SHARP.
  - Bits 9–15: reserved. They are preserved, never dropped.
  - Unknown material IDs render with a "missing" texture and are kept.
- **Chunk storage:** `Uint16Array(32768)`, which is 64 KiB. A chunk that is entirely one value is stored as that single value.
  - A chunk needs meshing when its 43³ region is not uniform.
- **Source of truth:** `edits: Map<chunkKey, Map<localIndex, EditRecord>>`, plus `seed`, `generatorId` and `worldId`. Generated terrain can always be recomputed.
  - Effective voxel = `edit?.value ?? generate(...)`.
- **Terrain generator v1:** CPU only and deterministic across machines.
  - A 2D fBm heightmap from integer-hash gradient noise, 5 octaves.
  - Low-frequency 3D noise for overhangs, sampled on a 4-voxel lattice and interpolated trilinearly.
  - Material is chosen by depth, slope and height: grass, dirt, stone, sand near y≈32, snow above y≈120.
  - Hashing uses `Math.imul`.
  - Only `+ − * /`, `Math.floor`, `Math.sqrt`, `Math.fround` and `Math.imul` are allowed. ECMA-262 declares `sin, cos, exp, log, pow, hypot, atan2`, `**` and others "implementation-approximated" (verified).
  - Enforcement: an ESLint `no-restricted-properties` / `no-restricted-syntax` rule over `src/core/{gen,mesh,edits}`, plus golden-hash tests.
- **Generators are frozen modules:** `gen/terrain@1`, `gen/terrain@2`, and so on.
  - A world records its generator, so a later build still carries every generator it has ever shipped.
  - The mesher is **not** part of world identity. Two peers on different mesher versions see slightly different smoothing over identical blocks. "Same world" is defined as an identical block state.
- **Streaming:**
  - Loaded set = chunks within R_h horizontally and ±4 layers vertically around the player.
  - Priority: edit transactions first, then distance to the camera, then whether the chunk is in the frustum.
  - Jobs carry a version stamp, and stale results are dropped.
  - Proposed default R_h = 6 chunks (192 m), maximum 12. This is an estimate, confirmed in M2.
- **Picking:**
  - Walk the ray through dual cells with an Amanatides–Woo DDA, and test only the quads bucketed in each cell.
  - The hit quad's pick-table entry gives both targets:
    - **remove** = its solid cell,
    - **place** = its air cell.
  - It is exact, even though the visible surface is off the grid.
  - A cube outline shows the target cell, because a smoothed surface does not reveal block boundaries.
  - Placing into a cell that intersects any player's collision volume is refused.
- **Collision:**
  - A swept ellipsoid against the rendered triangles (Fauerby 2003), within 2 chunks of the player. Workers return a CPU copy of near-chunk meshes.
  - The player stands on the visible surface rather than floating up to half a block above or below it.
  - Safety net: if the ellipsoid center ends up in a cell whose 3×3×3 neighborhood is all solid, push out along the grid.
  - Controls: walk, jump (1.25 blocks), fly toggle (F or double-tap Space), Shift to descend.
- **Editing:**
  - Left mouse removes, right mouse places, 1–8 or the mouse wheel select a material, Q toggles smooth/sharp placement, R toggles SHARP on the targeted block.
  - An edit is applied locally at once, the dirty chunks go into one worker transaction, and the result is swapped atomically.
  - Budget: edit-to-visible p95 ≤ 50 ms, about 3 frames.

## 5. P2P stack and signaling

**Recommendation: Trystero 0.25.4** (the `@trystero-p2p/core`, `/nostr` and `/torrent` packages, MIT; published 2026-08-30).
- Both strategies together bundle to about 65 KB minified, 24 KB gzip (measured).
- Signaling is Nostr by default, with BitTorrent WebSocket trackers as the fallback.

**Topology:** a full mesh of WebRTC data channels.
- 4 players need 6 connections; 8 players need 28.
- Rooms are capped at 8.

**Channels:**
- Trystero's own data channel carries reliable, ordered actions: handshake, edits and sync.
- `room.getPeers()` returns each `RTCPeerConnection` (verified in the source). On each one, add a negotiated channel for positions:
  - `pc.createDataChannel('pos', { negotiated: true, id: 7, ordered: false, maxRetransmits: 0 })`.

**Named third-party dependencies, and what each one sees:**
- **Nostr relays.** Pin our own list rather than trusting the library default. The 0.25.4 default is 28 relays, including nos.lol, purplerelay.com and relay.mostr.pub, with redundancy 5.
  - They see: client IP, WebSocket metadata, a room topic hash, the timing of AES-GCM-encrypted SDP blobs, and nothing else.
- **BitTorrent trackers:** tracker.webtorrent.dev, tracker.openwebtorrent.com, tracker.btorrent.xyz and open.ftorrent.com, with redundancy 3. They see the same things.
- **STUN servers:** stun.l.google.com:19302, stun1 and stun2.l.google.com:19302, and stun.cloudflare.com:3478. These are Trystero's defaults, verified in `peer.mjs`. They see your IP and port.
- **TURN:** none by default.
  - Open Relay (Metered) now needs a sign-up and an API key (verified). That conflicts with "no API keys".
  - Settings will offer a bring-your-own TURN URL and credential, stored only locally and never in the repo or in links.
- **Peers** see your public IP. Chrome hides host candidates behind mDNS, but the server-reflexive public IP is still sent (search result, not verified from a primary source). Peers also see your display name, position and edits.

**Keeping the dependency bounded:**
- Relay and tracker lists are configurable in settings.
- The host puts 2–3 relays it is actually connected to into the join link as hints. Builds with stale relay lists can still meet that way.
- Post-MVP: a **manual mode** that pastes compressed SDP offers and answers and needs no signaling at all.

**Identity and keys:**
- `appId` = `'amorf.us/amorfus'`. It is stable and does not include the protocol version, so peers on different builds still meet and get a readable version error instead of silence.
- Each room has an 80-bit `roomId` and a 128-bit `key`, which becomes Trystero's `password`. Trystero derives the AES-GCM key as SHA-256(`secret:appId:roomId`) (verified).
- A typed **code** is 20 base32 characters (100 bits). `roomId` and `key` are derived from it with SHA-256 and domain labels.

**Security context:** Trystero uses `crypto.subtle`, which, like WebGPU, needs a secure context. Plain http on a LAN therefore breaks both graphics and networking.

**Privacy notice:** a one-time notice before the first host or join, plus a Privacy page in the menu and the README. It lists the parties above and what each one sees. There is no analytics of any kind.

## 6. Sync and conflict model

**Data type:** a state-based LWW map (a map of last-writer-wins registers) keyed by cell (Shapiro et al. 2011; merge takes the maximum timestamp).
- `EditRecord = { cell, value: u16, lamport: safe-int, peer: u64 }`.
- Records are totally ordered by `(lamport, peerId)`.
- Receiving an edit sets `clock = max(clock, rec.lamport)` and applies the record if it is greater than the stored one.
- A local edit gets `lamport = max(clock, stored.lamport) + 1`.
- Removal writes value 0. There are no tombstone semantics, because every cell always has a value.
- Records are never compacted away. Dropping one would let an older concurrent record win on another peer.
- Merge is commutative, associative and idempotent, so order, duplication and delay do not matter.

**Validation:** deterministic and independent of local state (bounds, material ≤ 255, reserved bits, lamport < 2^53). Every peer then accepts or rejects the same records. Malicious peers are out of MVP scope: the link is the capability. This is flagged.

**Protocol (binary, 1-byte type):**
1. `HELLO`. Carried in Trystero's handshake.
   - Fields: `proto`, `build` (git sha), `worldId`, `seed`, `generatorId`, `peerId`, `name`, `color`.
   - Refuse when the protocol major differs, the `worldId` differs, or the generator is unknown to this build. Show a message naming the build the other peer runs.
2. Anti-entropy.
   - Each side sends a `DIGEST`: a list of `(chunkKey, u32 hash of that chunk's records)`.
   - The other side answers with `WANT(chunkKeys)` and then `EDITS`.
   - This runs on connect and every 30 s.
3. `EDITS` are broadcast at once. Batches are at most 16 KiB, matching Trystero's chunking and safely under Chrome's 256 KiB data-channel limit (search result).
4. `POS` messages on the unreliable channel at 15 Hz: `{t, pos f32×3, yaw, pitch, flags}`.
   - Receivers interpolate with a 100 ms buffer on arrival time, so no clock sync is needed.
   - Players who stop sending are shown idle, not dropped: background tabs throttle timers.

**World hash:** SHA-256 over records sorted by (chunkKey, localIndex), then seed and generatorId. It is shown in the debug overlay, and the e2e tests assert it is equal across peers.

**Join link:**
- Format: `${location.origin}${location.pathname}#v=1&c=<code>&s=<seed>&g=terrain@1&w=<worldId>&r=<relay hints>`.
- Built from `location`, so an IPFS link pins the exact CID and therefore the exact build.
- The fragment is never sent to hosts or gateways.
- A link or code is a **rendezvous, not a copy**. With a link the joiner can play at once on the seed and merges edits whenever any peer holding them comes online.
- Asynchronous sharing uses export files. An optional `#snap=` parameter carries gzip-compressed edits when they fit in about 8 KB.

**Cross-tab:** `navigator.locks` gives one writer per world per origin.

## 7. Persistence format

**IndexedDB** (database `amorfus`, version 1), with small hand-written helpers. The `idb` package (ISC) is optional.

| Store | Key | Contents |
|---|---|---|
| `worlds` | `worldId` | `{ name, seed, generatorId, formatVersion, createdAt, lastPlayed, player, room? }` |
| `edits` | `[worldId, chunkKey]` | packed records `{u16 local, u16 value, f64 lamport, u16 peerIdx}` + digest |
| `peers` | `[worldId, idx]` | u64 peerId |
| `settings` | key | value |

**Writing:**
- Write-behind every 1 s, on `visibilitychange → hidden`, and before export.
- Call `navigator.storage.persist()` when a world is first created. Chromium grants it silently based on engagement. Per-origin quota is up to 60% of disk (verified).

**Export file** (`.amorfus`):
```
magic "AMRF" | u16 formatVersion | u16 flags |
gzip( u32 headerLen | header JSON {name, seed, generatorId, worldId, createdAt, exportedAt, build}
      | u32 peerCount | peerIds (8 B each)
      | u32 chunkCount | per chunk: i32 cx, i32 cy, i32 cz, u32 n, n × 14-B records )
| SHA-256 of the uncompressed body
```
- About 14 B per record before compression.
- Uses the native `CompressionStream`/`DecompressionStream`, which have been Baseline since May 2023 (verified).

**Import:**
- Checks: magic, version, hash, a streaming decompressed-size cap of 512 MB, and bounds.
- Two modes: open as a new world, or merge into the same world by LWW. Merging requires the same seed and generator.

**Origin caveat** (see conflicts): the world list shows the storage origin, warns on shared-origin path gateways, and reminds users to export.

## 8. Build tooling, hosting and publishing

**Toolchain:**
- Node 22+; `npm ci` with the lockfile committed.
- **Vite 8.3.0** (Rolldown), with:
  - `base: './'`,
  - `build.target: 'esnext'`,
  - `build.modulePreload.polyfill: false`,
  - `worker.format: 'es'`,
  - `build.license: { fileName: 'THIRD-PARTY-LICENSES.md' }`. The default lands in the hidden `.vite/` folder, which `ipfs add -r` skips without `--hidden` (verified).
  - Workers are created as `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`.
  - Textures are imported as modules, **not** placed in `public/`, so their URLs are relative and hashed.
- **TypeScript ~6.0.3**. TypeScript 7.0.2 exists (2026-07-08), but typescript-eslint 8.70.1 supports only `typescript <6.1.0` (verified). Config: strict, `noUncheckedIndexedAccess`, types `@webgpu/types` and `vite/client`.
- **Tests:** vitest ^4.1 (5.0 came out 2026-09-03, too new), plus fast-check 4.10 for property tests.
- **Lint:** ESLint 10 with typescript-eslint.
- **E2E:** Playwright 1.63, plus @axe-core/playwright, which is MPL-2.0 and a dev-only dependency that is never shipped.
- **No CDN imports.** Everything is bundled so the CID is self-contained.
- **Layout:** `src/core/{math,world,gen,mesh,edits,persist,net,physics}`, `src/workers`, `src/render` (with `shaders/*.wgsl`), `src/game`, `src/net` (transports: trystero, loopback, later manual), `src/storage`, `src/ui`, `index.html`, `scripts/`, `e2e/`.
- **`index.html`** contains the static status and fallback message.
- **LAN development:** add a `dev:lan` script using `@vitejs/plugin-basic-ssl`, because plain http on a LAN IP is not a secure context.

**Hosting on amorf.us:** Cloudflare Workers static assets only, with **no Worker script**, since a script is server-side code.
- `wrangler.jsonc`:
  - `"$schema": "node_modules/wrangler/config-schema.json"`,
  - `assets.directory: "./dist"`,
  - `not_found_handling: "404-page"`,
  - `routes: [{ pattern: "amorf.us", custom_domain: true }]`.
- Do not use peatyscot's `run_worker_first`. If a www → apex redirect is wanted, do it with a Cloudflare redirect rule.
- Keep zone Web Analytics automatic injection **off**: Cloudflare injects the beacon on every page of the zone when it is on (verified).

**IPFS:**
- `npm run ipfs:car` runs `ipfs-car pack dist` and prints the CID. It needs no daemon and is deterministic.
- `npm run ipfs:add` runs `ipfs add -r --cid-version=1 dist`.
- Different tools may produce different CIDs for the same folder (inference), so pin with the tool you used to compute it.
- Publish steps:
  1. Pin with a provider that browsers can reach. The service-worker gateway fetches from `trustless-gateway.net` and routes through `delegated-ipfs.dev` by default (verified).
  2. Check the build at `https://inbrowser.link/ipfs/<CID>/`.
  3. Update the `_dnslink.amorf.us` TXT record. This gives a stable origin for IPFS users across releases.
  4. Record CID ↔ git tag in `RELEASES.md`.
- **Amorfus registers no service worker.** On inbrowser.link the gateway's own service worker owns the origin scope (inference).
- Only extensions that verified-fetch maps by name are emitted: `.html .js .css .json .svg .woff2`, plus sniffable binaries such as `.png` and `.webp`. Anything else is served as `application/octet-stream` (verified in the source).

## 9. Testing and the check gate

`npm run check` is the definition of done. Deploy scripts run it first: `deploy` = `npm run check && wrangler deploy`, and the same for `ipfs:*`. The steps:

1. **`tsc --noEmit`.**
2. **`eslint .`**, including the determinism rule. Also banned:
   - `history.pushState` and `replaceState`,
   - `navigator.serviceWorker.register`,
   - `localStorage` in core code,
   - string URLs that start with `/`.
3. **`vitest run`** (Node):
   - generator golden hashes for 16 fixed chunks and 3 seeds,
   - a test that "chunked equals monolithic": meshing a 2×2×2 block as one region gives vertices, normals, AO and weights bit-identical to the union of per-chunk meshes,
   - sharp-pin cube exactness,
   - an isolated single block always produces a closed mesh,
   - pick-table correctness,
   - LWW merge laws (commutative, associative, idempotent) with fast-check,
   - convergence of N simulated peers under random reordering, duplication and loss followed by anti-entropy, checked by equal world hashes,
   - protocol codec round-trips and version-refusal rules,
   - export/import round-trip, corruption detection and the size cap,
   - collision sweeps against canned meshes.
4. **`vite build`.**
5. **`node scripts/verify-dist.mjs`:**
   - every URL in HTML, CSS and JS is relative, or is on the external allowlist (relays, trackers, STUN),
   - every relative reference resolves to a file,
   - no hidden files,
   - extensions are on the gateway MIME allowlist,
   - `THIRD-PARTY-LICENSES.md` exists and covers every bundled package,
   - a texture provenance file (`src/assets/textures/SOURCES.md`, CC0 only) has an entry for every texture,
   - no `serviceWorker.register`,
   - a secret-pattern scan,
   - size budgets: JS ≤ 350 KB gzip, total ≤ 4 MB.
6. **`playwright test`:**
   - A strict static server (`scripts/serve-strict.mjs`) serves `dist` with **no SPA fallback**. `vite preview` configures sirv with `single: true`, which hides broken paths (verified).
     - Its MIME map copies verified-fetch's.
     - It mounts `dist` at `/` and at `/ipfs/bafy…/` on 127.0.0.1.
   - All non-loopback network access is blocked.
   - Assertions:
     - no console errors and no 404s,
     - a WebGPU context renders non-blank pixels,
     - a context with WebGPU disabled shows the accessible message, and axe reports no violations,
     - two pages joined through a `BroadcastChannel` loopback transport converge to equal world hashes after conflicting edits,
     - four pages join a room.
   - Headless WebGPU needs flags such as `--enable-unsafe-webgpu --enable-features=Vulkan` (Chrome blog, verified) or SwiftShader. M0 must prove this works on the owner's machine (WSL2). If it cannot, the gate points Playwright at a Windows Chrome channel. It is not relaxed.

**Outside the gate** (these need real hardware or networks), each with a written protocol in `docs/acceptance.md`:
- the performance acceptance run,
- two machines on different networks,
- inbrowser.link and a Kubo gateway test run after publishing.

## 10. Acceptance definitions to agree before M2

**Reference machine:**
- Windows 11 x64 laptop, plugged in.
- Integrated GPU: Intel Arc (Core Ultra, Xe-LPG) or AMD Radeon 780M. Intel Iris Xe (Gen12) is the floor.
- 16 GB RAM, current stable Chrome and Edge.
- 1920×1080 window with render scale 1.0.

**Scenario:**
- A scripted 60 s run: walk 20 s, fly at 10 m/s across unloaded terrain for 20 s, then 30 place/remove edits.
- Default R_h = 6. Default settings plus MSAA.

**Metrics (from an in-app frame-time recorder):**
- frame time p95 ≤ 16.7 ms and p99 ≤ 25 ms,
- edit-to-visible p95 ≤ 50 ms,
- main-thread JS p95 ≤ 5 ms per frame.

**Network acceptance:**
- Two machines on different consumer NATs, not both symmetric or CGNAT, over https (amorf.us or inbrowser.link).
- Plus one LAN case, plus 4 peers.
- Anything else counts as best effort unless BYO TURN is configured.


## Hypothesis verdict

I was given no competing design hypothesis, only owner context, so this checks those premises one by one.

(1) **Vite and TypeScript are right; three.js's automatic WebGL fallback and plain-http LAN serving are not.**
- Use Vite, TypeScript 6.0 (not 7: typescript-eslint 8.70.1 caps TypeScript below 6.1.0), vitest ^4.1 and esnext.
- Do not rely on three's WebGL fallback. three's docs describe automatic WebGL2 fallback with no documented off switch. That directly contradicts "show a clear message if WebGPU is unavailable".
- Do not serve over plain http on the LAN either. On a plain http LAN address there is no navigator.gpu and no crypto.subtle. three.js would silently run on WebGL2 there; Amorfus would show the message and could not use Trystero at all. A `dev:lan` script with basic-ssl is needed.

(2) **Serving amorf.us from Cloudflare Workers static assets is right**, with two conditions:
- Assets only, with no Worker script. peatyscot's `run_worker_first` Worker would be server-side code, which the requirements forbid.
- Zone Web Analytics automatic injection must stay off. Cloudflare injects a beacon into every HTML page of the zone when it is enabled, which would breach "no tracking".

(3) **Bounding the dependency rather than denying it is the right stance, and it applies here in full.**
- WebRTC always needs a signaling rendezvous. Amorfus's is public Nostr relays or BitTorrent trackers plus Google and Cloudflare STUN.
- Reliable connectivity would need TURN, and the free public TURN option now requires an API key.
- The plan names every one of these, bounds them (configurable relays, relay hints in the link, bring-your-own TURN, a manual-SDP escape hatch) and defines the acceptance network conditions. It does not claim zero infrastructure.

(4) **IPFS publishing.**
- Use relative paths, fragment parameters and `ipfs add -r --cid-version=1`.
- Amorfus needs TypeScript, module workers and WGSL, so it must bundle everything (no CDN imports) to keep the CID self-contained.

(5) **The implicit premise that "gateway subpath" means a shared path-gateway origin is outdated.**
- Since May 2026, ipfs.io and dweb.link redirect browser navigations to inbrowser.link. That is a Helia service-worker gateway in subdomain mode, so each CID gets its own origin.
- Path mode survives on local Kubo (127.0.0.1) and on private gateways.
- Consequence: the storage-origin problem gets worse. Every release on public gateways starts with empty storage.

## Key decisions
- **Source of truth vs. geometry** → The world is block values (uint16: material, SHARP bit, reserved bits). Smooth geometry is a deterministic view computed from them and is never synced or persisted.
  - why: This makes 'seed plus edits' sharing, CRDT convergence, world hashing and seam-freedom tractable, and all of it testable in Node. Peers on different mesher versions still agree on the world.
  - rejected Store a density field or per-vertex offsets as world state: That makes world state continuous, so merging and hashing conflicting edits becomes ill-defined. It also bloats saves and breaks block-by-block editing semantics.
- **Smoothing algorithm** → Constrained Surface Nets (Gibson 1998) on binary occupancy: naive Surface Nets initial vertices, then K=3 Jacobi relaxation clamped to each vertex's cell, then quantization to 1/256 of a voxel. Vertices touching a SHARP block are pinned to the cell center, which is exactly the cube corner.
  - why: Designed for binary segmented data and keeps nodes within their surface cube, so single blocks never vanish (verified). Zero offsets reproduce exact cubes (0fps), so sharp and smooth blocks share one topology with no cracks. It produces about half the triangles of Marching Cubes. Bounded locality gives exact seams.
  - rejected Marching Cubes / Transvoxel: About 2x the triangles and has ambiguous cases. There is no natural 'sharp cube' mode. Transvoxel is only needed for LOD, which is post-MVP.
  - rejected Dual Contouring: Needs Hermite normal data and QEF solving. Binary blocks have no meaningful normals to feed it.
  - rejected Blur occupancy into a density field, then run an isosurface: An isolated block's blurred center density (1/27) falls below the iso level, so the block disappears. That violates block-by-block editing.
  - rejected GPU compute meshing: WGSL permits float reassociation and fusion (verified), so results vary by GPU. That complicates the seam guarantees and the golden tests for little gain.
- **Renderer** → Raw WebGPU/WGSL with a small bespoke renderer, wgpu-matrix for math, and pooled arenas with firstInstance chunk slots. Positions are relative to an integer camera origin and quantized, so arithmetic is exact.
  - why: The requirement is WebGPU-only. three's WebGPURenderer auto-falls back to WebGL2 with no documented off switch (verified). Voxel terrain needs arena allocation and atomic swaps that fight a scene graph. The bundle is smaller (three minimal is about 215 KB gzip, measured).
  - rejected three.js r186 WebGPURenderer: Viable only with a guarded pre-check; kept as the fallback option. Rejected as the default because the silent WebGL2 fallback conflicts with the requirement to show a message, and because of per-object overhead and bundle size.
  - rejected Babylon.js: Same fallback and weight issues.
- **Chunk size and apron** → 32^3 cubic chunks, meshed from a 43^3 region (5-voxel low apron, 6-voxel high apron). Uniform chunks are stored as a single value. The world is bounded at y in [-128, 384).
  - why: The apron overhead is 2.4x at 32^3 versus 4.8x at 16^3. An edit dirties about 2.25 chunks on average, 8 at most. Draw count stays around 600 or fewer at a 6-chunk radius (estimate).
  - rejected 16^3 chunks: Twice the relative apron cost and 8x the draw calls for the same view distance.
  - rejected Main thread owns dense voxel arrays for all loaded chunks: About 150 MB at radius 8 before compression. Stateless workers regenerating the region are simpler and purely functional.
- **Picking and collision** → Every emitted quad records its (solid, air) grid edge, so a ray hit on the visible surface maps exactly to the remove and place cells, with a cube-outline highlight. Collision is a Fauerby swept ellipsoid against the near-chunk meshes, with a grid push-out safety net.
  - why: The visible surface is off the grid by up to half a block. Grid-only picking or collision would visibly mismatch it: floating feet, the wrong block removed.
  - rejected Amanatides-Woo DDA against the voxel grid only: It hits cells in front of or behind the rendered surface.
  - rejected AABB-vs-grid physics (Minecraft): Stair-step motion and hovering on smooth slopes contradict the visuals.
- **P2P and signaling** → Trystero 0.25.4 (MIT): Nostr strategy by default, BitTorrent trackers as fallback, a pinned configurable relay list, relay hints in the join link, an extra negotiated unreliable data channel for positions, and bring-your-own TURN in settings. A manual SDP mode is designed in and ships post-MVP.
  - why: Needs no server run by the owner and no API keys. It is maintained (release 2026-08-30), small (24 KB gzip), and encrypts SDP with a room password. The dependency is named and bounded rather than denied.
  - rejected js-libp2p WebRTC + circuit relays: Heavy, and in practice needs well-known relay infrastructure.
  - rejected PeerJS cloud server: A single third-party signaling server, effectively someone else's game server.
  - rejected y-webrtc / Yjs: The default signaling servers are centralized and have had outages. Yjs's sequence CRDT machinery is unnecessary for a per-cell register map.
  - rejected Free public TURN (Open Relay): It now requires signing up and an API key (verified), which conflicts with 'no API keys'.
- **Conflict model** → An LWW-register map per cell. Order is (Lamport clock, 64-bit peerId). Validation is deterministic and state-independent. Anti-entropy compares per-chunk digests. A SHA-256 world hash is used for verification.
  - why: Commutative, associative and idempotent merge gives convergence under any delivery order and supports offline edits. It is simple enough to property-test fully.
  - rejected Host-authoritative ordering: Needs a live host, and fails the requirement when the host leaves.
  - rejected Hybrid logical clocks: Depend on wall clocks. Lamport ordering preserves causality, which is what players perceive.
  - rejected Automerge/Yjs: Heavier general-purpose CRDTs whose tombstone and metadata growth isn't needed here.
- **Version skew** → Generators are frozen per world ('terrain@N') and every build ships all of them. The protocol major is checked in the HELLO handshake with a readable refusal. appId is stable, not versioned. Join links are built from location, so IPFS links pin the build's CID.
  - why: Immutable IPFS builds and a moving amorf.us guarantee that peers will sometimes run different builds. Silent divergence breaks 'all peers end up with the same world'.
- **Persistence** → IndexedDB with per-chunk packed edit records and 1 s write-behind, plus storage.persist(). A '.amorfus' export uses a binary gzip container (native CompressionStream) with a JSON header and a SHA-256 trailer. Import can open as a new world or merge by LWW.
  - why: A seed plus edits with Lamport stamps is small (about 14 B per edit before compression). Keeping the stamps lets an exported world merge back into a live one.
- **Build and hosting** → Vite 8.3 with base './', TypeScript ~6.0.3, vitest ^4.1, ESLint 10 and typescript-eslint, Playwright 1.63. Everything is bundled, with no CDN imports. build.license writes THIRD-PARTY-LICENSES.md at the dist root. Cloudflare Workers static assets with no Worker script. IPFS via ipfs-car or kubo plus DNSLink.
  - why: TypeScript 7 is blocked by typescript-eslint's <6.1.0 peer range (verified). The license file is kept out of the hidden .vite/ folder, which ipfs add skips.
- **Service worker / PWA** → None.
  - why: inbrowser.link, where ipfs.io and dweb.link now redirect, runs a Helia service worker that owns the origin. An app service worker would contend for that scope (inference). Offline play is not a requirement.

## Facts
- [V] Chrome WebGPU status: on by default on Windows x64, macOS and ChromeOS since 113. On Linux, only Intel Gen12+ (since 144) and NVIDIA on Wayland (since 147); other Linux GPUs and Windows ARM64 are behind a flag. Android since 121. — https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- [V] Firefox ships WebGPU on Windows since 141 and on Apple Silicon macOS since 145; Linux is still Nightly. Safari 26 ships it on macOS, iOS and visionOS. — https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- [V] The whole WebGPU API is available only in secure contexts. — https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- [V] Secure Contexts: 127.0.0.0/8, ::1, 'localhost' and hosts ending in '.localhost' are potentially trustworthy (the names only if the UA follows localhost resolution rules). A LAN IP over http is not. — https://w3c.github.io/webappsec-secure-contexts/
- [V] three.js WebGPURenderer automatically falls back to WebGL 2 when WebGPU is unavailable. The only related option is forceWebGL, and no option to disable the fallback is documented. — https://threejs.org/docs/pages/WebGPURenderer.html
- [V] three latest is 0.186.0 (2026-09-08). A minimal WebGPURenderer scene bundled with esbuild measured 787,971 B minified and 215,481 B gzip. — npm registry (npm view three) + local esbuild measurement in the scratchpad this session
- [V] Vite 8.3.0 (2026-09-10) runs on rolldown ~1.2.6. A relative base ('./' or '') requires import.meta. build.license writes .vite/license.md by default, or fileName relative to outDir. — https://vite.dev/guide/build ; https://raw.githubusercontent.com/vitejs/vite/main/docs/config/build-options.md ; npm view vite
- [V] With appType 'spa', Vite preview configures sirv with single: true (SPA fallback), which can hide broken paths. — https://vite.dev/config/shared-options
- [V] TypeScript latest is 7.0.2 (2026-07-08). typescript-eslint 8.70.1 declares peer typescript '>=4.8.4 <6.1.0'. — npm view typescript time; npm view typescript-eslint@8.70.1 peerDependencies
- [V] vitest 5.0.0 was released 2026-09-03 and 5.0.1 on 2026-09-15; 4.1.11 was released 2026-08-18. — npm view vitest time
- [V] Trystero 0.25.4 (2026-08-30) ships as MIT scoped packages @trystero-p2p/*. Nostr is the default strategy. — npm view trystero / @trystero-p2p/nostr ; https://github.com/dmotz/trystero/releases
- [V] Trystero default ICE servers are stun:stun.l.google.com:19302, stun1 and stun2.l.google.com:19302, and stun:stun.cloudflare.com:3478, with no TURN by default. — @trystero-p2p/core@0.25.4 dist/peer.mjs (defaultIceServers), read from npm tarball
- [V] Trystero Nostr has a default list of 28 relays with redundancy 5. Torrent defaults to 4 trackers (tracker.webtorrent.dev, tracker.openwebtorrent.com, tracker.btorrent.xyz, open.ftorrent.com) with redundancy 3. Messages are chunked at 16 KiB. — @trystero-p2p/nostr@0.25.4 dist/index.mjs; @trystero-p2p/torrent@0.25.4; @trystero-p2p/core action-wire.mjs
- [V] Trystero encrypts SDP with AES-GCM using a key of SHA-256(`${secret}:${appId}:${roomId}`), and relies on crypto.subtle. — @trystero-p2p/core@0.25.4 dist/crypto.mjs
- [V] Trystero room.getPeers() returns a map of peerId to RTCPeerConnection, so extra negotiated data channels can be added. — @trystero-p2p/core@0.25.4 dist/room.mjs line 181
- [V] Trystero nostr+torrent bundle measured 64,899 B minified and 23,962 B gzip. All transitive deps are MIT. — local esbuild + license-checker-rseidelsohn run this session
- [V] The Open Relay (Metered) TURN service requires signing up for an API key. Its free tier is 20 GB per month. — https://www.metered.ca/tools/openrelay/
- [unverified] About 20% of consumer WebRTC sessions need a TURN relay, and far more in enterprise networks. — https://www.nojitter.com/know-where-turn-when-deploying-webrtc (only states '22% of failed calls required media relay'); the 20% figure comes from secondary search summaries
- [V] Path gateways violate the same-origin policy. Subdomain gateways provide origin isolation and should be used for web apps. — https://docs.ipfs.tech/concepts/ipfs-gateway/
- [V] Browser navigations to ipfs.io and dweb.link are being redirected to inbrowser.link, a service-worker gateway, in a phased rollout announced 2026-05-11. — https://ipshipyard.com/blog/2026-ipfs-gateways-redirect-inbrowser-link/
- [V] The service-worker gateway runs exclusively in subdomain mode, uses @helia/verified-fetch, and by default fetches from trustless-gateway.net and routes through delegated-ipfs.dev. — https://github.com/ipfs/service-worker-gateway ; src/config/index.ts
- [V] @helia/verified-fetch 8.1.2's default contentTypeParser uses file-type sniffing, then maps extensions (.js/.mjs to text/javascript, plus .css .html .json .svg .woff2 and others). Unknown extensions become application/octet-stream. — @helia/verified-fetch@8.1.2 dist/src/utils/content-type-parser.js (npm tarball)
- [V] Kubo's implicit gateway config makes 'localhost' a subdomain gateway (UseSubdomains: true), while loopback IPs act as path gateways. — https://raw.githubusercontent.com/ipfs/kubo/master/docs/config.md (Implicit defaults of Gateway.PublicGateways)
- [V] ipfs add skips hidden files unless --hidden is passed. CIDv1 enables raw leaves. The default chunker is size-262144. — https://docs.ipfs.tech/reference/kubo/cli/#ipfs-add
- [V] ECMA-262 makes Math.sin, cos, tan, exp, log, pow, hypot, atan2 and others, as well as Number::exponentiate (the ** operator), 'implementation-approximated'. — https://tc39.es/ecma262/multipage/numbers-and-dates.html ; https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html
- [V] WGSL lets implementations reassociate operations and fuse them (e.g. FMA) when at least as accurate, so float results can differ across GPUs. — https://www.w3.org/TR/WGSL/ §15.7.5
- [V] WGSL @invariant on the position output guarantees identical results across programs for identical data and control flow. — https://www.w3.org/TR/WGSL/ §12.10
- [V] WebGPU default limits are maxBufferSize 256 MiB, maxStorageBufferBindingSize 128 MiB and maxVertexBuffers 8. A non-zero firstInstance in indirect draws needs 'indirect-first-instance'. GPUAdapterInfo.isFallbackAdapter exists. — https://www.w3.org/TR/webgpu/
- [V] SharedArrayBuffer requires a secure context plus cross-origin isolation (COOP + COEP headers); otherwise postMessage throws on it. — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- [V] Chromium lets an origin store up to 60% of disk. persist() is approved or denied silently based on engagement. Quotas apply per origin even when one origin hosts several sites. — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- [unverified] Chrome/Edge 81+ hide host ICE candidates behind mDNS, but the server-reflexive public IP is still exposed to peers. — https://bloggeek.me/psa-mdns-and-local-ice-candidates-are-coming/ (from search summaries; not fetched)
- [unverified] Chromium closes a data channel on messages over 256 KiB. Messages under 16 KiB are safe across browsers. — https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html (from search summary; not fetched)
- [V] Gibson's Constrained Elastic Surface Nets generate smooth surfaces from binary segmented data, keeping each net element within its original surface cube so thin features survive. — https://link.springer.com/chapter/10.1007/BFb0056277 ; http://www.merl.com/reports/TR99-24/
- [V] Naive surface nets place the vertex at the mean of the edge crossings, and snapping yields Minecraft-like cubes. Surface nets produced 73,133 primitives against Marching Cubes' 154,168 and ran in 74.54 ms against 145.8 ms in the 0fps benchmark. — https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/
- [V] Fauerby (2003) gives swept-ellipsoid vs. static triangle mesh collision detection and sliding response. — https://www.peroxide.dk/papers/collision/collision.pdf
- [V] Cloudflare Workers static assets allow 20,000 files per version (Free) or 100,000 (Paid, wrangler 4.34+), and 25 MiB per file. — https://developers.cloudflare.com/workers/platform/limits/
- [V] Cloudflare Web Analytics automatic setup injects its JS snippet on all pages under a proxied zone; Cache-Control 'no-transform' prevents the injection. — https://developers.cloudflare.com/web-analytics/faq/
- [V] ambientCG and Poly Haven assets are CC0 1.0; attribution is appreciated but not required. — https://docs.ambientcg.com/license/ ; https://polyhaven.com/license
- [V] CompressionStream has been Baseline widely available since May 2023. — https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream
- [V] Headless Chrome on Linux needs flags such as --enable-unsafe-webgpu, --use-angle=vulkan and --enable-features=Vulkan for WebGPU; without drivers it falls back to SwiftShader. — https://developer.chrome.com/blog/supercharge-web-ai-testing
- [unverified] With a relative base, Vite emits worker URLs through import.meta.url. — https://github.com/vitejs/vite/pull/9204 (title only, from search)
- [V] Shapiro et al. (2011) define the state-based LWW-Register CvRDT, whose merge keeps the maximum timestamp. — https://reed.cs.depaul.edu/lperkovic/csc536/lecture10/techreport.pdf (INRIA RR-7506)
- (removed: private source)
- (removed: private source)
- [V] The amorfus .gitignore is the GitHub Node template. It ignores dist, .vite/, .env and '*.seed', so world seed files must not use a .seed extension. — .gitignore (lines 15, 83, 143)
- [V] amorfus has no LICENSE file. — ls of the repo root
- [V] Current versions: fast-check 4.10.2 (MIT), @axe-core/playwright 4.13.0 (MPL-2.0), @playwright/test 1.63.0, wrangler 4.137.0, wgpu-matrix 3.4.2 (MIT), webgpu-utils 2.1.1 (MIT), ipfs-car 3.1.0, kubo (npm) 0.43.1. — npm view (this session)
- [unverified] y-webrtc's default signaling servers (signaling.yjs.dev plus Heroku instances) have had documented outages. — https://github.com/yjs/y-webrtc/issues/43 (from search summary)

## Risks
- (medium) Constrained Surface Nets with only K=3 local iterations may look faceted or lumpy rather than 'organic', especially on shallow slopes. The clamp limits the surface to half a block. | impact: The core visual promise of the product fails. | mitigation: M1 visual spike with a debug viewer and tunable K, λ, blurred normals and AO. K can rise at the cost of a larger apron. Get go/no-go approval on screenshots before building M2.
- (medium) 60 fps on the integrated GPU is missed at the default view distance: triplanar blending, MSAA, high-DPR canvases, around 600 draws. | impact: The acceptance criterion fails. | mitigation: Budgets and an in-app frame recorder from M2. Render-scale and MSAA settings, a top-2 material blend, and a view-distance default that is set by measurement rather than chosen upfront. Render bundles if CPU encoding dominates.
- (high) Public Nostr relays and BitTorrent trackers churn, rate-limit or block. Immutable IPFS builds freeze a relay list that decays over time. | impact: Players cannot find each other even though the build works. | mitigation: Pin our own list of 10 or more relays with redundancy 5; torrent fallback; relay hints in join links; relays editable in settings; manual SDP mode post-MVP; a 'no peers found' diagnostic that names each relay's status.
- (medium) NAT pairs such as symmetric NAT or CGNAT on both sides cannot connect without TURN, and no keyless public TURN exists. | impact: The 'two machines on different networks' acceptance fails for some users. | mitigation: Define the acceptance network conditions; bring-your-own TURN setting; show the ICE failure clearly; LAN play works.
- (high) IPFS storage origins: per-CID origins (inbrowser.link, dweb.link) leave local worlds behind on every new release. Shared path-gateway origins let other sites read or delete them. | impact: Players lose their worlds, or appear to. | mitigation: Stable origins (amorf.us, DNSLink name via amorf-us.ipns subdomain). Show the origin in the world list, prompt to export, and provide one-click export-all. Warn on path gateways.
- (medium) Headless WebGPU is unavailable in the owner's WSL2 or CI environment, so the rendering smoke test cannot run and there is pressure to relax the gate. | impact: The gate is either weakened, which the owner forbids, or blocks all work. | mitigation: An M0 spike proves the SwiftShader or Vulkan flags work. The fallback is a Windows Chrome channel via Playwright. Never make the render assertion optional.
- (medium) Version skew between peers on different builds (different CIDs, or amorf.us updating mid-session). | impact: Protocol errors or divergent worlds. | mitigation: HELLO handshake that refuses with a readable reason; frozen generators; links pinned to the current build; world-hash debug overlay.
- (low) Generator nondeterminism creeps in, for example someone uses Math.sin or ** or changes the noise without bumping the version. | impact: Peers see different base terrain, and shared seeds reproduce the wrong world. | mitigation: ESLint ban in core/gen, mesh and edits; golden-hash tests; convention of bumping the generator version.
- (medium) Griefing: anyone holding the link can overwrite or wipe the world, and LWW cannot prevent it. | impact: Data loss in shared worlds. | mitigation: High-entropy codes; the privacy and trust notice states the link is a capability; periodic local snapshots and export. Signed edits and read-only invites are post-MVP.
- (medium) Swept-ellipsoid collision on relaxed meshes jitters or tunnels at chunk edges or near pinned sharp blocks. | impact: The player gets stuck or falls through the world. | mitigation: Collision uses the same watertight quantized meshes; grid push-out safety net; unit tests with canned meshes; clamp the maximum step size.
- (low) A Helia loader or gateway serves JS with the wrong MIME type, or a service-worker scope conflict appears. | impact: The page stays blank on IPFS. | mitigation: Extension allowlist mirroring verified-fetch; strict local server using the same MIME map; post-publish smoke test on inbrowser.link; the app registers no service worker; static HTML fallback message.
- (medium) Building a bespoke renderer instead of three.js takes longer than planned. | impact: Schedule slip in M2. | mitigation: Strict scope (one opaque terrain pipeline, sky, overlay, avatars); wgpu-matrix and webgpu-utils; three.js with a guarded init stays a documented fallback because the core does not depend on the renderer.
- (low) Storage eviction or tab discard loses recent edits. | impact: Recent building is lost. | mitigation: 1 s write-behind, flush on visibilitychange, storage.persist(), export reminders.
- (medium) Chrome WebGPU is off by default on common 'recent laptops' (AMD on Linux, Snapdragon Windows ARM64). | impact: Target users see the unavailable message. | mitigation: Say so in the README and the message text (flags, supported platforms); choose the acceptance hardware accordingly.

## Requirement conflicts
- [major] 'Peer-to-peer: players connect directly' + 'No game server run by me' + 'fully static site' + 'No secrets, API keys' vs. Acceptance 'Two browsers on different machines can join the same world': WebRTC always needs a signaling rendezvous, which must be third-party here. Some NAT pairs can only connect through TURN, and the free public TURN option now requires an API key (verified). Connectivity cannot be guaranteed. → Name the dependencies (Nostr relays, BitTorrent trackers, Google and Cloudflare STUN) and bound them: configurable lists, relay hints in links, bring-your-own TURN entered locally, manual SDP mode later. Rewrite the acceptance to name network conditions: different consumer NATs that are not both symmetric or CGNAT, plus a LAN case.
- [major] 'Players can join a shared world via a link or code' + 'No game server run by me': A link can't carry a world's edits if no peer holding them is online. A code carries even less: the joiner does not get the seed until a peer answers. → Treat link and code as a rendezvous, not a copy. The link carries seed and generator so play can start at once, and edits merge when a holder comes online (CRDT). Asynchronous sharing uses an export file, or an optional snapshot link when compressed edits are 8 KB or less.
- [major] 'Must work when served from IPFS, including through gateway subpaths (/ipfs/<CID>/)' vs. 'Worlds save locally in the browser and survive reloads': Path gateways share one origin across all IPFS content, so any other site on the gateway can read or delete Amorfus's IndexedDB (verified). Subdomain gateways, including inbrowser.link where ipfs.io and dweb.link now redirect, give each CID its own origin, so every new release opens with empty storage. → Guarantee 'survives reloads' per origin, and state that release upgrades need a stable origin (amorf.us, or the DNSLink name amorf-us.ipns.<gateway>) or export and import. Show the storage origin in the UI and warn on path gateways.
- [major] 'Rendering via WebGPU' + 'Targets current desktop Chrome and Edge' + '60 fps on ... integrated GPU on a recent laptop': Chrome keeps WebGPU behind a flag on Windows ARM64 (Snapdragon laptops) and on Linux GPUs other than Intel Gen12+ and NVIDIA-on-Wayland (verified). Some 'recent laptop iGPUs' therefore get the unavailable message instead. → Define the reference hardware as a Windows x64 or macOS laptop with Intel Arc/Iris Xe or Radeon 780M on current stable Chrome/Edge. Document the flagged platforms in the README and in the message.
- [major] '60 fps on mid-range hardware ... at a reasonable default view distance' and Acceptance 'at 60 fps on the target hardware': Not testable as written. The hardware, resolution, DPR, view distance, scenario, metric and tool are all undefined. A 120 Hz display also changes what the frame loop does. → Agree docs/acceptance.md before M2: reference machine; 1080p at render scale 1.0; R_h = 6 chunks; a scripted 60 s walk, fly and edit run; p95 frame time ≤ 16.7 ms, p99 ≤ 25 ms, edit-to-visible p95 ≤ 50 ms; in-app recorder; plugged in.
- [major] 'Conflicting edits resolve deterministically so all peers end up with the same world' + IPFS immutable builds / amorf.us updates: Peers on different builds may use different generators or wire formats and diverge silently. 'Same world' is also ambiguous: meshes can legitimately differ across mesher versions. → Define 'same world' as identical block state, shown as an equal world hash. Freeze a generator version per world, handshake on protocol version with a readable refusal, and build links from location so IPFS links pin the build.
- [major] 'Procedurally generated terrain' + 'A world can be shared as a seed plus edits': Seed-plus-edits only works if generation is bit-exact on every machine. JS transcendental functions and ** are implementation-approximated (verified), and WGSL allows reassociation and fusion (verified), so GPU or Math.sin-based noise can differ between machines. → CPU-only generator restricted to exactly rounded operations and Math.imul hashing, enforced by a lint ban and golden-hash tests in the gate.
- [minor] 'Must work ... through gateway subpaths (/ipfs/<CID>/)' as an acceptance path on public gateways: Since May 2026, public ipfs.io and dweb.link redirect browser navigations to inbrowser.link in subdomain mode, so public path mode no longer exists for browsers. Path mode survives on local Kubo at 127.0.0.1 and on private gateways. → Name the acceptance gateways: Kubo path mode (http://127.0.0.1:8080/ipfs/<CID>/), Kubo subdomain mode (localhost), and inbrowser.link. Emulate path mode in the automated gate with a strict server mounted at /ipfs/<CID>/.
- [minor] 'Must work ... in Helia-based loaders': Vague. Loaders differ in MIME handling and service-worker ownership. verified-fetch maps MIME types by extension and falls back to octet-stream, and module scripts need a JS MIME type. → Define the supported loader as the ipfs/service-worker-gateway (inbrowser.link) with verified-fetch's default parser. Emit only allowlisted extensions and never register an app service worker.
- [minor] 'Edits reshape the smoothed surface immediately, with no visible seams' vs. 'Terrain generation and smoothing must not stall the frame loop': Worker meshing adds latency, so 'immediately' needs a number. Edits near chunk borders dirty up to 8 chunks, and swapping them one by one produces transient seams. → Define immediately as edit-to-visible p95 ≤ 50 ms (about 3 frames). Edit transactions are prioritized and all affected chunks are swapped atomically in one frame.
- [minor] 'Blocks adjust to their neighbors ... smooth surfaces' vs. 'easy to edit block by block': The visible surface lies up to half a block off the grid, so grid picking and collision mismatch what the player sees. Some smoothing methods, such as density blur, erase single blocks. → Constrained Surface Nets keep every block's surface. Each quad maps to its (solid, air) cell for exact picking, a cube outline shows the target, and collision runs against the rendered mesh.
- [minor] 'A player can also choose to keep a block sharp' + smooth neighbors: Sharp and smooth blocks cannot meet without a transition. Pinning makes the smooth neighbors within one block of a sharp block partly boxy. → Accept the one-block transition zone as intended (walls sit flush on terrain) and document it; the owner should confirm.
- [minor] Acceptance 'Opening that folder over a local static server' + 'Two browsers on different machines' + 'Rendering via WebGPU': A second machine loading the build over http://<LAN-IP> is not a secure context, so it has neither WebGPU nor crypto.subtle (needed by Trystero). vite preview's SPA fallback also hides broken paths. → Cross-machine tests use https (amorf.us or inbrowser.link), each machine's own localhost, or a dev:lan server with basic-ssl. The gate uses a strict static server with no fallback.
- [minor] 'No secrets, API keys, or tracking' + hosting on Cloudflare + P2P: Cloudflare zone Web Analytics automatic setup would inject a beacon (verified). WebRTC exposes public IPs to peers and STUN servers, and relays see IPs and room hashes, which is third-party exposure users should be told about. → Keep Web Analytics off and add a post-deploy check that grep-fails on cloudflareinsights. Add a privacy notice before host or join plus a README privacy section. Bring-your-own TURN credentials stay local and never go in the repo or links.
- [minor] 'Supports at least 4 simultaneous players' + full-mesh P2P: Not a conflict at 4 players (6 connections). A full mesh scales quadratically, so the upper bound must be stated. → Cap rooms at 8 players (28 connections). A relay or gossip topology is post-MVP.
- [minor] 'Automated tests for the non-rendering core' + owner norm 'every project has a build-blocking check' + 'Rendering via WebGPU': Headless WebGPU in the owner's WSL2 or CI may not get an adapter, which creates pressure to make the render smoke test optional. → An M0 spike must prove headless WebGPU with SwiftShader or Vulkan flags, or run Playwright against Windows Chrome. The gate never skips the render assertion; the performance acceptance stays a documented manual protocol.
- [minor] 'Mobile and touch controls' out of scope vs. Chrome Android shipping WebGPU: Mobile visitors will load a playable-looking page that has no controls. → Detect no fine pointer or no keyboard (pointer: coarse) and show a 'desktop keyboard and mouse required' notice; spectating is allowed.
- [minor] 'Build output is a single folder that can be pinned as-is' + 'Source lives in the amorfus GitHub repo' + bundled MIT libraries and texture assets: The repo has no LICENSE. MIT dependencies require their notices to ship with the build. Vite's default license output goes in the hidden .vite/ folder, which ipfs add skips. → The owner picks a project license. Set build.license fileName to THIRD-PARTY-LICENSES.md at the dist root, use CC0-only textures (ambientCG or Poly Haven) with a provenance file, and have the gate verify both.

## Third-party deps
- Nostr public relays (pinned subset of Trystero 0.25.4 defaults, e.g. nos.lol, purplerelay.com, relay.mostr.pub) (Various independent relay operators) runtime: Default WebRTC signaling rendezvous | sees: Client IP, WebSocket connection timing, room topic hash, AES-GCM-encrypted SDP payloads
- BitTorrent WebSocket trackers (tracker.webtorrent.dev, tracker.openwebtorrent.com, tracker.btorrent.xyz, open.ftorrent.com) (Independent tracker operators) runtime: Fallback signaling strategy | sees: Client IP, info-hash derived from the room, encrypted SDP, timing
- Google STUN (stun.l.google.com:19302, stun1 and stun2.l.google.com:19302) (Google) runtime: ICE server-reflexive address discovery (Trystero default) | sees: Client public IP and port and binding request timing
- Cloudflare STUN (stun.cloudflare.com:3478) (Cloudflare) runtime: ICE server-reflexive address discovery (Trystero default) | sees: Client public IP and port
- User-supplied TURN server (optional) (Whoever the user configures) runtime: Relay for NAT pairs that cannot connect directly | sees: Client IP and all relayed (DTLS-encrypted) game traffic volumes
- Other peers in the room (Other players) runtime: Direct P2P game traffic | sees: Public IP (srflx candidates), display name, color, position stream, all edits and world seed
- Cloudflare Workers static assets (amorf.us) (Cloudflare) runtime: HTTPS hosting of the static build | sees: Standard HTTP request logs for page and asset loads (no app telemetry)
- inbrowser.link Service Worker Gateway (and ipfs.io/dweb.link redirects to it) (Interplanetary Shipyard / IPFS Foundation) runtime: IPFS delivery path for browsers | sees: Requests for the CID and its files
- delegated-ipfs.dev and trustless-gateway.net (Interplanetary Shipyard) runtime: Content routing, DNSLink resolution and block retrieval for the service-worker gateway | sees: CIDs and DNSLink names requested, client IP
- IPFS pinning provider or self-hosted Kubo (Owner's choice) publish-time: Keeps the published CID retrievable | sees: The build artifacts (public anyway)
- Trystero (@trystero-p2p/core, nostr, torrent) + @noble/secp256k1 (dmotz (MIT); paulmillr (MIT)) build-time: Bundled P2P library | sees: Nothing at build time; bundled code runs client-side
- wgpu-matrix, webgpu-utils (optional) (greggman (MIT)) build-time: Bundled math and WebGPU helpers | sees: Nothing
- npm registry toolchain: Vite/Rolldown, TypeScript, vitest, fast-check, ESLint, typescript-eslint, Playwright (+ browser download), @axe-core/playwright, ipfs-car, wrangler (npm Inc. and respective maintainers; Microsoft (Playwright browsers CDN)) build-time: Build, test, publish | sees: Install requests from the developer machine
- ambientCG / Poly Haven textures (CC0) (ambientCG; Poly Haven) build-time: Material textures, committed to repo after downscaling | sees: One-time download by the developer

## Test ideas
- Golden generator hashes: SHA-256 of the voxels for 16 fixed chunks under 3 seeds must equal committed values, and any change requires a new generator version.
- Chunked equals monolithic: mesh a 2×2×2 block of chunks as one 64³ region and as 8 separate chunks with aprons. Positions, normals, AO and material weights for every dual cell must be bit-identical.
- An isolated single block, a 1-voxel-thick wall and a diagonal pair each produce closed, non-empty meshes.
- Sharp pinning: a SHARP block surrounded by air renders as exactly 6 axis-aligned unit squares at integer coordinates with axis normals.
- Pick table: for random rays that hit the mesh, the removal cell is solid, the placement cell is air, and the two are face-adjacent.
- LWW merge laws with fast-check: commutativity, associativity and idempotence over random record sets.
- Convergence simulation: N = 2 to 8 simulated peers with random concurrent edits and random delay, reorder, duplication and loss, then anti-entropy. All world hashes must be equal.
- Protocol: HELLO refuses on a protocol major mismatch, an unknown generator or a different worldId, with the expected reason code. Codec round-trips hold for all message types.
- Export/import: round-trip equality; a flipped bit fails the SHA-256 check; a decompression bomb aborts at the size cap; unknown material IDs survive.
- Determinism lint: a fixture file under core/gen that uses Math.sin or ** fails ESLint.
- verify-dist: plant an absolute '/assets' URL, a hidden file, an unknown extension and a missing license entry in turn, and each one must fail.
- Playwright on the strict server at both '/' and '/ipfs/bafy…/': no console errors, no 404s, no non-loopback requests at boot, and non-blank canvas pixels.
- Playwright with WebGPU disabled: the static message is visible and names the reason, focus lands on the heading, axe reports zero violations, and there is no blank page.
- Playwright with an insecure-context simulation (served on a non-localhost http hostname): the 'needs HTTPS or localhost' variant appears.
- Two pages joined by a BroadcastChannel loopback transport make conflicting edits on the same cells; their world hashes become equal within 2 s.
- Four pages join one room, positions interpolate, and one peer leaving and rejoining resyncs through anti-entropy.
- Collision: sweep an ellipsoid across canned meshes (slope, chunk corner, sharp wall next to a smooth ramp); it never ends inside solid cells and never jitters above epsilon when at rest.
- Edit transaction: an edit at a chunk corner dirties exactly the 8 expected chunks, and the renderer swaps all of them in the same frame (no mixed old and new generations).
- Performance protocol (manual, outside the gate): the scripted 60 s scenario on the reference machine records p95 and p99 frame time and edit latency into a committed report.
- Post-publish smoke test (outside the gate): Playwright opens https://inbrowser.link/ipfs/<CID>/ and the DNSLink name and asserts renderer-ready.
- Build reproducibility: two clean builds from the same commit produce the same ipfs-car root CID.

## Milestone notes
Order matters because each milestone retires the next risk first. Timings are rough estimates.

**M0: Scaffold and gate (1 to 2 days).**
- Set up Vite, TypeScript 6.0, vitest, ESLint (including the determinism ban), Playwright, scripts/serve-strict.mjs and scripts/verify-dist.mjs.
- Build index.html with the accessible static message and the full WebGPU detection ladder, and render a cleared WebGPU frame.
- Add wrangler.jsonc, a LICENSE (the owner decides which), and a README skeleton.
- Spike: prove headless WebGPU works in the owner's environment.
- Exit criteria:
  - `npm run check` is green.
  - A throwaway CID loads at 127.0.0.1:8080/ipfs/, at localhost in subdomain mode, and on inbrowser.link.
  - A preview deploys to Workers.

**M1: Deterministic core (pure TypeScript, Node-tested).**
- World model, generator terrain@1 with golden hashes, and constrained Surface Nets with pinning, normals, AO, weights and the pick table.
- Tests: chunked equals monolithic, isolated single block, and the performance benchmark (target ≤ 8 ms per 43³ job).
- A debug viewer that renders single meshes.
- Exit criteria: the owner approves how smoothing looks from screenshots; benchmarks are within budget.

**M2: Streaming renderer.**
- Worker pool, priority queue, arenas, triplanar textures (CC0 plus provenance), lighting, AO, fog, culling, and a frame-time recorder.
- Exit criteria: the agreed acceptance scenario runs at 60 fps on the reference machine, and the default view distance is fixed from those measurements.

**M3: Player and editing.**
- Pointer lock, movement and fly, Fauerby collision, quad-based picking with the outline, place and remove, and the sharp toggle.
- Atomic multi-chunk edit transactions.
- Exit criteria: edit-to-visible p95 ≤ 50 ms and no transient seams.

**M4: Persistence.**
- IndexedDB, autosave, the world list with the storage origin shown, storage.persist, the .amorfus export and import with round-trip and corruption tests, and Web Locks.

**M5: Multiplayer.**
- Transport interface and loopback transport, the LWW CRDT with property tests, anti-entropy, the HELLO and version handshake, and Trystero Nostr with torrent fallback.
- Join link and code, the unreliable position channel, avatars, the privacy notice, and bring-your-own TURN settings.
- Exit criteria:
  - The e2e loopback convergence test is in the gate.
  - A manual two-machine test on different networks passes.
  - Four peers work.

**M6: Release hardening.**
- Accessibility pass (axe in the gate), README (run, build, publish to IPFS, privacy), THIRD-PARTY-LICENSES check, and a run of the acceptance protocol.
- Publish the CAR, set up DNSLink, deploy to amorf.us, and start RELEASES.md.

**Can be deferred past the MVP:**
- LOD and Transvoxel for far terrain.
- Shadow maps and a day/night cycle.
- Water and other transparent blocks.
- More than 8 materials.
- Undo.
- Manual SDP (no-signaling) mode. It is designed in at M5 but can ship later.
- Signed edits, read-only invites, relay/gossip topologies beyond 8 players, key remapping, audio, mobile, and render bundles or indirect drawing.

**Cannot be deferred:** the check gate, version handshake, golden generator tests, the accessible unavailable message, the privacy notice, and license notices.

## Open questions
- Which project license should Amorfus use? It must be decided in M0, before any third-party notice work.
- What is the reference machine for the 60 fps acceptance, and which OS? On Linux, Chrome enables WebGPU by default only on Intel Gen12+ and NVIDIA on Wayland.
- Does the owner accept this default set of third-party dependencies: Nostr relays as default signaling, BitTorrent trackers as fallback, and both Google and Cloudflare STUN? Or should it be Cloudflare STUN only?
- Should the manual copy-paste SDP mode, which needs no signaling at all, be MVP scope or post-MVP?
- Trust model: is 'anyone holding the link can edit or wipe the world' acceptable for the MVP?
- How long should the join code be? The recommendation is 20 base32 characters (100 bits); something shorter is easier to type but guessable by relay operators.
- Renderer: raw WebGPU as recommended, or three.js r186 with a guarded init?
- Can headless WebGPU (SwiftShader or Vulkan flags) run under the owner's WSL2, or should the Playwright stage drive Windows Chrome?
- Should DNSLink (_dnslink.amorf.us) be set up so IPFS users get a stable storage origin across releases?
- What is the default view distance? The proposal is 6 chunks (192 m), to be fixed by M2 measurements.
- Is the one-block transition zone around sharp blocks the intended look?
- Should a GitHub Actions workflow also run npm run check, or does the gate stay local-only like the owner's other sites?
- vitest ^4.1 or 5.0 (three weeks old)?
- Is a 404.html needed at all for a single-page app on Workers static assets (the owner's convention is not_found_handling '404-page')?