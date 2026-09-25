# sync: Sync and conflict model (CRDT, ordering, join, positions, determinism)

## Recommendation

# Sync and conflict model: recommendation

## Evidence (what this rests on)
- **Read:** REQUIREMENTS.md, as relayed in the task. Private owner material (not described here).
- **Measured in the scratchpad on this machine** (Node 22.22.1 x64 under WSL2, single runs, so treat as indicative):
  - CRDT library benchmarks and bundle sizes
  - Math.pow drift across V8 versions
  - noise golden hashes across Node 20, 22 and 24
  - a fast-check convergence property with and without a value tiebreak
  - wire-size estimates
- **Fetched today:**
  - ECMA-262 (tc39.es multipage)
  - V8 `src/base/ieee754.cc` (main)
  - the HLC paper (Kulkarni et al., 2014)
  - the WGSL spec
  - MDN on data channels
  - Valve and Gaffer on snapshot interpolation
  - npm registry metadata
- Anything marked *(inference)* is my reasoning, not something I found recorded.

## 0. Verdict on the working hypothesis
The shape is right:
- a state-based LWW map per cell
- removal written as `air`, so there are no tombstones to collect
- per-chunk digest anti-entropy
- unreliable 15–20 Hz positions
- terrain generated on the CPU using only exact floating-point operations
- a version check in the handshake

Seven changes are needed before it is correct:
1. **Use a hybrid logical clock (HLC), not a Lamport clock.** With pure Lamport, the busiest offline peer wins. See section 3.
2. **Add the value as the final tiebreak.** The total order is `(l, c, peer, value)`. Without the value, duplicate tags break convergence. fast-check found a counterexample in this session.
3. **Decide whether to accept an op from the op's bytes alone.** Refusing a timestamp that is "too far in the future" must *defer* the op, not reject it. Rate limits act on connections, not on individual ops. A rejection that depends on local state or local time causes permanent divergence.
4. **Freeze every released generator version forever.** Protect them with golden hashes, and have each peer compute a canary hash at runtime and send it in HELLO. The handshake version check alone does not keep saved worlds valid.
5. **Send bulk state on its own data channel** with messages of 16 KiB or less, so a transfer of several MB does not hold up live edits behind it.
6. **Positions are ephemeral state owned by each player,** never merged. This keeps two problems out of Amorfus: lossy delivery vs deterministic replay, and dead reckoning presuming an authority.
7. **The per-cell LWW model holds only while no simulation rewrites blocks.** Falling sand, water or physics would need a total order over inputs, which CRDTs give up. Keep them out of scope, or revisit this design first.

## 1. What is replicated
| Class | Contents | Rule |
|---|---|---|
| Replicated, converged, persisted | `edits: cell -> Entry`; world header `{worldId: 16 random bytes, seed: u32x2, generatorVersion: u16}` | LWW semilattice (section 4) |
| Ephemeral, owned by one player | pose, display name (up to 32 bytes UTF-8, rendered with `textContent` only), colour, held material | latest value from the owner; lossy delivery is fine |
| Derived per machine; need not match across machines | meshes, smoothing, normals, lighting, collision geometry | computed locally from `W` |

`W(cell) = edits.has(cell) ? edits.get(cell).value : G[generatorVersion](seed, cell)`. `W` is the only function that must be bit-identical across machines.

## 2. Cell value and entry
- **Cell** is an integer triple. Protocol constants bound it: `x, z` in `[-2^23, 2^23)`, and `y` in `[Y_MIN, Y_MAX]` fixed per generatorVersion *(inference: the numbers are proposals)*.
- **Value** is a canonical u16:
  - bits 0–7 are the material id, with 0 meaning air
  - bit 8 is `sharp`
  - bits 9–15 must be 0
  - air must have `sharp = 0`
  
  A non-canonical encoding is invalid. This matters because the value takes part in the tiebreak and in the digests. The material registry is append-only and belongs to `protocolVersion`.
- **Entry** is `{value, tag}`, where `tag = {l: u48 (HLC milliseconds), c: u16, peer: u64 random per session}`. l and c are stored as separate fields: `l * 2^16 + c` would exceed 2^53.
- **Order:** compare `(l, c, peer, value)` lexicographically. This is a total order over all distinct entries, so taking the per-key maximum is a join-semilattice.
- **Peer id:** 64 random bits from `crypto.getRandomValues`, generated fresh each session and never persisted as identity.
  - This means no tracking.
  - Two tabs never share an id.
  - If an id ever collides, the value tiebreak still keeps peers converged.

## 3. Clock: hybrid logical clock (Kulkarni et al. 2014, fig. 5)
`pt = Date.now()`.

**Local edit:**
- `l' = max(l, pt)`
- `c = (l' == l) ? c + 1 : 0`
- `l = l'`
- if `c > 65535`, then `l += 1; c = 0`

**Accepting a remote op `(lm, cm)`:**
- `l' = max(l, lm, pt)`
- `c` follows the paper's rule:
  - `max(c, cm) + 1` if all three l values are equal
  - `c + 1` if `l' == l`
  - `cm + 1` if `l' == lm`
  - otherwise 0

**Opening a world:** treat every stored tag as received, so `l >= max(stored l)`. My next edit then beats everything I have already seen, even if my system clock went backwards overnight.

**Why not Lamport:** A goes offline, makes 499 edits, then edits cell X, giving L≈1500. Eight minutes later B edits X at L≈1010. When A reconnects, A's older edit wins, because the counter measures activity, not time.

**Why not raw wall-clock time:** a peer with a slow clock could not overwrite a block it can see.

**What HLC gives:**
- (a) **Causality.** An edit made after seeing another edit always beats it.
- (b) **Concurrent edits.** The later wall-clock edit wins, accurate to within the clock skew between machines.
- (c) **Offline edits.** They keep the real time they were made, so they beat earlier online edits and lose to later ones.

This is the least surprising deterministic rule available without a coordinator.

### Guarding against inflated timestamps
- **Structural checks on content (invalid means close the connection):**
  - `l < 2^47`
  - c fits in u16, which the encoding guarantees
  - `peer != 0`
