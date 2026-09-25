# persistence: Persistence format and browser storage (IndexedDB/OPFS, export, IPFS origin model)

## Recommendation

## Evidence base
**Read:** REQUIREMENTS.md, as relayed in the task text; private owner material (not described here); a grep of the owner's other repos' package manifests (none uses IndexedDB, idb, Dexie or any other browser-storage library, so this area has no house precedent); the ipfs/service-worker-gateway source (cloned at commit c72ec3c, 2026-09-22).

**Probed live on 2026-09-24 UTC with curl and DoH:** ipfs.io, dweb.link, inbrowser.link, 4everland, Pinata, w3s/storacha/nftstorage, cloudflare-ipfs.com, amorf.us DNS.

**Measured:** export sizes, using a synthetic generator plus Node 22 zlib and CompressionStream. Everything else is marked as inference.

## 0. The ground moved on 2026-09-21. Read this first
- **ipfs.io and dweb.link are retired for programmatic use.** They return HTTP 429 with `sunset: Mon, 21 Sep 2026` and "This IPFS gateway is switching to a service worker gateway only". Browser navigations are redirected to the Service Worker Gateway at **inbrowser.link**. I verified `<cid>.ipfs.dweb.link` → 302 → `<cid>.ipfs.inbrowser.link`. That gateway is **subdomain-only**, which makes every CID its own origin.
- **Shipyard stops its IPFS work on 2026-09-30.** This covers ipfs.io, dweb.link, delegated-ipfs.dev, the bootstrap nodes, Helia and the SW gateway. inbrowser.link is moving to the IPFS Foundation: two new maintainers were named on 2026-09-22. Its deployments are blocked while the Cloudflare account migrates.
- **Other public gateways:**
  - Pinata's public gateway refuses HTML.
  - cloudflare-ipfs.com no longer resolves.
  - w3s.link and storacha.link redirect to dweb.link.
  - 4everland.io redirects path requests to the subdomain form. ipfs.4everland.io still serves the path form.
- **Result:** the origin a user actually runs Amorfus under is now mostly a per-CID subdomain origin. Path-gateway origins now mostly mean a local kubo (`127.0.0.1:8080`) or a self-hosted gateway.

## 1. Storage engine: IndexedDB, via `idb` (8.0.3, about 1.2 kB brotli)
**Why not OPFS:**
- OPFS has the same origin, quota and eviction model, so it does not help with the IPFS origin problem.
- Its fast path, `createSyncAccessHandle`, only works in dedicated workers.
- It has no transactions, and I would have to write my own file format plus locking.
- Its speed advantage shows up with large files or datasets over 10k documents. The workload here is small per-chunk blobs: median about 0.5 KB, p95 about 2.6 KB, max about 6 KB for 32³ chunks at 1e5 clustered edits (measured).

Hand-rolling a wrapper is also acceptable, at roughly 60 lines. Dexie is more than this needs.

**Never use Cache Storage for world data.** On activation, the SW gateway deletes every cache it does not own (verified in `sw.ts`). Never use localStorage for world data either.

**Database `amorfus`, schema version 1.** Use the same name on every origin. Do not namespace it by CID: that would stop path-gateway and amorf.us releases from seeing earlier saves, and it adds no security.

| store | key | value |
|---|---|---|
| `worlds` | `id` (128-bit random, base32) | `{id, lineageId, name, created, modified, seed: string, generator:{id, version}, chunkSize:32, materials: string[], peers: string[], lamport, status:'ready'｜'importing', stats}` |
| `chunks` | `[worldId, cx, cy, cz]` (array key) | `Uint8Array` chunk blob, codec below |
| `players` | `[worldId, peerId]` | position, yaw/pitch, fly flag, selected material |
| `kv` | string | `device` (local peerId), settings, last world |

- **Range per world:** `IDBKeyRange.bound([id], [id, []])`. Arrays sort after numbers, so this covers every chunk key for the world. Deleting a world is one `delete(range)`.
- **Schema migrations:** stepwise `upgrade(db, oldVersion)`.
- **Chunk migrations:** each chunk blob starts with its own codec version and is migrated lazily on read. This avoids one huge upgrade transaction.

### Chunk blob codec v1
Used for both IndexedDB and export files. Little-endian. Varints are LEB128 and `zz` means zigzag.

```
u8 codec=1 | varint n | varint baseLamport
n×varint dLamport | n×varint peerIdx | n×zz dIndex | n×u8 value
```

- Entries are sorted by `(lamport, peerId, index)`, not by index. My measurements show this keeps the per-voxel stamps nearly free: 1e5 clustered edits come to 29 KiB gzip, against 247 KiB when sorted by index with stamps.
- `index = (y*CS + z)*CS + x`.
- `value`: bits 0–6 are a material index into `world.materials` (0 = air, meaning removal), and bit 7 is the "sharp" flag.
- A voxel appears at most once, holding the last-writer-wins winner.
- `peerIdx` indexes a per-replica peer table. Any conflict comparison must use the peerId **string**, not the index.
- Ordering is canonical, so identical states produce identical bytes. That makes a cheap world-state hash available to the sync area's convergence tests.

