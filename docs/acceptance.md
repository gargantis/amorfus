# Acceptance

Living document. The reference device, scenario definitions and frame-time
criteria are **agreed at the M2 exit** (C-6); the network matrix at M0/M7
(D-2). Manual run results are committed here.

## Reference device (D-1)

Not yet named by the owner. Fallback per the approved plan: the i7-1255U /
Iris Xe laptop in Windows Chrome and Edge; the Medium tier must pass on it,
with Medium's radius 160 (C-19).

## Scenarios (defined at M2, run from M5)

- **Scenario A:** scripted 90 s walk/fly/edit run — criteria per C-6.
- **Scenario B:** 4 peers, one joining a world of 1e5 edits mid-run,
  remote edits at 10/s.
- Pass bars (C-6): frame interval p95 ≤ 18.3 ms, p99 ≤ 25 ms, max ≤ 50 ms
  after the 10 s load window; no main-thread long task over 50 ms;
  edit-to-visible p95 ≤ 33 ms, p99 ≤ 50 ms; tier never changes; persistence
  on (from M6).

## Network matrix (D-2)

Must pass: same LAN; two home broadband lines on different ISPs; amorf.us ↔
local kubo/SWG on the same release; 4 players on ≥ 3 networks. Best effort:
hotspot legs, UDP-blocked networks. **Awaiting owner-provided machines and
people** for the M0 spike and M7 matrix.

## Convergence preconditions → test IDs (M1, §11.5)

| ID | Precondition | Test (file › name) |
|---|---|---|
| P1 | Eventual delivery over a connected graph | `convergence.test.ts › converges {2,4,6} replicas under drops, dups, delays, partitions and skew`; `session.test.ts › forwards live edits around a blocked pair via the common neighbour` |
| P2 | Acceptance depends only on the op's bytes; time only defers | `session.test.ts › defers future stamps and applies them at maturity`, `› evicts the largest-l deferred op at the 4096 cap`, `› closes the connection on a structurally invalid entry` |
| P3 | Same comparator everywhere; canonical values | `lww.test.ts › orders by l, then c, then peer, then value`, `› converges from any delivery order and duplication (semilattice)`; `block.test.ts › accepts exactly the canonical values` |
| P4 | Bit-identical generators, kept forever | `generator.test.ts › matches the frozen golden hashes` (36 cases, Node); e2e `smoke.spec.ts` canary (production bundle in Chromium); CI arm64 job |
| P5 | Material registry fixed per protocol version | `block.test.ts › registers the v1 materials in order` |
| P6 | No accepted entry is ever deleted (clock-ahead repair excepted) | `lww.test.ts › counts entries and never deletes them (P6)`; `convergence.test.ts › clock-ahead repair: +3 h offline edits restamp, then converge` |
| P7 | Exact save/load and import round-trips; one writer per world | codec part now: `chunk-entries.test.ts › round-trips and re-encodes to identical bytes`; `container.test.ts › round-trips a backup file`, `› decodes the committed v1 golden fixture`. IndexedDB + Web Locks land at M6 |

Further §14 world/sync/codec items: band uniformity, order independence and
partition invariance → `generator.test.ts`; hint sign/non-zero →
`generator.test.ts › hints are never zero…`; HLC monotonic → `hlc.test.ts ›
is monotonic across arbitrary send/receive sequences`; causality →
`convergence.test.ts › causality…`; digest collision → `digest.test.ts ›
distinguishes states built to collide under an XOR digest`; wire caps →
`messages.test.ts › enforces the 16 KiB ceiling`; share-profile rebase →
`container.test.ts › share profile strips identity…`. Import-merge ≡ live
sync is an M6 item by design.

## Measured (M1, dev machine, Node 22.22)

- Memory per live entry ≈ **64 B** (1e5 clustered entries; D-23 input —
  4e6 entries ≈ 256 MB, the D-23 cap stands).
- Encoded size, 1e5 clustered synthetic entries: **192 KiB** total
  (~2 B/entry; flattering data — real-world sizes measured again at M6).
- A 1e5-entry join over the loopback transport converges within the caps:
  `convergence.test.ts › a 1e5-entry join completes within the caps`.

## Measured (M3, dev machine, Node 22.22, warm JIT)

- meshRegion 38³ (no edits): ≈ 7.5 ms; GEN_MESH incl. generation ≈ 10 ms
  mean over the R = 192 ring.
- **C-12 probe:** 8-chunk corner edit, 52³ GEN_MESH serial: 181.5 ms total
  (22.7 ms/chunk warm, generation included). On 6 workers that is ~2
  rounds ≈ 45–60 ms edit-to-visible on this (floor-class) machine — the
  33 ms p95 target needs the M4 edit-worker reservation and REMESH (which
  skips generation), else the plan's escalation (accept 50/67 ms) goes to
  the owner at M5. Status recorded in docs/conflicts.md.
- Budget proxies at R = 192, seed [1,1]: **1.20 M triangles / 298 meshed
  chunks / 18.9 MiB dense voxels** — under the 1.5 M / 400 / 32 MiB
  thresholds (gate-enforced in mesh-goldens.test.ts). Required the cave
  mask (CAVE_MASK_MIN 0.4): without it caves honeycombed 5.4 M triangles.
- Physics limits: slope limit 50° and step-up 0.6 stay PROVISIONAL; the
  M3 shapes allow re-derivation at M5 when the capsule controller lands.

## Measured (M5, dev machine, SwiftShader harness run)

- The full §14 physics battery passes: all three D-3 gate tests (dig a
  1×2 tunnel and walk through; walk under a roof placed 2 above untouched
  ground at phases 0/0.2/0.45; walk through a 1-wide gap between a placed
  and a natural wall), 1-rise climb, 2-rise and sharp-wall blocks, hitching
  sprint-fly never inside solid, terminal-velocity landing, cross-border
  collision, unready-chunks-solid.
- Slope limit 50° and step-up 0.6 are RE-DERIVED and confirmed, with the
  wall-split slide rule (steep contacts slide against their horizontal
  normal only) — without it the C-9 residual 41–51° faces were climbable.
- Scenario A harness validated end-to-end under SwiftShader:
  **splitSwaps = 0** (§9.4 contract). Frame percentiles under software
  rasterisation (p50 ≈ 0.7 s at Medium/R160) measure SwiftShader, not the
  game — the C-6 numbers come from the owner's D-1 device run.