- **Future timestamps are deferred, never rejected:**
  - Trigger: `lm > Date.now() + DELTA_FUTURE`, with DELTA_FUTURE = 60 s.
  - Do not apply the op and do not feed it to the HLC.
  - Park it in a per-connection queue of at most 1,024 ops; an overflow closes the connection.
  - Retry once a second.
  - If a queued op is lost, anti-entropy brings it back.
  - This follows the HLC paper's "ignore out-of-bounds messages" rule, turned into a deferral because a permanent drop diverges from peers whose clocks are fast.
- **Handshake skew check:**
  - HELLO carries the sender's `Date.now()`.
  - If `|skew| > 30 s`, refuse with "clocks differ by N s; fix system time".
  - If `|skew| > 2 s`, warn.
  - Because the 30 s refusal limit is below DELTA_FUTURE, honest peers never trigger deferral.
- **Bound:** a peer can gain at most about DELTA_FUTURE of advantage in concurrent same-cell conflicts. A timestamp near 2^53 is impossible.
- **Imports:** a world file with `l > now + DELTA_FUTURE` is refused with a clear message. The alternative, clamping, would diverge.

## 4. Store and merge
- **Buckets:** entries are grouped into sync chunks of 32³ cells. This is a protocol constant, independent of the render chunk size. Each chunk holds a table from `localIndex (u15)` to `{value, l, c, peer}` in parallel typed arrays.
- **Applying an entry:** `apply(cell, e)` returns `changed` and replaces the stored entry only if `e > current`.
- **Digests:**
  - `h64(cell, value, tag)` uses two 32-bit lanes with `Math.imul` mixing.
  - `chunkDigest` is the XOR of `h64` over the chunk's entries, stored with an entry count.
  - `root` is the XOR of all chunk digests.
  - Updates are incremental: `d ^= h(old) ^ h(new)`.
  - Only applied entries count, never deferred ones.
- **Never delete an entry.** Deleting returns a cell to the bottom state, and an older op would then be accepted again, which diverges. Memory grows with the number of distinct cells ever edited, not with the number of ops.
- **Why build it ourselves** (measured in this session, Node 22.22.1):

| 1e6 ops, 80% distinct | apply | snapshot size | load |
|---|---|---|---|
| custom (naive, 20 B/entry) | 2.1 s | 16.0 MB | 0.4 s |
| Yjs 13.6.33 | 6.5 s | 18.9 MB | 7.1 s |
| Loro 1.16.3 | 9.4 s | 24.6 MB | 0.02 s (lazy) |
| Automerge 3.5.0 | 72 s, 1.0 GB heap | 7.9 MB | 3.9 s |

  - **Overwrite-heavy workload** (1e6 ops onto 50k cells): custom uses 20 B per live cell, Yjs 212 B, and Loro 228 B, because Yjs and Loro keep history.
  - **Bundle cost:** Yjs is 22.6 KB gzipped. The Loro and Automerge WASM files are 1.07 MB and 1.14 MB gzipped. The custom store is estimated at under 5 KB.
  - **Fit:** none of the three orders map keys by HLC or physical time. Loro is documented as LWW on `(lamport, peer)`. All of them want string keys.
  - **Cost of building it:** we write and test the sync protocol ourselves. The requirements ask for those tests anyway.

## 5. Convergence argument
**Claim.** Let an *op* be a `(cell, Entry)` pair. The ordering is a total order, so the per-cell maximum is commutative, associative and idempotent. A replica's state is therefore a function only of the *set* of ops it has applied. Order, duplication and the delivery path do not matter.

Any two replicas that have applied the same set of ops and share `(worldId, seed, generatorVersion)` have the same `W`. This is strong eventual consistency (Shapiro et al., 2011).

**Preconditions (each must be tested):**
- **P1 Eventual delivery.** Every op accepted by any honest replica eventually reaches every replica. This needs:
  - the connection graph to become connected over time
  - reconciliation on every connect, and every 15 s
  - forwarding of ops that changed state (section 8)
  - never dropping an accepted op
  
  Edits made by a peer who leaves before anyone receives them are not in the set until that peer returns. They stay in the peer's local save.
- **P2 Same acceptance rule.** Acceptance depends only on the op's bytes and `protocolVersion`. Time may only defer an op. Rate limits and size caps close connections; they never drop individual valid ops silently.
- **P3 Same total order.** The comparator is identical everywhere, values are encoded canonically, and the value is the final tiebreak.
- **P4 Same generator.** `G_v` is bit-identical on every machine (section 10), and every released version is kept forever.
- **P5 Same value meaning.** The material registry is fixed per `protocolVersion`.
- **P6 No deletion.** Entries are never garbage-collected.
- **P7 Faithful persistence and import.** A saved and reloaded world round-trips exactly, and import is the same join. Only one tab may hold a world open for writing (Web Locks), otherwise two tabs lose each other's IndexedDB writes *(inference; belongs to the persistence area)*.

**Not required:** synchronised clocks (they only affect which edit wins), causal or ordered delivery, or exactly-once delivery.

## 6. Validation and abuse limits
| Check | Limit | Action |
|---|---|---|
| Message size | 16 KiB or less, on every channel | close the connection |
| Decode | total decoder; unknown type or trailing bytes are an error, never an uncaught throw | close the connection |
| Cell bounds, canonical value, tag bounds | section 2 and section 3 constants | invalid: close the connection |
| Future timestamp | more than now + 60 s | defer; queue limited to 1,024 per connection |
| Live edits | token bucket: 50/s sustained, burst of 500 per peer | close with reason `rate` |
| Positions | 60 messages/s or fewer | drop the excess (positions are lossy anyway) |
| Reconciliation requests | 1 per 5 s per peer | ignore extras |
| Bulk transfer | 4e6 entries or fewer, and 64 MB or less, per transfer | abort and close; entries already applied are valid and stay |
| Handshake | 10 s timeout; `protocolVersion`, worldId, seed, generatorVersion and generator canary must match; skew 30 s or less | refuse with a specific message |
| Strings | display name 32 bytes or less, rendered as text | truncate and reject |

- **A peer cannot:**
  - crash others
  - use unbounded memory
  - make honest peers diverge from each other; equivocation still converges because of the value tiebreak
  - push anyone's clock more than 60 s ahead
  - inject markup or code
- **A peer can:**
  - overwrite any cell, up to the rate limit
  - lie about its own position
  - withhold data
  - forge the session id of edits it relays during anti-entropy, because ops are unsigned