**Write path.**
- Persistence runs in the same worker that owns the world state (IndexedDB works in dedicated workers).
- Edits mark chunks dirty. A flush happens after 1.5 s idle, 5 s at most, and on `visibilitychange→hidden` and `pagehide`.
- Each flush is one readwrite transaction over `chunks` and `worlds`.
- Use the default durability (Chrome ≥121 defaults to relaxed, and strict was 10x+ slower on Chrome's own benchmark). Use `durability:'strict'` only for the import commit and for delete.

**Read path.**
- On world open, `getAllKeys(range)` gives a Set of edited chunks (732 keys for 1e5 clustered edits).
- A blob is fetched only when a chunk that is in that Set gets generated. Decoded edit lists go in an LRU cache.

**Concurrency.**
- `navigator.locks.request('amorfus:world:'+id, {ifAvailable:true})`. A second tab gets "open in another tab" with a take-over option (`steal`).
- On `versionchange`: close the DB and show "Amorfus was updated in another tab, reload".
- If `open()` fails with `VersionError` (an older release opening a newer schema, which is realistic behind DNSLink or CDN caching and on shared path gateways), show: "Saves here were written by a newer Amorfus. Open amorf.us."

**Crash-safe import.** Write into a new worldId with `status:'importing'`, in batches of about 500 chunks per transaction, then flip to `'ready'`. At startup, delete any world still marked importing.

## 2. Quota, eviction, persist()
- **Chrome limits:** best-effort by default. One origin can use up to 60% of total disk, and all origins together up to 80%. Under storage pressure Chrome evicts whole origins in least-recently-used order, skipping persistent ones.
- **persist() is silent.** Chrome grants or denies it without a prompt, based on engagement, bookmarks, installation and notification permission.
- **Fresh CID origins have zero engagement**, so expect persist() to be denied there. This is an inference.
- **When to call it:** after the first world is created or first saved, not on page load.
- **What to show:** the status in the world menu, either "Protected from automatic cleanup" or "The browser may clear this if disk space runs low. Export to keep a copy". Also show `estimate()` usage.
- **Secure context:** `navigator.storage` is `[SecureContext]`, the same as WebGPU.
- **What persistence does not survive:** the user clearing site data, clear-on-exit settings, and incognito.

## 3. The origin problem: classify at startup and behave accordingly
`classifyOrigin(location, idbProbe)` is a pure function with unit tests:

| kind | detection | survives reload | survives a new release | isolation | behaviour |
|---|---|---|---|---|---|
| `stable` | host `amorf.us`; `/^amorf-us\.ipns\./` (DNSLink via inbrowser.link or kubo `localhost`); dev localhost | yes | yes | own origin | normal |
| `release-pinned` | `/^b[a-z2-7]{50,}\.ipfs\./` (inbrowser.link, 4everland.io, kubo `*.ipfs.localhost`) | yes | **no**: each CID is a new, empty origin, and old saves stay behind at the old URL | own origin (per-site on inbrowser.link and dweb.link through the PSL; 4everland is not on the PSL) | banner: "Pinned release: saves stay with this version. Use amorf.us, or Export." Offers the handoff (§5). |
| `shared-gateway` | `location.pathname` starts `/ipfs/` or `/ipns/` (kubo `127.0.0.1:8080`, ipfs.4everland.io, self-hosted) | yes | yes | **none**: every site on that gateway can read, alter or delete the `amorfus` DB | banner warning. Treat every IndexedDB read as untrusted and run it through the import validator. Never store keys or secrets. |
| `no-storage` | `origin==='null'` or `indexedDB.open` throws `SecurityError` (sandboxed-iframe or srcdoc Helia loaders) | **no** | no | n/a | session-only mode with a persistent "Export to keep your world" prompt |
| third-party iframe | embedded cross-site | yes, but partitioned by top-level site (Chrome 115+) | per embedder | partitioned | works, but saves are separate from first-party amorf.us. Do not rely on the Storage Access API. |

**Stable-origin strategy.**
1. `https://amorf.us` on Workers static assets is the primary origin.
2. On each release, publish `_dnslink.amorf.us TXT "dnslink=/ipfs/<CID>"`. amorf.us is on Cloudflare NS today, with no A record and no `_dnslink` yet. This gives stable IPFS-native origins: `amorf-us.ipns.inbrowser.link` (resolved over DoH through delegated-ipfs.dev) and `amorf-us.ipns.localhost:8080` (kubo).
3. CID URLs are for verification and archiving.

Each of these origins is a separate save set. Export and import is how worlds move between them.

**SW-gateway specifics** (verified in source):
- The gateway keeps its own IndexedDB databases on the same origin (`helia-sw-unique`, `/@helia/service-worker-gateway/{data,blocks}`). The IPFS blockstore therefore shares Amorfus's quota and eviction fate.
- It registers `/ipfs-sw-sw.js` at the origin root, so the app cannot have its own service worker there.
- It sets no COOP or COEP, so there is no SharedArrayBuffer and no cross-origin isolation.

## 4. Export and import file (`.amorfus`)

### Format
Uncompressed 16-byte preamble, so the file can be identified without decompressing:

```
0  8  magic 41 4D 4F 52 46 55 53 1A ("AMORFUS"+0x1A)
8  2  u16 formatMajor=1 | 10 2 u16 formatMinor=0
12 1  u8 compression (1=gzip, 0=none for tests) | 13 1 u8 profile (0=backup, 1=share) | 14 2 reserved=0
16 .. body: ONE gzip member (the spec allows only one; CRC32 and ISIZE are checked by DecompressionStream)
body := section* ; section := tag[4 ASCII] u32 len payload
```

- **Tag rule (PNG-style):** an uppercase first letter means critical, so reject the file if the tag is unknown. Lowercase means ancillary, so skip it.
- **`META` comes first:** UTF-8 JSON, at most 64 KiB, containing:
  - `worldId, lineageId, name, created, modified, appVersion`
  - `seed` (string), `generator:{id, version}`, `chunkSize`
  - `materials[]`, `peers[]`, `lamport`, `stats`
- **`CHNK`:** `varint count`, then per chunk `zz dcx, zz dcy, zz dcz` (chunks sorted by key) plus `varint len` plus the codec-v1 blob. The blob is byte-identical to the IndexedDB value.
- **`plyr`:** player state, in backup files only. **`thmb`:** optional PNG thumbnail.
- **`END `:** zero-length terminator.

### Compression
Use **gzip**. Chrome's CompressionStream supports gzip and deflate (since Chrome 80) and deflate-raw (since 103). It does **not** support brotli or zstd: browser-compat-data lists Chrome as `false` for both, even though brotli is in the spec. Brotli would save only about 15%, not enough to justify bundling a codec.

### Size for 1e5 edits (measured on synthetic data)
| edit pattern | gzip size |
|---|---|
| clustered building (walls, tunnels, sculpting), no stamps | ≈19–23 KiB |
| clustered building, with Lamport and peer stamps in Lamport order | ≈29 KiB |
| worst case, uniformly scattered, with stamps | ≈0.5 MiB |
| naive JSON, for comparison | 410 KiB gzip (2.3 MiB raw) |

### Save
- Build the file in the worker.
- If `showSaveFilePicker` exists (Chrome/Edge 86+), is in a top-level context and has user activation, use it with suggested name `<slug>-<yyyymmdd>.amorfus`.
- Otherwise use a Blob, `URL.createObjectURL` and `<a download>`, revoking the URL after about 60 s.

### Load
1. Take the file from `<input type=file accept=".amorfus">` or drag-and-drop.
2. Check the magic bytes and the major version. For a newer major version, show "made by a newer Amorfus".
3. Stream the body through `DecompressionStream('gzip')` and then a size-capping TransformStream: at most 256 MiB, or 64× the compressed size.
4. Parse strictly:
   - varints at most 10 bytes
   - META at most 64 KiB
   - n ≤ CS³ entries per chunk, indices < CS³ and unique within a chunk
   - material index < `materials.length` and at most 128 materials
   - `peerIdx` < `peers.length`, Lamport values ≤ 2^53−1
   - no duplicate chunk keys, and coordinates inside world bounds
5. Map material **names** to local IDs, and re-bucket chunks if `chunkSize` differs.
6. Stage the write with the `importing` flag (§1).

MVP import always creates a **new world** (a fork that keeps `lineageId`). If the worldId already exists, ask "Replace or keep both". Merging two copies of a world is deferred past MVP; the stamps in the file keep that option open.

### Sharing as seed plus edits
The share profile is this same container without `plyr` or `thmb`. `seed` plus `generator.version` plus `CHNK` is the whole requirement, and no geometry is ever stored.

### Pinning the generator (makes "old seeds work forever" hold)
- `generator:{id, version}` is stored per world. Every generator version ever shipped stays in `src/worldgen/vN/`, frozen.
- The authoritative density and material field is computed on the **CPU**, using only IEEE-exact operations: `+ - * /`, `Math.sqrt`, `Math.floor`, `Math.imul`, `Math.fround`, and integer hashing.
- ECMA-262 leaves `Math.sin`, `Math.cos`, `Math.exp`, `Math.pow` and `Math.log` implementation-approximated. Ban them in `src/worldgen/**` with an ESLint `no-restricted-properties` rule.
- GPU-side generation may only produce derived, visual-only output.
- `npm run check` compares golden hashes of generated chunks, for fixed seeds and coordinates, for **every** generator version. The string-to-seed hash is part of the generator spec.

## 5. Handoff to carry worlds into a new release (a sender and receiver of about 150 lines; ship the sender in the MVP)
The problem: a pinned release cannot read saves held by the previous CID's origin.

**Receiver.** It appears only when the origin is `release-pinned`.
1. The receiver lists previous release CIDs from a `releases.json` embedded at build time.
2. It works out the old origin by swapping the CID label in the current hostname.
3. It calls `window.open(old + '/#amorfus-handoff=<nonce>&to=<encoded origin>')`.

**Sender.** It is present in every release.
1. It checks for the handoff fragment and a `window.opener`.
2. It shows a confirmation naming the destination origin.
3. It sends `opener.postMessage({type:'amorfus-handoff/v1', nonce, files:[ArrayBuffer…]}, to, transfer)`. The files are the normal export bytes.

The receiver checks `event.origin` and the nonce, then imports each file through the normal importer.

**Why a popup:** a popup is a top-level context, so its storage is not partitioned. An iframe would see an empty partition, because `*.inbrowser.link` is on the PSL and so each CID is its own site.

**Constraints:**
- Neither page may send `Cross-Origin-Opener-Policy: same-origin`. inbrowser.link sends none; do not add it on amorf.us.
- A release that shipped without the sender can only hand off by file export. That is why the sender belongs in the MVP.

## 6. Sharing by URL fragment (optional, after the MVP)
Use `#w=` plus base64url(deflate-raw(share body) plus CRC32). Keep `w=` separate from the P2P join key (for example `j=`).

**Length limits:**
- Chrome caps URLs at 2 MB and displays at most 32 kB in the address bar.
- Discord allows 2,000 characters (4,000 with Nitro). Slack recommends at most 4,000 and truncates past 40,000.
- A version-40-L QR code holds 2,953 bytes at most. In practice, a scannable QR code means about 1,000 characters or fewer.

**Policy:**
- Up to 2,000 characters: offer the link.
- 2,000–8,000: offer the link with a warning.
- Over 8,000: file only.

About 5,000 clustered edits fit in 2,000 characters (1e4 clustered edits come to 3,688 characters). Only about 300 scattered edits fit.

`Uint8Array.toBase64` needs Chrome 140+ or Node 25+, so add a fallback helper for Node 22 tests. The SW gateway leaves `location.hash` intact on the client (it strips it only from the SW request URL), but it strips a bare `#/`.

## 7. Iframe embedding
Chrome 115+ partitions IndexedDB, OPFS, Cache Storage, localStorage, BroadcastChannel, Web Locks and service workers by (top-level site, origin, ancestor bit). An embedded Amorfus gets saves specific to that embedding site.

The Storage Access API extension for non-cookie storage (shipped in Chrome 125) could unpartition storage, but it needs a user gesture and prior top-level interaction. Do not design around it: detect the partitioned case and point to Export.

`showSaveFilePicker` may be unavailable in cross-origin frames, so fall back to `<a download>`. The frame restriction is unverified.

## 8. What `npm run check` enforces
- Codec round-trip tests plus golden fixtures for every released format version.
- Generator golden hashes.
- The lint ban on implementation-approximated Math in `src/worldgen/`.
- A lint ban on `caches.` and `localStorage` in `src/`.
- Migration tests on fake-indexeddb.

## Hypothesis verdict

The hypothesis gets the core choices right: IndexedDB over OPFS, packed per-chunk binary blobs keyed by world and chunk, a gzip binary file with magic bytes and a version, Blob download with showSaveFilePicker where available, and sharing through the same file. It is wrong or weak in these places:

1. **It treats the origin as a given.** Since 2026-09-21, IPFS traffic in browsers lands on per-CID subdomain origins (inbrowser.link). Saves do not carry over between releases there, persist() is likely denied, and sandboxed Helia loaders get no storage at all. On the remaining path gateways the storage is shared with, and can be altered by, every other site on the gateway. The plan needs:
   - an origin classifier
   - amorf.us plus DNSLink as stable origins
   - untrusted-read validation
   - a mode with no storage
   - a cross-release handoff
2. **The magic bytes must sit outside the gzip body.** With the whole file compressed, it starts with 1f 8b.
3. **Sorting edits "by chunk" is not enough.** Inside a chunk they must be ordered by Lamport time, not by index, or the per-voxel stamps cost 10x (29 KiB against 247 KiB per 1e5 edits).
4. **The world record is missing fields.** It needs a materials table (names, not IDs), chunkSize, lineageId, a status flag for crash-safe import, and a peers table. The seed must be a string.
5. **generatorVersion pinning is not enough by itself.** It also needs deterministic CPU-only math (no Math.sin, exp or pow), all old versions shipped permanently, and golden-hash gates.
6. **persist() is silent and heuristic.** Surface its status instead of relying on it.
7. **URL-fragment sharing only works for very small worlds.** About 5k clustered edits fit in 2,000 characters. Make it optional, with automatic fallback to the file.
8. **Missing pieces:** Web Locks for multiple tabs, versionchange and downgrade (VersionError) handling, flush-on-pagehide, decompression-bomb caps, and never using Cache Storage (the SW gateway deletes unknown caches).

## Key decisions
- **Browser storage engine** → IndexedDB via the idb 8.0.3 wrapper (or a hand-rolled wrapper of about 60 lines); one DB named 'amorfus' with stores worlds, chunks, players, kv
  - why: Chunk blobs are small (median about 0.5 KB, max about 6 KB measured). IndexedDB gives transactions, works in workers, supports range deletes, and needs no custom file format or locking. OPFS shares IndexedDB's origin, quota and eviction model, so it solves nothing extra.
  - rejected OPFS with sync access handles: Dedicated-worker only, no transactions, needs its own file format and locking; its speed edge (RxDB: about 2.7x faster bulk reads, similar bulk writes) matters for large datasets, not a few hundred small blobs
  - rejected Dexie 4.4.6: Adds far more than this needs: there are no queries beyond key ranges
  - rejected localStorage / Cache Storage: localStorage is synchronous and small. The SW gateway deletes Cache Storage caches it does not own when it activates (verified in source).
- **Namespacing the database per CID or per release** → No namespacing: the same DB name 'amorfus' on every origin, with explicit schema versioning and graceful VersionError handling
  - why: On path gateways and stable origins, a shared name lets new releases read earlier saves. Namespacing adds no security, because indexedDB.databases() enumerates every name. Isolation comes from the origin, not the name.
  - rejected DB name per CID: Would strand saves on path gateways and amorf.us for no security gain
- **Stable origin strategy** → amorf.us (Workers) is primary. Add a _dnslink.amorf.us TXT record, updated each release, for stable IPFS-native origins (amorf-us.ipns.inbrowser.link, amorf-us.ipns.localhost:8080). CID URLs are labelled pinned releases.
  - why: Only a mutable name gives an origin that survives releases, because content-addressed names are immutable.
  - rejected Treat the CID subdomain URL as the canonical app URL: Each release is a new, empty origin, and persist() is likely denied because engagement is zero
- **Cross-release data transfer** → File export/import always available. Add a popup + postMessage handoff whose sender ships in the MVP.
  - why: A popup is top-level, so its storage is not partitioned, and inbrowser.link sends no COOP, so window.opener survives. A release that lacks the sender can never hand off, so the sender must ship first.
  - rejected Hidden iframe of the old origin: Storage partitioning (Chrome 115+): *.inbrowser.link is on the PSL, so the old CID is cross-site and the iframe would see an empty partition
  - rejected Storage Access API: Needs a gesture and prior top-level interaction, may prompt, and is fragile
- **Export compression** → gzip through CompressionStream, as a single gzip member after an uncompressed 16-byte preamble
  - why: Chrome has no brotli or zstd in CompressionStream (browser-compat-data: false for both). gzip brings a built-in CRC32 and ISIZE check, and truncation, CRC flips and trailing data all reject with TypeError (tested). With the magic bytes outside the compressed body, a file can be identified without decompressing it.
  - rejected brotli via a JS/WASM library: Only about 15% smaller in my measurements; not worth the extra bundle
  - rejected Whole file gzip with magic inside: The file then starts with 1f 8b, and identifying it means decompressing it
- **Edit ordering inside a chunk** → Sort by (lamport, peerId, index), with columnar delta-coded Lamport, peer, index and value
  - why: Measured on 1e5 clustered edits: 29 KiB gzip with per-voxel stamps, against 247 KiB when sorted by index. The ordering is canonical, so identical states give identical bytes and a state hash.
  - rejected Index order (hypothesis): Stamps become effectively random and cost 10x the size
  - rejected Strip stamps from share files: Saves only about 25% for clustered edits, and loses the option of merging copies later
- **Import semantics** → Always import as a new world (a fork that keeps lineageId), staged with status 'importing'; Replace or keep both if the worldId exists. Merge-import comes after the MVP.
  - why: Deterministic, crash-safe and simple. The stamps are kept, so merging can be added later without a format change.
- **Generator pinning** → generator {id, version} stored per world; every version kept in the bundle permanently; CPU-only IEEE-exact math; golden hashes in npm run check
  - why: ECMA-262 leaves Math.sin, exp, pow and log implementation-approximated, and GPU floats vary by vendor. Without this discipline, seed plus edits can reproduce different terrain.
- **URL-fragment sharing** → After the MVP. Link offered up to 2,000 characters, warned between 2,000 and 8,000, file-only above 8,000.
  - why: It holds only about 5k clustered edits or about 300 scattered ones within chat limits (Discord 2,000). The requirement is already met by the file.

## Facts
- [V] ipfs.io and dweb.link return HTTP 429 to programmatic requests with 'sunset: Mon, 21 Sep 2026' and the body 'This IPFS gateway is switching to a service worker gateway only'. — curl probe 2026-09-24 UTC of https://<cid>.ipfs.dweb.link/; https://gatewaychanges.ipfs.io/
- [V] A browser-style navigation to <cid>.ipfs.dweb.link returns 302 to <cid>.ipfs.inbrowser.link. Path requests to ipfs.io and dweb.link from curl hit a Cloudflare managed challenge (403); Shipyard states that navigations to these hosts are redirected to inbrowser.link. — curl probe with Sec-Fetch-Mode: navigate; https://ipshipyard.com/blog/2026-ipfs-gateways-redirect-inbrowser-link/
- [V] inbrowser.link/ipfs/<cid>/ returns 301 to <cid>.ipfs.inbrowser.link/; /ipns/en.wikipedia-on-ipfs.org/ returns 301 to en-wikipedia--on--ipfs-org.ipns.inbrowser.link/. The SW gateway runs exclusively in subdomain mode. — curl probe; https://github.com/ipfs/service-worker-gateway README
- [V] The Public Suffix List contains *.dweb.link, *.inbrowser.link, ipfs.storacha.link, ipfs.w3s.link and ipfs.nftstorage.link; 4everland is not listed. — https://publicsuffix.org/list/public_suffix_list.dat
- [V] 4everland.io/ipfs/<cid>/ returns 301 to the subdomain form; ipfs.4everland.io/ipfs/<cid>/ returns 200 (path form). w3s.link and storacha.link return 301 to dweb.link; nftstorage.link returns 302 to ipfs.io. The Pinata public gateway returns 403: 'HTML content cannot be served through the pinata public gateway'. cloudflare-ipfs.com does not resolve. — curl probes 2026-09-24; https://blog.cloudflare.com/cloudflares-public-ipfs-gateways-and-supporting-interplanetary-shipyard/
- [V] Shipyard's final day of IPFS work is 2026-09-30. It will stop operating ipfs.io, dweb.link, delegated-ipfs.dev and the bootstrap nodes. Kubo, Helia, the Service Worker Gateway and others lose dedicated maintainers. — https://ipshipyard.com/blog/2026-the-end-of-ipfs-at-shipyard/
- [V] service-worker-gateway is now maintained by @nymd and @byo for the IPFS Foundation. Its latest release is v3.4.15 (2026-09-01). On 2026-09-22 deployments were blocked because the Cloudflare account was being migrated to the IPFS Foundation. — https://github.com/ipfs/service-worker-gateway README and issue #1197 comments
- [V] The SW gateway stores its own data in IndexedDB on the content origin (DBs 'helia-sw-unique', '/@helia/service-worker-gateway/data', '/@helia/service-worker-gateway/blocks'). On activate it deletes every Cache Storage cache not in its CURRENT_CACHES. It registers /ipfs-sw-sw.js at the origin root. — service-worker-gateway src/sw/sw.ts, src/sw/lib/verified-fetch.ts, src/sw/lib/sw-config.ts, src/lib/register-service-worker.ts (commit c72ec3c)
- [V] The SW gateway's default routers and DoH resolver are delegated-ipfs.dev and trustless-gateway.net. The inbrowser.link bootstrap response carries no COOP or COEP headers. — service-worker-gateway src/config/index.ts; curl of https://<cid>.ipfs.inbrowser.link/
- [V] The SW gateway strips the fragment only from the service worker's request URL; the page's location.hash stays client-side. A bare '#/' is removed. — service-worker-gateway src/sw/sw.ts L98-110, src/lib/remove-root-hash.ts
- [V] Kubo implicitly configures 'localhost' as a subdomain gateway (UseSubdomains: true). 127.0.0.1 behaves as a path gateway. — https://github.com/ipfs/kubo/blob/master/docs/config.md (Implicit defaults of Gateway.PublicGateways)
- [V] Chrome: an origin may use up to 60% of total disk and all origins together up to 80%. Under storage pressure whole origins are evicted in least-recently-used order, skipping persistent ones. IndexedDB, Cache, OPFS and the Wasm code cache count toward quota. — https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- [V] Chrome grants or denies navigator.storage.persist() automatically, with no prompt, based on site engagement, bookmarking, installation and notification permission. — https://web.dev/articles/persistent-storage
- [V] navigator.storage (NavigatorStorage) and the WebGPU GPU interface are both [SecureContext]. — https://storage.spec.whatwg.org/ ; https://www.w3.org/TR/webgpu/
- [V] IndexedDB open() throws SecurityError when obtaining a storage key fails, and obtaining a storage key fails for an opaque origin. Opening a DB with a lower version than the stored one gives VersionError. — https://w3c.github.io/IndexedDB/ ; https://storage.spec.whatwg.org/
- [V] Chrome changed the IndexedDB default durability from strict to relaxed in Chrome 121; strict was 10x+ slower on a benchmark. The durability option shipped in Chrome 83. — https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed ; mdn/browser-compat-data
- [V] OPFS createSyncAccessHandle works only in dedicated workers (FileSystemSyncAccessHandle is available from Chrome 102). OPFS counts toward quota and is cleared along with site data. — https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system ; browser-compat-data
- [V] RxDB benchmark (page updated Jul 21 2026): bulk write of 500 docs 10.32 ms (OPFS worker) vs 9.67 ms (IndexedDB); bulk read by ID of 3000 docs 24.5 ms vs 67.7 ms. — https://rxdb.info/rx-storage-performance.html
- [V] CompressionStream in Chrome: gzip and deflate from 80, deflate-raw from 103. Brotli is unsupported in Chrome (Firefox 147, Safari 18.4). zstd is unsupported in Chrome. — https://github.com/mdn/browser-compat-data/blob/main/api/CompressionStream.json
- [V] The Compression Streams spec treats a CRC32 or ISIZE mismatch and any data after the single gzip member as errors. Node 22's DecompressionStream rejects truncated, CRC-flipped and trailing-data gzip with TypeError. — https://compression.spec.whatwg.org/ ; local test under Node v22.22.1
- [V] showSaveFilePicker and showOpenFilePicker exist in Chrome/Edge 86+ but not in Firefox or Safari. Storage Buckets exist in Chrome 122+ only. — mdn/browser-compat-data api/Window.json, api/StorageBucketManager.json
- [V] Chrome 122 added persistent File System Access permissions ('Allow on every visit'), using handles stored in IndexedDB. — https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- [V] Chrome 115+ partitions IndexedDB, localStorage, OPFS, Cache, BroadcastChannel, Web Locks, SharedWorker and third-party service workers by top-level site plus origin, with an ancestor bit. — https://privacysandbox.google.com/3pcd/storage-partitioning
- [unverified] The Storage Access API extension to non-cookie storage (indexedDB, localStorage and others) shipped in Chrome 125. — https://chromestatus.com/feature/5175585823522816 ; https://developer.chrome.com/release-notes/125 (search snippets; pages not fetched)
- [V] Chrome limits URLs to 2MB (kMaxURLChars = 2*1024*1024); the address bar displays at most 32kB. — https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md ; url/url_constants.h
- [V] A version-40-L QR code holds at most 2,953 binary bytes. — https://www.qrcode.com/en/about/version.html (via search)
- [V] Discord messages are capped at 2,000 characters (4,000 with Nitro). Slack recommends at most 4,000 characters and truncates past 40,000. — https://support.discord.com/hc/en-us/articles/360034632292-Sending-Messages (search snippet) ; https://docs.slack.dev/reference/methods/chat.postMessage
- [V] Uint8Array.prototype.toBase64 and fromBase64: Chrome 140, Firefox 133, Safari 18.2, Node 25. — mdn/browser-compat-data javascript/builtins/Uint8Array.json
- [V] ECMA-262 makes Math.sin return an 'implementation-approximated' value, and Math.pow delegates to Number::exponentiate (whose exact precision I did not check). Math.sqrt returns the exact square root, and Number::multiply follows IEEE 754-2019 double arithmetic. — https://tc39.es/ecma262/
- [V] Measured export sizes for 1e5 edits (32^3 chunks, synthetic data), gzip: clustered snapshot without stamps 19-23 KiB; clustered with stamps in Lamport order 29 KiB; clustered with stamps in index order 247 KiB; op-log order 17 KiB; uniformly scattered with stamps 0.52-0.58 MiB; naive JSON 410 KiB (2.3 MiB raw). 1e4 clustered edits encode to 3,688 base64url characters; 1e3 scattered to 6,106. Per-chunk blobs: median 536 B, p95 2,632 B, max 6,168 B. — local experiment: proto/sizeest.mjs and sizeest-b.mjs (Node 22 zlib)
- [unverified] The synthetic edit order (sequential Lamport values within geometric structures) flatters Lamport-ordered compression; real human edit streams will compress somewhat worse. — inference
- [V] amorf.us uses Cloudflare nameservers (trevor/ullis.ns.cloudflare.com) and has no A record and no _dnslink TXT record as of 2026-09-24. — DoH query to cloudflare-dns.com
- [V] npm latest versions: idb 8.0.3 (2025-05-07, about 1.19 kB brotli per README), dexie 4.4.6 (2026-09-10), fake-indexeddb 6.2.5, fast-check 4.10.2 (2026-09-19), vitest 5.0.1 (2026-09-15). Node 22 exposes CompressionStream globally. — https://registry.npmjs.org ; idb README; local node -e
- [V] None of the owner's other repos uses IndexedDB, idb, Dexie, fake-indexeddb or CompressionStream, so there is no house precedent for browser storage. — grep of the owner's other repos' package manifests and source files
- (removed: private source)
- [unverified] A new CID origin almost always gets persist() denied, because Chrome's engagement heuristics start at zero. — inference from the web.dev heuristics
- [unverified] Service workers do not intercept blob: URLs, so <a download href=blob:...> works under the SW gateway; showSaveFilePicker is unavailable in cross-origin iframes. — recollection

## Risks
- (medium) inbrowser.link, delegated-ipfs.dev and trustless-gateway.net stewardship is changing hands (Shipyard exits 2026-09-30; deployments already blocked). The main public IPFS route to Amorfus, and DNSLink resolution through it, could degrade or disappear. | impact: The acceptance criterion about an IPFS gateway, and access via amorf-us.ipns.inbrowser.link, fail through no fault of the app. Saves on those origins become unreachable. | mitigation: Keep amorf.us primary. Run acceptance tests against a local kubo, which is under the owner's control. Name these services as third-party dependencies in the plan. Keep Export prominent.
- (high) Users on a pinned-release origin open a new release and think their worlds are gone | impact: Perceived data loss and loss of trust | mitigation: Origin classifier and banner; handoff flow with the sender shipped in the MVP; link to the old release URL; export reminders
- (low) On a shared path-gateway origin, another site reads, alters or plants a crafted 'amorfus' DB | impact: Corrupted worlds, or a parser exploit through crafted blobs | mitigation: Every IndexedDB read goes through the same strict validator as file import; nothing secret is stored; the user sees a warning banner
- (medium) Generator output drifts between Chrome versions or GPUs, so a seed plus edits reproduces different terrain | impact: Shared and imported worlds diverge, peers disagree, and edits float or bury | mitigation: CPU-only, IEEE-exact generator; lint ban on approximated Math functions; golden hashes for every generator version in npm run check
- (medium) Schema downgrade: a cached older release (DNSLink TTL, CDN, a path gateway holding several releases) opens a DB upgraded by a newer one | impact: VersionError; the app fails to load saves | mitigation: Catch VersionError and show a clear message; lazy per-blob codec versioning keeps schema bumps rare
- (medium) Two tabs write the same world | impact: Lost edits | mitigation: A Web Lock per world, with a take-over option; handle versionchange
- (medium) Tab closes or crashes before the debounced flush | impact: Up to about 5 s of edits lost; more if the OS crashes, because relaxed durability only reaches the OS buffer | mitigation: Flush on visibilitychange hidden and pagehide; cap the flush interval at 5 s; strict durability for imports
- (low) Crafted or corrupted import file: decompression bomb, huge varints, out-of-range indices | impact: Tab hangs or runs out of memory, or IndexedDB ends up half-written | mitigation: Size-capped decompression stream, strict parser bounds, staged import with status flag and startup cleanup, parsing in the worker
- (low) Best-effort eviction or the user clearing site data wipes worlds | impact: Permanent loss if never exported | mitigation: persist() after the first save, visible storage status, export reminders; after the MVP, link a world to a file on disk (File System Access persistent permissions, Chrome 122+)
- (low) The SW gateway's blockstore on the same origin fills the quota, or the whole origin is evicted with it | impact: Quota errors or eviction of saves on inbrowser.link origins | mitigation: Handle QuotaExceededError; after the MVP, consider a Storage Bucket (Chrome 122+) with persisted:true for world data

## Requirement conflicts
- [major] 'Worlds save locally in the browser and survive reloads' vs 'Must work when served from IPFS, including through gateway subpaths (/ipfs/<CID>/) and in Helia-based loaders': Reloading the same URL works on most origins, but: (a) per-CID subdomain origins (inbrowser.link, which is now where ipfs.io and dweb.link send browsers, plus 4everland and kubo localhost) start empty for every new release; (b) path-gateway origins share storage with every other site on the gateway, which can read, alter or delete it; (c) Helia loaders that run the app in a sandboxed or opaque-origin iframe make IndexedDB throw SecurityError, so no persistence is possible; (d) fresh CID origins are unlikely to be granted persist(), so they stay best-effort. → Define 'survive reloads' as the same URL on an origin that allows storage. Make amorf.us, plus DNSLink amorf-us.ipns.<gateway>, the stable origins. Classify the origin at startup and show a banner on pinned, shared and no-storage contexts. Validate everything read from storage as untrusted. In opaque contexts, run session-only with export. Ship the popup handoff sender in the MVP so worlds can move between releases.
- [major] Acceptance: 'Opening that folder ... through an IPFS gateway path both work' vs the public gateway landscape as of 2026-09-21: ipfs.io, dweb.link and w3s.link no longer serve path requests to apps: they return 429 to programmatic clients and redirect browsers to the subdomain-only inbrowser.link. Pinata's public gateway refuses HTML, cloudflare-ipfs.com is gone, and 4everland.io redirects to subdomains. Public path gateways that still serve are rare (ipfs.4everland.io), and inbrowser.link's operator is changing (Shipyard exits 2026-09-30; deployments blocked on 2026-09-22). → Satisfy the gateway-path requirement with relative URLs and verify it against a local kubo at http://127.0.0.1:8080/ipfs/<CID>/ (path) and http://<CID>.ipfs.localhost:8080/ (subdomain), both under the owner's control. Treat public gateways, inbrowser.link included, as best-effort named third parties, not acceptance gates.
- [major] 'A world can be shared as a seed plus edits' (implied: it stays valid) + 'Procedurally generated terrain' + 60 fps pressure to generate on the GPU: A seed reproduces terrain only if the generator is bit-deterministic and pinned. GPU float results vary by vendor. ECMA-262 leaves Math.sin, exp and pow implementation-approximated. Every generator version must stay in the bundle for good. → Store generator {id, version} per world. Keep authoritative density and material on the CPU in a worker, using IEEE-exact operations only (lint-enforced). Freeze old versions in src/worldgen/vN. Gate on golden hashes in npm run check. The GPU may compute only derived, visual output (cross-area constraint for rendering and smoothing).
- [minor] 'Players can join a shared world via a link or code' / sharing expectations vs URL length limits (hypothesis proposes putting worlds in the URL fragment): Only about 5k clustered or about 300 scattered edits fit in a 2,000-character chat link. A scannable QR code holds about 1,000 characters. → Share worlds as files (this meets the requirement). The URL fragment is an optional extra for small worlds, with automatic fallback to a file. Keep the world-share fragment key separate from the P2P join key.
- [minor] 'No game server run by me; any third-party signaling/relay dependency must be named' vs the IPFS delivery path: Access through IPFS depends on inbrowser.link (IPFS Foundation), delegated-ipfs.dev (routing and DNSLink over DoH, operator in transition) and trustless-gateway.net. DNSLink needs Cloudflare DNS for amorf.us. The requirement's wording covers only signaling and relay, but these services are equally third-party. → List these services in the plan's dependency table along with what each one sees (CID, client IP, DNSLink name).
- [minor] 'Opening that folder over a local static server' + 'Rendering via WebGPU' + persistence: WebGPU and navigator.storage (persist, estimate) are secure-context only. Serving over plain http on a LAN IP breaks both; localhost and 127.0.0.1 work. → The README says to use localhost, or https for LAN testing. The WebGPU-unavailable message also covers the insecure-context case.

## Third-party deps
- idb (npm, 8.0.3) (Jake Archibald (open source)) runtime (bundled): Small promise wrapper around IndexedDB | sees: Nothing external; bundled code
- fake-indexeddb (npm, 6.2.5) (open source (dumbmatter)) build-time (tests): IndexedDB implementation for tests under Node | sees: Nothing; dev only
- fast-check (npm, 4.10.2) (open source (dubzzz)) build-time (tests): Property-based tests for the codec and merge | sees: Nothing; dev only
- inbrowser.link Service Worker Gateway (IPFS Foundation (maintainers @nymd, @byo; taken over from Shipyard in Sep 2026)) runtime: Where browsers land when opening Amorfus by CID or DNSLink through the former ipfs.io and dweb.link; hosts the app's origin (<cid>.ipfs.inbrowser.link / amorf-us.ipns.inbrowser.link) and shares that origin's IndexedDB and quota | sees: The requested CID or DNSLink name, the client IP, and bootstrap page requests. The gateway's service worker code runs on the app's origin and can technically read its storage.
- delegated-ipfs.dev (Shipyard until 2026-09-30, then undetermined (Protocol Labs to decide)) runtime: The SW gateway's default content routing and DoH resolver for DNSLink (resolving _dnslink.amorf.us) | sees: The CIDs and DNSLink names looked up, and the client IP
- trustless-gateway.net (IPFS ecosystem (operator not verified)) runtime: Fallback block provider for the SW gateway | sees: Requested block CIDs and the client IP
- Cloudflare (Workers static assets + DNS for amorf.us) (Cloudflare) runtime and publish-time: Serves the stable primary origin; hosts the _dnslink TXT record | sees: HTTP requests to amorf.us and DNS queries. It never sees world data, which stays in the browser.
- Local kubo gateway (for acceptance tests) (the user or owner (self-run)) publish-time (testing): Path gateway at 127.0.0.1:8080 and subdomain gateway at *.ipfs.localhost:8080 for acceptance tests | sees: Local only

## Test ideas
- Property test (fast-check 4.x): a random world state goes through encode → gzip → decode and comes back deep-equal with an identical state hash. Re-encoding the decoded state gives byte-identical output (canonical order).
- Golden fixtures: commit test/fixtures/format-v1/*.amorfus for each released format and codec version. The current reader must import each one to a recorded state hash forever (a gate in npm run check).
- Generator golden hashes: for every src/worldgen/vN, hash density and material for 16 fixed (seed, chunk) pairs and compare with a committed JSON file. Also lint that src/worldgen has no Math.sin, cos, tan, exp, pow, log or random.
- Corruption fuzz: for a sample file, truncate at every byte offset and flip random bits in the preamble, the compressed body and the decompressed sections. Every case must produce a typed ImportError, never an uncaught exception, and write nothing to IndexedDB.
- Adversarial files: wrong magic; a future major version (must reject); a future minor version with an unknown lowercase section (must import); an unknown uppercase section (must reject); META over 64 KiB; an 11-byte varint; index ≥ CS³; duplicate chunk keys; material index out of range; peerIdx out of range; a gzip bomb (1 GiB of zeros is about 1 MiB compressed) that must abort at the cap; data trailing after the gzip member.
- Schema migration on fake-indexeddb 6.x: create a v1 DB from fixtures, open it with current code, and assert the migrated contents. Open a DB at version N+1 with version-N code and expect VersionError to reach the UI message. An open connection must close when versionchange fires.
- Staged import: kill the import mid-way (throw after k batches) and restart. The world with status 'importing' must be cleaned up and existing worlds left untouched.
- Flush policy: edits then a simulated pagehide must persist; burst edits must coalesce into at most one transaction per 1.5 s idle window.
- classifyOrigin table test: amorf.us, amorf-us.ipns.inbrowser.link, bafy….ipfs.inbrowser.link, bafy….ipfs.localhost:8080, 127.0.0.1:8080/ipfs/bafy…/, ipfs.4everland.io/ipfs/…, origin 'null', localhost:5173.
- Playwright: load the built folder from a local static server and under a local path /ipfs/<fakeCID>/ prefix; create edits, reload, and assert the edits persist. Load inside a sandboxed iframe (no allow-same-origin) and assert the no-storage banner, with export still working.
- Playwright handoff: serve release A at a.localhost:5173 and B at b.localhost:5174. Create a world in A, trigger the handoff from B, confirm in the popup, and assert B has the world with the same state hash. Also assert B rejects a message from the wrong origin or with the wrong nonce.
- Two tabs on one world: the second tab gets the lock-unavailable UI; 'take over' makes the first tab read-only.
- URL fragment (post-MVP): round-trip; threshold behaviour at 2,000 and 8,000 characters; the base64url fallback helper matches Uint8Array.toBase64 on Chrome 140+.
- Cross-area convergence: two simulated peers apply the same edits in different orders; their chunk blobs are byte-identical and their state hashes equal.

## Milestone notes
These milestones follow the world-data-model milestone:

- **P1 (with the world data model, pure TypeScript, no browser):**
  - chunk codec v1 (Lamport-ordered, canonical) plus world-state hash
  - material name table and chunkSize re-bucketing
  - the 16-byte preamble container, and the section reader and writer with strict bounds
  - golden fixtures and round-trip, fuzz and corruption tests
  - generator determinism lint plus per-version golden hashes wired into npm run check
- **P2 (IndexedDB store):**
  - idb wrapper, schema v1 with stepwise upgrade, and fake-indexeddb migration tests
  - flush policy (debounce plus pagehide), the edited-chunk key index on open
  - Web Locks per world, and versionchange and VersionError handling
  - status-flagged staged writes with startup cleanup
- **P3 (origin awareness):**
  - classifyOrigin with unit tests; banners for pinned, shared and no-storage contexts
  - untrusted-read validation path
  - persist() after the first save, plus the storage status and estimate UI
- **P4 (export/import UI):**
  - showSaveFilePicker, with fallback to `<a download>`; file input and drag-and-drop
  - decompression in the worker, with a size cap
  - fork-on-import; share profile
- **P5 (in the MVP, because a release that ships without it can never send):**
  - handoff sender and receiver, plus `releases.json` generation at build time
  - Playwright test across two localhost origins
  - Release script step to update `_dnslink.amorf.us` (build/publish area; needs a Cloudflare DNS-edit token held locally, never in the site).

**Deferred past the MVP:**
- URL-fragment sharing
- merge-import of two copies of a world (the file already carries stamps)
- linking a world to a file on disk via File System Access persistent permissions (Chrome 122+)
- a Storage Buckets 'worlds' bucket with persisted: true and strict durability (Chrome 122+)
- thumbnails
- a compact op-log export profile

## Open questions
- Does the sync area adopt a per-voxel last-writer-wins register keyed by (lamport, peerId string)? The chunk codec's stamp columns assume it. If sync chooses a different model, only the codec changes, not the container.
- Chunk size: 32³ is assumed here and the file records chunkSize. Confirm with the chunk/world data-model area.
- Should the cross-release handoff ship in the MVP (my recommendation: at least the sender), or is 'export from the old version, import into the new one' acceptable to the owner?
- Should amorf.us and amorf-us.ipns.inbrowser.link both be advertised? They are separate save sets.
- Who updates the _dnslink TXT record on each release, and with what credential (a Cloudflare API token with DNS:Edit, held locally)? This is a build/publish decision.
- Should every generator version stay in the bundle forever, or may seeds change across a declared major version (with old worlds still loading their own edits over new terrain)?
- Where does the persistent peer identity live? On shared path-gateway origins, anything in IndexedDB is readable by other sites. If the sync area signs edits, the key must not be stored there, or those contexts must be treated as anonymous.
- vitest: ^4.1 or 5.0.1 (shipped 2026-09-15)? Pick one for the new repo (build-tooling area).