- **No local mute.** A local "ignore peer X" cannot hold, because X's ops arrive through the other peers. Eviction means starting a new room code.
- **Signatures are post-MVP.** WebCrypto Ed25519 has shipped since Chrome 137, but a 64-byte signature per stored entry is about 7× the size of the entry itself.

## 7. Wire protocol
- **Channels:**
  - `ctl`: reliable, ordered. Carries HELLO, PEERS, EDITS, ROOT, CHUNK_DIGESTS and WANT.
  - `bulk`: reliable, ordered. Carries the CHUNK_ENTRIES stream, with `bufferedAmountLowThreshold` backpressure.
  - `pos`: `ordered: false, maxRetransmits: 0`.
  
  Merging does not depend on ordering. Ordered channels only make framing multi-message streams simpler.
- **Framing:** `[u8 type][payload]`, little-endian, varints for counts and deltas, hand-written `DataView` reader and writer with a bounds check on every read.
- **HELLO fields:**
  - magic `AMRF`
  - `protocolVersion u16`
  - `worldId 16B`
  - `seed u32x2`
  - `generatorVersion u16`
  - `genCanary u64`
  - `session u64`
  - `wallMs u48`
  - `hlc (l, c)`
  - `name` (up to 32 bytes)
  - `colour`
- **EDITS:** a peer table of at most 4 × u64, then per op: `x, y, z` as zigzag varints, `value u16`, `l u48`, `c` as a varint, and a `peerIdx u8`. That is about 20–24 B per op.
- **CHUNK_ENTRIES:**
  - Header: chunk key as zigzag varints, then a count.
  - Per entry, sorted by l: `localIdx u16`, `value u16`, `delta l` as a varint, `c` as a varint, `peerIdx u8`.
  - Measured on synthetic clustered data: 9.0–9.1 B per edit; 7.0 B after deflate-raw. Skip compression for MVP.
- **Why a custom DataView encoding:**
  - POS is 31 B, versus 48–94 B in msgpack and 76–96 B in CBOR (measured).
  - Bulk data is packed integers, which msgpack or CBOR would only wrap.
  - It saves 5.9 KB (msgpack) or 10.8 KB (cbor-x) gzipped.
  - Field widths are exact.
  - The cost is that every codec needs round-trip and fuzz properties.

## 8. Join, anti-entropy, partitions
1. Both sides send HELLO; any mismatch is refused (section 6).
2. Each side sends `ROOT {digest u64, count u32, focus cell}`. If the roots match, reconciliation is done.
3. Each side streams `CHUNK_DIGESTS` for all non-empty chunks: about 14 B each, sorted nearest-first to the other side's focus cell.
4. For every chunk whose digest differs or is missing on either side, each side sends `WANT(keys)` and pushes its own `CHUNK_ENTRIES` for those chunks on `bulk`. Both sides merge. This is one round trip, with at most 2× overhead on the mismatched chunks.
5. Compare roots again. Repeat while they differ; ops still in flight cause harmless extra rounds.

Other rules:
- **A new joiner** with count 0 skips step 3. The peer streams every chunk, nearest first. The world is walkable immediately from the seed.
- **Periodic check:** ROOT every 15 s. Reconcile if two consecutive roots differ.
- **Forwarding:** an op that changed local state is forwarded to connected peers that, according to their PEERS announcements, are not directly connected to its origin. Each replica changes on a given op at most once, so forwarding terminates. This covers a partial mesh.
- **Who serves state:** any peer. The world has no owner. A joiner compares roots with every peer, which costs 8 B each, and pulls from the first that answers. Duplicates are harmless.
- **Partitions and rejoin:** the same symmetric reconciliation runs on every connection. Edits made on both sides of a partition merge cell by cell under the HLC rule.
- **Replays:** a tag at or below the current entry is a no-op, so a replay can never move a cell backwards. `worldId` in HELLO scopes a connection to one world.

**Costs (estimates from synthetic data):**
- 1e5 edits in about 1.4k chunks:
  - a full join transfers about 0.90 MB
  - digests are about 20 KB
  - rejoin with k changed chunks costs about 20 KB plus k × roughly 0.6 KB
- 1e6 edits transfer about 8.2 MB, which takes roughly 2–8 s at an assumed 1–5 MB/s *(throughput unverified)*.

## 9. Player positions
- **POS message, 31 B:**
  - `u8 type`, `u16 seq`
  - `u32 tSend` (the sender's `performance.now()` in ms)
  - `i32 x, y, z` in 1/256-block fixed point
  - `i16 vx, vy, vz` in 1/256 block per second
  - `u16 yaw`, `i16 pitch`
  - `u8 flags`: flying, onGround, sneak, sprint
  - `u8 heldMaterial`
- **Rate:** 20 Hz while moving or turning; 4 Hz when idle.
- **Receiver clock mapping:** `offset = min over the last 64 packets of (recvLocal - tSend)`. Render remote players at `remoteNow - D`, where `D = clamp(2*interval + 2*jitter_p95, 100, 200)` ms. D defaults to 150 ms, which is three send intervals per Gaffer. Valve's 100 ms tolerates only one lost packet.
- **Interpolation:** Hermite for position using velocity; shortest-arc lerp for yaw; lerp for pitch. Discrete flags come from the older snapshot.
- **On buffer underrun:** extrapolate linearly for up to 250 ms (Valve's `cl_extrapolate_amount`), then hold.
- **Other rules:**
  - a jump of more than 8 blocks between snapshots snaps instead of interpolating
  - stale sequence numbers (wrap-aware u16) are discarded
  - remote avatars are not solid, which avoids needing an authority
  - the local player is never interpolated

## 10. Terrain generator determinism
- **Exact per ECMA-262 (verified):**
  - `+ - * /` and `%`
  - `Math.sqrt`, which returns 𝔽(√n)
  - `floor`, `ceil`, `round`, `trunc`, `abs`, `min`, `max`, `fround`
  - `imul`, `clz32`, and the bitwise operators
  - integer literals, and Float32Array or Float64Array stores
- **Implementation-approximated (banned in the generator):**
  - sin, cos, tan and their inverses, sinh, cosh, tanh and their inverses
  - exp, expm1, log, log1p, log2, log10
  - pow and `**`
  - cbrt, hypot
  
  fdlibm is only a recommendation in the spec, and V8 has left it: on main, `pow` goes through llvm-libc and `tanh` through `std::tanh`.
- **Measured drift:** `Math.pow(x, 1.37)` differs by 1 ulp in 10.39% of 200k inputs between V8 12.4 (Node 22) and V8 13.6 (Node 24) on the same x64 machine. Our Node tests and users' Chrome run different V8 versions, so this would break golden tests and multiplayer.
- **Also banned:** the GPU for anything that decides occupancy. WGSL allows fusion and reassociation, flushes subnormals to zero, and leaves the rounding mode unspecified. Also banned: `Math.random`, `Date`, `performance`, `crypto`, and WASM relaxed-SIMD.
- **Precision:** float64 throughout. Float32 storage is deterministic on the CPU, but not needed.
- **Randomness:**
  - For per-cell randomness, a stateless `hash32(seedLo, seedHi, x, y, z)` built from Math.imul (murmur3 `fmix32`-style).
  - For feature shapes, a stateful sfc32 or xoshiro128** seeded by splitmix32 from the feature origin's hash. Use the 32-bit variants: the 64-bit ones need BigInt.
  - No PRNG state is ever shared across chunks, so generation order cannot matter.
- **Noise:** vendor FastNoiseLite 1.1.1 (MIT; OpenSimplex2, OpenSimplex2S, FBm and domain warp). It uses only `abs`, `floor`, `imul`, `max`, `min`, `round`, `sqrt` and `trunc` (verified by grep), and it is about 16.7 KB gzipped. A 32³ chunk of 4-octave 3D FBm takes about 13–28 ms in Node. It produced the same golden hash on Node 20, 22 and 24.
- **Enforcement in the gate:**
  - ESLint `no-restricted-properties` bans those Math members.
  - `no-restricted-syntax` bans `**` and `**=`.
  - Globals are restricted in `src/world/gen/**` and the vendored noise.
  - Golden SHA-256 hashes for about 32 `(seed, chunk)` cases, including negative and far coordinates such as ±2^22.
  - `npm run check` runs them in Node. CI adds `ubuntu-24.04-arm` (free for public repositories) and Chromium through Vitest browser mode against the **production bundle**, which also catches changes introduced by the bundler.
- **Runtime canary:** each peer hashes a fixed 16³ sample, which takes a few ms. That hash is compiled into the build and sent as `genCanary` in HELLO. A mismatch refuses the join with "terrain generator mismatch".
- **Version policy:** any change to a golden hash requires a new generatorVersion. Old generators and their golden files stay in the bundle forever.

## 11. Tests (all non-rendering, fixed seeds in `npm run check`)
See test_ideas. The core property is a deterministic network simulation, with N from 2 to 6 replicas, random clocks, drops, duplicates, partitions and reorderings. After healing and reconciliation, every replica must hold identical bytes and identical roots.

## 12. Bandwidth for 4 players, full mesh
- **Positions:** 31 B plus roughly 90 B of IP/UDP/DTLS/SCTP overhead *(estimate)* per packet. At 20 Hz to 3 peers that is about 7.3 KB/s, roughly 60 kbps, up and about the same down per player. Adding SCTP acknowledgements, it stays under 100 kbps each way.
- **Edits:** under 0.5 KB/s of payload even during bursts.
- **Join:** about 0.9 MB per 1e5 edits.

## Hypothesis verdict

The structure is right, but the hypothesis as written would not reliably converge and has several gaps.

What is right:
- A state-based per-cell LWW map.
- Removal as `air`, so there are no tombstones to collect. This is correct as long as entries are never deleted.
- Per-chunk digest anti-entropy.
- Unreliable 15–20 Hz positions with about 100 ms interpolation.
- A CPU-only generator using only exact operations. Verified against ECMA-262: + - * /, %, sqrt, floor, round, trunc, fround and imul are exactly specified. sin, cos, exp, pow, **, cbrt, hypot, tanh and similar are implementation-approximated.
- A version check in the handshake.

What is wrong or must change:
1. Pure Lamport ordering lets whoever made the most edits offline win, and gives a malicious peer an unbounded advantage. Use an HLC, and seed it from the maximum stored tag when a world opens.
2. Ordering by (lamport, peerId) alone is not a total order when a tag is duplicated. fast-check produced a divergence counterexample in this session. Add the value as the last tiebreak and require canonical value encoding.
3. The hypothesis never says that deciding whether to accept an op must depend only on the op's bytes. A clock-based rule that 'refuses' future timestamps would itself cause divergence. Such ops must be deferred instead, and rate limits must act on connections.
4. A handshake generatorVersion check does not keep saved worlds working. Every released generator must be frozen and kept forever, guarded by golden hashes, and a runtime canary hash should go into HELLO.
5. Sending bulk state on the same reliable ordered channel as live edits blocks those edits behind it. Use a separate bulk channel with messages of 16 KiB or less.
6. 'splitmix/xoshiro' should be the 32-bit variants (splitmix32, xoshiro128**, sfc32), because the 64-bit ones need BigInt. Per-cell randomness should come from a stateless coordinate hash, so that generation order cannot matter.

Additions:
- Positions should be declared ephemeral state owned by each player, which keeps two problems out of Amorfus: lossy delivery vs deterministic replay, and dead reckoning presuming an authority.
- Any future block simulation (falling sand, water) would invalidate per-cell LWW, because it needs the total order that CRDTs give up.
- Among libraries, the custom LWW map is confirmed as the better choice by measurement.

## Key decisions
- **Representation of replicated world state** → Custom state-based LWW map per cell (about 200 lines), bucketed into 32³ sync chunks, with no dependency
  - why: Measured at 1e6 ops: 2.1 s to apply against 6.5 s (Yjs), 9.4 s (Loro) and 72 s (Automerge). Under heavy overwriting it uses 20 B per live cell against 212–228 B, because the libraries keep history. Its bundle is estimated under 5 KB, against 22.6 KB gzipped for Yjs and more than 1 MB of WASM for Loro and Automerge. None of the libraries supports HLC/physical-time ordering or numeric spatial keys.
  - rejected Yjs 13.6.33: Size grows with ops, not live cells: its README says tombstones cannot be collected. Loading 1e6 ops took 7.1 s. Keys must be strings. Map conflicts are not ordered by time.
  - rejected Automerge 3.5.0: Full history is kept forever. 1e6 ops took 72 s and 1.0 GB of heap. 1.14 MB gzipped WASM.
  - rejected Loro 1.16.3: 1.07 MB gzipped WASM. 228 B per live cell under overwriting. LWW on (lamport, peer), not time. Shallow snapshots trade away the ability to merge with peers who have been offline for a long time (inference).
- **Timestamp for LWW ordering** → Hybrid logical clock (l: ms u48, c: u16), with the local clock set to at least the maximum stored tag when a world opens
  - why: It keeps causality: an edit made after seeing another always wins. It orders concurrent and offline edits by real time, to within clock skew. It stays bounded near physical time, so inflating a timestamp gains at most DELTA_FUTURE.
  - rejected Pure Lamport (the hypothesis): The counter measures activity, so a busy offline peer beats later edits by others. A peer claiming about 2^53 pumps every clock and wins forever.
  - rejected Raw wall clock: No causality: a peer with a slow clock cannot overwrite a block it can see.
  - rejected Multi-value register that shows conflicts: Voxels need exactly one value per cell; a UI to resolve conflicts is out of scope.
- **Total order tiebreak** → (l, c, peer, value), with values encoded canonically
  - why: Duplicate tags can occur (a buggy or malicious peer, or two tabs sharing an id). fast-check found a divergence without the value tiebreak; with it, 2,000 runs passed.
  - rejected (lamport, peerId) only (the hypothesis): Not a total order over distinct entries, so convergence fails when a tag is duplicated.
- **Handling future or invalid timestamps** → Structural bounds (l < 2^47) close the connection. l beyond now + 60 s is deferred in a bounded queue, never rejected. The handshake refuses clock skew above 30 s.
  - why: Acceptance must depend only on the op's bytes, or peers diverge permanently. Deferral affects only when an op applies, not whether it does. The HLC paper's 'ignore' rule, adapted to a CRDT, becomes deferral.
  - rejected Reject far-future ops permanently: A peer whose clock is fast accepts the op while others reject it: permanent divergence.
  - rejected Clamp timestamps on receipt: Changes the op, so replicas hold different entries and diverge.
- **Anti-entropy granularity** → Root digest (8 B), then a streamed list of per-sync-chunk XOR-of-h64 digests (about 14 B per chunk, nearest first), then WANT plus pushing entries for mismatched chunks, all on a separate bulk channel
  - why: Stateless and robust to any delivery path. The same code handles join, rejoin, partitions and import. About 20 KB of digests for 1e5 clustered edits. Aligns with persistence and near-player-first loading.
  - rejected Version vectors or state vectors per origin: Need per-origin contiguity tracking across direct, forwarded and anti-entropy paths; overwritten ops are gone in the LWW state.
  - rejected Range-based set reconciliation (Negentropy, arXiv 2212.13567): More round trips and generic; spatial digests are enough at this scale. Reconsider if chunk counts exceed about 1e5.
  - rejected Region-level digest tree: Unnecessary at about 1–10k edited chunks; add it only if measurements call for it.
- **Wire encoding** → Hand-written DataView codecs with varints, messages of 16 KiB or less
  - why: POS is 31 B, against 48–94 B in msgpack and 76–96 B in CBOR (measured). Bulk data is packed integers. Saves 6–11 KB gzipped. Exact field widths.
  - rejected @msgpack/msgpack 3.1.3: Larger hot messages (float64 unless forceFloat32); no benefit for packed bulk data.
  - rejected cbor-x 1.6.6: Same objections, and 10.8 KB gzipped.
- **Player position model** → Each player is authoritative for their own avatar; ephemeral; 20 Hz on an unreliable, unordered channel; 150 ms Hermite interpolation (adaptive 100–200 ms); at most 250 ms of extrapolation
  - why: Positions are not converged state, so loss is harmless. Gaffer recommends a buffer of about 3× the send interval; Valve's default is 100 ms at 20 Hz. A building game values smoothness over latency.
  - rejected Replicating positions through the CRDT: Pointless persistence and traffic; positions have exactly one writer.
  - rejected Extrapolation-first (dead reckoning): Visible errors on collision; it also presumes an authority to correct it.
- **Generator determinism enforcement** → CPU, float64, exact-operation subset enforced by ESLint; golden SHA-256 hashes run in Node (x64 and arm64) and in Chromium against the production bundle; a runtime canary hash in HELLO
  - why: The spec leaves transcendental functions implementation-approximated. V8 now routes pow through llvm-libc and tanh through the host libm. Math.pow was measured differing in 10% of samples between V8 12.4 and 13.6.
  - rejected Generating on the GPU in WGSL: The spec allows fusion and reassociation, flushes subnormals to zero, and leaves the rounding mode unspecified.
  - rejected Trusting the handshake generatorVersion alone: Does not detect an engine or bundler anomaly on one machine; the canary does, cheaply.
- **Generator version lifecycle** → generatorVersion is fixed per world. Every released generator stays in the bundle, frozen, with its golden file.
  - why: A world is seed plus edits over infinite terrain; changing the generator moves the ground under existing edits and cannot be converted.
  - rejected Refuse to open old worlds: Violates the requirement that worlds survive reloads.
- **Peer identity** → 64 random bits per session, not persisted
  - why: Unique tags across tabs and sessions, no tracking, no central identity; the value tiebreak covers collisions.
  - rejected Persistent per-browser id or Ed25519 key: Two tabs would share an id, and it acts as a tracking identifier. Signatures are deferred until after MVP.

## Facts
- [V] Latest npm versions on 2026-09-23: yjs 13.6.33 (14.0.0-16 on the beta tag), @automerge/automerge 3.5.0, loro-crdt 1.16.3, fast-check 4.10.2 (published 2026-09-19, MIT), @msgpack/msgpack 3.1.3, cbor-x 1.6.6, simplex-noise 4.0.3, vitest 5.0.1 (5.0.0 published 2026-09-03; latest 4.x is 4.1.11), @fast-check/vitest 0.5.0 (peer dependency vitest ^4.1.0 || ^5.0.0) — npm registry via `npm view` (https://registry.npmjs.org/)
- [V] Bundle sizes measured with esbuild --minify: yjs (Doc + Map + encodeStateAsUpdate) 75,188 B min / 22,577 B gzipped; @msgpack/msgpack 5,911 B gzipped; cbor-x 10,790 B gzipped; simplex-noise 780 B gzipped; fastnoise-lite 16,689 B gzipped — Local measurement in the scratchpad (esbuild + gzip -9)
- [V] The Loro WASM is 3,269,100 B raw / 1,073,805 B gzipped; the Automerge WASM is 3,644,225 B raw / 1,136,576 B gzipped — Local measurement of node_modules/*/…wasm
- [V] Benchmark at 1e6 map sets (80% distinct keys), Node 22.22.1: custom naive LWW 2.1 s apply, 16.0 MB encoded, 0.41 s load; Yjs 6.5 s, 18.9 MB, 7.1 s load; Loro 9.4 s, 24.6 MB, 20 ms (lazy) load; Automerge 72 s, 1.02 GB heap, 7.9 MB, 3.9 s load — Local benchmark script, proto/crdt/bench.mjs (single run, single writer)
- [V] Overwrite-heavy workload (1e6 ops onto about 50k cells): encoded size per live cell is 20 B (custom), 212 B (Yjs) and 228 B (Loro); Automerge is 84 B per live cell at 2e5 ops onto 10k cells and took 22 s — Local benchmark script, proto/crdt/bench2.mjs
- [V] Yjs cannot garbage-collect deleted structs (tombstones) while ensuring a unique order of structs — https://github.com/yjs/yjs/blob/main/README.md (Yjs CRDT algorithm section; also read from the installed package README)
- [unverified] LoroMap resolves concurrent sets on one key by last-writer-wins on (lamport, peer) — https://loro.dev/docs/tutorial/map (returned 403; the claim comes from a search snippet quoting a Loro Go port's docs, https://pkg.go.dev/github.com/Deln0r/loro-go/loro)
- [V] Loro supports 'shallow-snapshot' export (a garbage-collected snapshot up to given frontiers); ops before the shallow start are not in the document — loro-crdt 1.16.3 bundler/loro_wasm.d.ts (installed package typings)
- [V] HLC algorithm: on a send or local event, l := max(l', pt) and c increments or resets. On receive, l := max(l', l.m, pt) with the stated c rules. The paper adds a rule to ignore out-of-bounds messages whose l diverges too much from pt, with Δ possibly on the order of seconds, and calls HLC useful for LWW systems — https://cse.buffalo.edu/tech-reports/2014-04.pdf (Kulkarni, Demirbas et al., Logical Physical Clocks; fig. 5 and section 4)
- [V] ECMA-262: Number::add and Number::multiply are defined by IEEE 754-2019 binary64 and return 𝔽(exact result). Math.sqrt returns 𝔽(the square root of ℝ(n)). Math.floor and Math.fround (roundTiesToEven to binary32) are exact — https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html and https://tc39.es/ecma262/multipage/numbers-and-dates.html
- [V] ECMA-262: Math.sin, cos, exp, hypot, and Number::exponentiate (Math.pow and **) return implementation-approximated values. The spec only recommends, and does not require, fdlibm — https://tc39.es/ecma262/multipage/numbers-and-dates.html (§21.3.2) and ecmascript-data-types-and-values.html (Number::exponentiate)
- [V] V8 main src/base/ieee754.cc includes third_party/llvm-libc; pow is implemented as LIBC_NAMESPACE::shared::pow and tanh as std::tanh (host libm) — https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/base/ieee754.cc
- [V] Math.pow(x, 1.37) gives results 1 ulp apart in 20,785 of 200,000 inputs (10.39%) between V8 12.4 (Node 22.22.1) and V8 13.6 (Node 24.21.0) on the same x64 machine. Math.sin, cos, tan, exp, log, tanh, cbrt, atan2 and sqrt matched across Node 18, 20, 22 and 24 for the same sample — Local experiment, proto/crdt/mathdiff.mjs and powdump.mjs
- [unverified] Since Chrome 148, Math.tanh uses the host libm and differs by OS; other V8 math is bundled (llvm-libc, plus a glibc-derived sin/cos) and identical across OSes — https://scrapfly.dev/posts/browser-math-os-fingerprint/ (secondary source; the tanh part agrees with the std::tanh in V8 source)
- [V] WGSL permits reassociation, fusion of operations, flushing subnormals to zero, and does not specify a rounding mode — https://www.w3.org/TR/WGSL/ §15.7 (Floating Point Evaluation)
- [V] FastNoiseLite 1.1.1 (MIT, last published 2024-03-05) includes OpenSimplex2 and OpenSimplex2S and uses only Math.abs, floor, imul, max, min, round, sqrt and trunc — npm fastnoise-lite 1.1.1 FastNoiseLite.js (grep); https://github.com/Auburn/FastNoiseLite
- [V] simplex-noise 4.0.3 uses only Math.floor, Math.sqrt (for module constants) and Math.random (as a default argument only) — node_modules/simplex-noise/dist/esm/simplex-noise.js (grep)
- [V] The same FastNoiseLite 4-octave OpenSimplex2 FBm golden hash (d4d371d5911418fb) came out on Node 20.20.2, 22.22.1 and 24.21.0 (x64). Four 32³ chunks took 52–114 ms — Local experiment, proto/crdt/gold.mjs
- [V] LWW convergence under shuffles and duplicates fails when (l, c, peer) is the whole order and a tag is duplicated with different values; adding value as the final tiebreak passes 2,000 fast-check runs — Local fast-check 4.10.2 property, proto/crdt/prop.mjs
- [V] Chunk-grouped binary encoding of clustered synthetic edits: 9.04–9.11 B per edit raw, about 7.0 B after deflate-raw; 1e5 edits = 0.90 MB in 1,381 chunks; 1e6 edits = 8.2 MB — Local experiment, proto/crdt/enc.mjs (synthetic data)
- [V] A position message is 48–94 B in msgpack and 76–96 B in CBOR, against 31 B in the proposed fixed DataView layout — Local measurement (msgpack and cbor-x); the custom size is calculated
- [V] Without RFC 8260 message interleaving, a large message on one data channel can cause head-of-line blocking on others; browsers support messages of at least 256 KB but small messages are advised — https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
- [unverified] Chrome (in the usrsctp era) closed a data channel when a message exceeded 256 KiB — https://blog.mozilla.org/webrtc/large-data-channel-messages/ (search snippet; current dcSCTP behaviour not checked)
- [V] Source engine: about 20 snapshots/s; default interpolation 100 ms (cl_interp 0.1) tolerates one lost snapshot; extrapolation is limited to 0.25 s (cl_extrapolate_amount) — Valve 'Source Multiplayer Networking' (https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking returned 403; read via the mirror https://gist.github.com/CoolOppo/fe0586836de3fb2f90f9)
- [V] Gaffer: size the interpolation buffer to about 3× the send interval, so two packets in a row can be lost (10 Hz gives 350 ms including jitter); Hermite with velocity removes jitter; extrapolation breaks down on collisions — https://gafferongames.com/post/snapshot_interpolation/
- [V] Ed25519 in WebCrypto shipped by default in Chrome 137 — https://chromestatus.com/feature/4913922408710144 ; https://developer.chrome.com/release-notes/137
- [V] GitHub arm64 hosted runners (ubuntu-24.04-arm) have been free and generally available for public repositories since August 2025, and available in private repositories since 2026-01-29 — https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/ ; https://github.blog/changelog/2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/
- [V] Range-Based Set Reconciliation (Meyer), implemented by Negentropy — https://arxiv.org/abs/2212.13567 ; https://github.com/hoytech/negentropy
- (removed: private source)
- [unverified] Per-packet overhead of IP, UDP, DTLS and SCTP on data channels is roughly 80–100 B — inference from header sizes (IPv4 20 + UDP 8 + DTLS about 29–37 + SCTP 12 + DATA chunk 16)
- [unverified] Data channel bulk throughput of 1–5 MB/s on typical links — inference / recollection
- [unverified] The JS spec forbids fused multiply-add contraction of separate * and + (each operation returns its own rounded result), so a conforming V8 JIT cannot contract them — Inferred from ECMA-262 Number::add/multiply returning 𝔽(exact result); V8 JIT behaviour not directly verified

## Risks
- (medium) A system clock skewed within the allowed 30 s makes that peer win concurrent same-cell conflicts inside the skew window | impact: Occasionally the 'wrong' block wins a race on one cell; all peers still converge | mitigation: Warn in the handshake above 2 s and refuse above 30 s. Document that 'last edit wins' is accurate to within clock skew.
- (medium) Anyone holding the room link can overwrite or vandalise any cell; there is no authority for local muting or bans | impact: Griefing in shared worlds | mitigation: Share links only with people you trust. Evict by switching to a new room code (world data carries over). Post-MVP: signed ops plus a membership list signed by the creator.
- (medium) A generator change (including a dependency or bundler update) silently changes terrain under existing edits | impact: Saved and shared worlds break; peers disagree about which cells are solid | mitigation: Golden hashes in npm run check. CI on x64, arm64 and Chromium against the production bundle. Runtime genCanary in HELLO. Frozen generator versions. The noise library is vendored and pinned.
- (medium) A validation or rate-limit rule accidentally depends on local state or time and drops ops | impact: Permanent silent divergence between honest peers | mitigation: Property test that validate(bytes) is pure. Rate limits close connections rather than dropping ops. Future timestamps are deferred, and anti-entropy recovers anything deferred or dropped.
- (low) Large worlds (1e6 edits, about 8 MB) take seconds to join and use more than 100 MB of memory | impact: Slow joins; memory pressure on integrated-GPU laptops | mitigation: Stream nearest chunks first; the world is walkable from the seed immediately; caps of 4e6 entries and 64 MB; show a progress indicator.
- (medium) Edits are lost for others when their author leaves before any peer has received them | impact: Other players never see those edits until the author returns | mitigation: The author's local save keeps them and they merge on next contact. Show an 'unsynced edits' indicator.
- (high) Players on different IPFS builds (different CIDs) cannot play together | impact: Joins are refused after an update | mitigation: Bump protocolVersion rarely. Accept a version range where possible. The refusal message names the required version and points to amorf.us.
- (medium) Two tabs open on the same world overwrite each other's IndexedDB writes | impact: Lost local edits (breaks precondition P7) | mitigation: Use a Web Lock per world; the second tab shows 'open in another tab' (for the persistence area).
- (medium) Head-of-line blocking or congestion from bulk transfer delays live edits | impact: Visible edit lag during joins | mitigation: Separate bulk channel, messages of 16 KiB or less, bufferedAmountLowThreshold backpressure.
- (low) Adding block simulation later (fluids, falling blocks) invalidates per-cell LWW | impact: The sync model would need redesigning (it needs the total order that CRDTs give up) | mitigation: Record it as an explicit non-goal in the plan; any such feature must first propose an ordering model.

## Requirement conflicts
- [major] 'A world can be shared as a seed plus edits' + 'Worlds save locally … survive reloads' (implicitly: the terrain generator can evolve): Seed-plus-edits only works if the generator produces bit-identical terrain for that world forever. Improving terrain later would move the ground under existing edits, and infinite terrain cannot be converted. → Fix generatorVersion per world. Keep every released generator frozen in the bundle with golden hashes. New terrain features apply only to new worlds.
- [major] 'Rendering via WebGPU' + 'Terrain generation … must not stall the frame loop' vs 'Conflicting edits resolve deterministically so all peers end up with the same world': Generating terrain on the GPU is tempting for speed, but WGSL allows fusion, reassociation, flushing subnormals to zero and an unspecified rounding mode, so occupancy would differ between machines. → Decide occupancy and materials in Web Workers on the CPU, in float64, with exact operations only. Use the GPU only for derived visuals.
- [minor] 'Conflicting edits resolve deterministically so all peers end up with the same world' + 'Peer-to-peer … No game server': Convergence holds only among peers that eventually exchange ops. Edits by someone who leaves before anyone syncs them are missing until that player returns. With no authority, nothing stops a player holding the link from overwriting anything, and no one can ban them consistently. → Spell out the preconditions P1–P7 in the plan. Accept vandalism risk for MVP (trusted links, new room code to evict). Signed membership after MVP.
- [minor] 'Must work when served from IPFS' (immutable per-CID builds) + multiplayer version compatibility: Old builds stay reachable forever at their CIDs, so players can be running different protocol or generator code and must be refused. → Use a protocolVersion range policy, a refusal message that names the needed version, and keep old generators in new builds.
- [minor] The implied 'last edit wins' intuition vs 'No game server' (no shared clock): The result is deterministic, but 'last' is exact only to within the clock skew between peers; without a coordinator it cannot be exact. → Use an HLC with causality guaranteed, a handshake skew warning above 2 s and refusal above 30 s, and document the rule.
- [minor] 'Worlds save locally' + 'Players can join a shared world via a link': Edits a player makes offline to a copy of a shared world merge into everyone's world on the next session, which some players may find surprising. → Default to merging (the natural CRDT behaviour, with real-time ordering). Offer 'Save as copy' (new worldId) for forks. The owner should confirm.

## Third-party deps
- FastNoiseLite (fastnoise-lite 1.1.1, vendored copy) (Jordan Peck / Auburn (MIT, github.com/Auburn/FastNoiseLite)) build-time (vendored into the bundle), then runs in the browser at runtime: OpenSimplex2 / FBm noise for the deterministic generator | sees: Nothing: pure local computation, no network
- fast-check 4.10.2 (Nicolas Dubien / dubzzz (MIT)) build-time (dev and test only): Property-based tests for merge, the convergence simulation, codecs and the HLC | sees: Nothing at runtime
- @fast-check/vitest 0.5.0 (optional) (dubzzz (MIT)) build-time (dev only): Vitest integration for properties | sees: Nothing at runtime
- Vitest browser mode with the Playwright provider (@vitest/browser-playwright 5.0.1) and Chromium (Vitest team / Microsoft (Playwright)) build-time (CI): Runs golden determinism tests in real Chromium against the production bundle | sees: Nothing at runtime
- GitHub Actions hosted runners (ubuntu-24.04, ubuntu-24.04-arm) (GitHub) build-time (CI): Cross-architecture determinism checks | sees: Source code and test output

## Test ideas
- Semilattice laws on merge for arbitrary states, including duplicate tags with different values: commutative, associative, idempotent (fast-check).
- Deterministic network simulation (fc.commands or fc.scheduler) with 2–6 replicas. Random edits, per-replica physical clocks with skew and backward jumps, message drops, duplicates, reorderings, partitions and rejoins. After healing and reconciliation to quiescence, all replicas have identical serialized state and identical roots.
- Causality property: if replica R applied op a (or created it) before creating op b on the same cell, b wins on every replica.
- HLC properties: strictly increasing per replica even when Date.now() goes backwards; l - pt stays within the accepted skew; c stays within u16; after opening a world, local l is at least the maximum stored l.
- Deferral property: ops with l beyond now + 60 s are neither applied nor fed to the HLC until the local clock passes them, then converge. The queue overflows to a connection close, never a silent drop.
- Validation purity: validate(bytes) returns the same verdict whatever the replica state and wall time (except the future-time deferral classification).
- Codec round-trip for every message type: decode(encode(m)) deep-equals m.
- Fuzz: decode(random Uint8Array up to 64 KiB) never throws uncaught and never allocates past its caps.
- Incremental digests equal a from-scratch recomputation after any op sequence; XOR roots match between replicas exactly when their states match (on generated states).
- Anti-entropy efficiency regression: for d differing chunks out of n, bytes transferred stay at or below 14·n + (d × average chunk size) × 2 + a constant.
- Golden determinism: SHA-256 of generator output for about 32 (seed, chunk) cases, including negative and ±2^22 coordinates. Run in Node on x64 and arm64, and in Chromium via Vitest browser mode against the production bundle. Any change fails unless the generatorVersion is new.
- Order independence: generating the same chunk set in random orders and in separate workers gives identical hashes.
- A lint test that feeds a fixture file using Math.sin and ** under src/world/gen and asserts ESLint fails, so the gate itself is tested.
- Runtime canary: the constant compiled into the build equals the value computed in Node and in Chromium.
- Position interpolation: synthetic streams with jitter, loss (2 in a row) and reordering produce continuous rendered paths; extrapolation stops at 250 ms; a teleport snaps.
- Import-merge equivalence: exporting A and importing into B gives the same state as a live sync between A and B.

## Milestone notes
Order matters because golden hashes and the wire format are hard to change once worlds exist.

M0 (with the world data model, before rendering):
- the canonical cell value codec
- the HLC
- the LWW store with incremental chunk and root digests
- the frozen generator v1 with the ESLint determinism rule
- the golden hash suite
- the convergence simulator with fast-check properties

All of this is testable in Node and wired into `npm run check` from day one.

M1 (with the P2P transport):
- HELLO with version, world and canary checks and the clock-skew check
- the three data channels
- live EDITS broadcast
- POS at 20 Hz with interpolation
- the two-machine acceptance test

M2:
- symmetric anti-entropy (ROOT, then CHUNK_DIGESTS, then WANT and CHUNK_ENTRIES), nearest first
- forward-on-change for partial meshes
- periodic 15 s ROOT
- integration with persistence and import, where import is the same join
- a Web Lock per world

M3 (hardening):
- a total decoder with fuzz properties
- message and rate caps
- the deferral queue
- the CI matrix on arm64 and Chromium against the production bundle

Can be deferred past MVP:
- Ed25519-signed ops and membership
- region-level digests or RBSR
- deflate on bulk data
- adaptive interpolation delay beyond a fixed 150 ms
- idle-rate reduction for POS
- an 'N of your edits were overwritten' notice
- a UI for clock-offset estimation

## Open questions
- Should offline edits to a copy of a shared world merge back on the next session (the natural CRDT behaviour), or should a shared world be read-only offline unless forked with 'Save as copy'?
- Are the clock-skew thresholds right: warn above 2 s, refuse above 30 s, defer ops more than 60 s in the future?
- Is 'anyone with the link can overwrite anything' acceptable for MVP, with eviction by a new room code, or is signed membership required?
- Compatibility policy between IPFS builds: must protocolVersion match exactly, or should a supported range be accepted?
- World bounds: horizontal range (proposed ±2^23) and vertical range per generatorVersion. The sync chunk size of 32³ is proposed as a protocol constant independent of render chunk size.
- Should remote avatars be solid for local collision? Proposed: no, which avoids needing an authority.
- Is a hard cap on world size acceptable (proposed 4e6 edited cells per transfer), with a clear error beyond it?