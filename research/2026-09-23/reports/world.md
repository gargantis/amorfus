# world: Chunk/world data model, performance budget, player systems

## Recommendation

## Evidence base
**What I read and ran.** I read `amorfus/README.md` and `REQUIREMENTS.md`, plus private owner material (not described here).

`/proc/cpuinfo` shows this dev machine is an **Intel i7-1255U**: 2 P-cores and 8 E-cores, 12 threads, with an **Iris Xe 96EU** iGPU. That makes it a real "integrated GPU laptop" floor device, so I measured on it. The benchmarks are under `research/2026-09-23/proto/bench/`:
- `voxel.mjs`: generator plus naive and optimised binary Surface Nets.
- `bench.mjs`, `bench2.mjs`, `par.mjs`: throughput.
- `msg.mjs`: messaging cost.
- `shape.mjs`: slope angles of canonical shapes.
- `table.py`: memory and draw-count estimates.

All of them ran in Node 22.22.1, which uses the same V8 engine as Chrome, under WSL2. **Anything labelled "measured" is from these runs. Anything labelled "est." is my inference.**

## 0. Changes to the working hypothesis (summary)
| Hypothesis item | Verdict | Change |
|---|---|---|
| 32³ cubic chunks, Uint16 blocks | **Keep** | Add a uniform-chunk representation from day one. Defer palette compression. Fix the bit layout (below). |
| Chunk = gen(seed, coord) + edits, a derived cache | **Keep** | Edits are stored as final per-voxel values, not operations. Noise must be sampled only at world-aligned positions. |
| Pipeline requested→generated→meshable (26 neighbours generated)→meshed→uploaded | **Change** | Worker generates the padded 34³ region inline, then meshes it in the same job. No neighbour dependency. At R=192 this needs ~15–20% more gen work per chunk, while the 26-neighbour rule needs +35% more chunks (an extra ring). |
| Pool = hc−1, capped at ~6 | **Refine** | Pool = clamp(hc−2, 2, 6), plus a *dynamic in-flight cap*: whole pool while loading, 2 streaming jobs + 1 edit lane during play. Measured: 10 workers are slower than 6 on this 2P+8E chip. |
| Transfer, don't share | **Keep** | SAB needs COOP+COEP, which IPFS gateways can't send. It could later be an optional path on amorf.us via `_headers`. |
| Main thread holds block data | **Keep** | Reject a separate "world worker". |
| Collision against a per-chunk CPU copy of mesh triangles | **Change** | Re-extract the local geometry from the voxels with the *same pure mesher kernel*. No stored copies, and collision is correct in the same frame as an edit. |
| AABB 0.6×1.8 | **Change** | Use a capsule (r 0.3, h 1.8) for movement. Keep the AABB only as a placement-exclusion test. |
| Auto-step for 1-block ledges | **Reject** | Step height 0.6 (Minecraft's value). A smoothed 1-block rise is already a 45° ramp, so it is walkable under a 50° slope limit. A 1-block auto-step would make sharp 1-block walls useless as walls, and walls are the requirement's stated use case for sharp blocks. |
| Per-frame upload caps | **Keep** | Add atomic swap of all chunks in an edit transaction, exempt from the cap. |

## 1. Chunk size and block format
**Block = Uint16.**
- Bits 0–7: material id (0 = air).
- Bit 8: `sharp`.
- Bits 9–15: reserved, and must be 0 in v1.

**Chunk = 32×32×32**, cubic, keyed by integer (cx, cy, cz). Use a numeric Map key instead of strings: `((cx+2^20)*2^21 + (cz+2^20))*2^11 + (cy+2^10)`. That is below 2^53, so the world is bounded to ±33.5M blocks horizontally and ±32k blocks vertically.

A chunk's storage is one of:
- `{kind:'uniform', value}`: no array. Nearly all sky and deep rock.
- `{kind:'dense', voxels: Uint16Array(32768)}` (64 KiB).

"Uniform" for *meshing* means the padded 34³ region is uniform. Under the lower-sample edge-ownership rule, a uniform-air chunk directly under an overhang still owns the ceiling quads, so it still has to be meshed.

Measured on my test terrain (y-band [−32, 128), caves, 4-block lattice) and projected with `table.py`:

| R (blocks) | S | columns | dense chunks | meshed chunks (total draws) | est. visible draws (×0.4) | voxel RAM raw | voxel RAM 4-bit palette | triangles total | GPU mesh est. |
|---|---|---|---|---|---|---|---|---|---|
| 128 | 16 | 241 | 981 | 740 | ~296 | 7.7 MiB | 2.0 | 0.54 M | 7.7 MiB |
| 128 | 32 | 69 | 203 | 169 | ~68 | 12.7 MiB | 3.2 | 0.62 M | 8.8 MiB |
| 192 | 16 | 497 | 2023 | 1526 | ~610 | 15.8 MiB | 4.1 | 1.11 M | 15.9 MiB |
| 192 | 32 | 137 | 403 | 336 | ~134 | 25.2 MiB | 6.3 | 1.22 M | 17.5 MiB |
| 256 | 16 | 877 | 3569 | 2692 | ~1077 | 27.9 MiB | 7.2 | 1.96 M | 28.1 MiB |
| 256 | 32 | 241 | 709 | 590 | ~236 | 44.3 MiB | 11.1 | 2.15 M | 30.9 MiB |

Why 32³ over 16³:
1. **Memory doesn't decide it.** Both stay under 45 MiB up to R=256. 16³ saves ~35% only because its finer uniform elision skips more air and rock.
2. **Draw count decides it.** 16³ needs ~4.5× more draws: ~600 vs ~135 visible at R=192. PlayCanvas measured ~1.2 µs/draw including the engine on an M4 Max (20k draws in 23.6 ms CPU). three.js WebGPURenderer is worse: issue #30560, still open, shows 20k unbatched meshes at ~15 fps on an M1 Pro, roughly 3 µs+/mesh. At est. 2–5 µs/draw on a laptop CPU, 600 draws cost 1.2–3 ms per frame against 0.3–0.7 ms for 135.
3. **5× fewer jobs, messages and Map entries.**
4. **Edit remesh cost is affordable for 32³** (see §4).

16³ edits are 6× cheaper per chunk, but that doesn't matter once the 32³ corner case fits inside 2 frames. Palette compression is deferred; it only becomes necessary at R>256 or under a voxel budget below 64 MiB. Rejected middle ground: 32³ data with 16³ mesh sections, which is more complexity for no requirement.

## 2. Throughput (measured, i7-1255U, one thread unless noted)
**Meshing.** Optimised binary Surface Nets, core only, with a per-mask vertex table (no normals, materials or relaxation):
- 32³: **0.66 ms** mean (p95 1.08, max 1.49), ~1,520 quads per non-uniform chunk.
- 16³: 0.11 ms.
- 64³: 5.1 ms.

That is ~20–27 ns per voxel. The naive version of the same algorithm is 3.0 ms per 32³ chunk. The production mesher will add normals, per-vertex material, sharp-block faces, owner ids and whatever smoothing the smoothing area picks: est. **×2–3, so 1.3–2 ms per 32³ chunk on a P-core and up to ~2× that on an E-core**.

**Generation, 32³ chunk with padding (34³).** The 3D noise here is 3D simplex (`simplex-noise` 4.0.3, which its README benchmarks at 47.9M noise3D/s on a 5950X):
- 3D noise sampled on a world-aligned 4-block lattice with trilinear interpolation: **2.1 ms** per dense chunk.
- 3D noise sampled per voxel: 5.3 ms.

The lattice is a 2.5× win. Minecraft samples density on 4×8×4-block cells for the same reason.

**Parallel gen+mesh** (core mesher), 720 chunks, 408 of them dense:

| Workers | Chunks/s | Job p95 | Job max |
|---|---|---|---|
| 1 | 909 | 2.5 ms | — |
| 2 | 1,403 | — | — |
| 4 | 1,951 | — | — |
| **6** | **2,937** | **4.0 ms** | — |
| 10 | 2,586 | 8.2 ms | 18 ms |

10 workers is oversubscription and is slower than 6. Est. production throughput at 6 workers: ~1,000–1,500 chunks/s.

**Initial fill at R=192:** 137 columns × ~5 band layers ≈ 685 jobs, ~400 dense → **~0.3–0.7 s** of worker time. The upload cap in loading mode is 16 meshes/frame, so 336 meshes take ~21 frames (0.35 s). Play can start once the 3×3×3 physics region plus in-frustum chunks within 64 blocks are ready, est. ≤200 ms.

**Steady state:** the new-column rate is 2·R·v/S². At R=192:

| Movement | Speed | Chunk jobs/s | Worker CPU |
|---|---|---|---|
| Sprint-fly | 22 b/s | ~41 (~24 dense) | ~50–100 ms per second, i.e. <10% of one core |
| Walk | 4.3 b/s | ~8 | negligible |

Generation throughput is **not** the bottleneck. The things that can actually stall are main-thread per-chunk work (message handling, buffer sub-allocation, GC) and CPU/iGPU power sharing.

**Messaging** (Node worker_threads, a proxy for the browser):
- Round trip: ~0.25 ms p50.
- 78.6 KB copy: 0.48 ms p50, vs 0.25 ms when transferred.
- Assembling a padded 34³ array from 27 loaded neighbours on the main thread: **0.15 ms**.

## 3. Thread architecture (recommended)
**Main thread owns:**
- **WorldStore**: chunk map, per-chunk `version`, and storage (uniform or dense).
- **EditLog**: `Map<chunkKey, Map<localIndex(15 bits), {value, stamp}>>`, where the stamp format comes from the sync area. Edits are final values (0 = air), applied after generation, so the result is idempotent and order-free once resolved.
- Scheduler, physics, picking, GPU upload and render, and networking.
  - RTCDataChannel became transferable to workers in Chrome/Edge 130, so networking can move off the main thread later. It isn't needed: 4 players' traffic is tiny.

**Worker pool.** Size = `clamp(navigator.hardwareConcurrency − 2, 2, 6)`, created as module workers via `new Worker(new URL('./mesh.worker.ts', import.meta.url), {type:'module'})` with Vite `base:'./'`. Workers are stateless apart from the seeded generator tables and scratch buffers. Each worker has at most 1 job in flight, and the queue stays on the main thread so priorities can pre-empt.

Jobs:
- `GEN_MESH{coord, seedHash, genVersion, edits within the padded region, editSeq}`. The worker generates 34³, applies the edits and meshes. It returns `{storage (transferred Uint16Array, or uniform value), mesh buffers (transferred), editSeq}`.
- `REMESH{coord, padded 34³ copy assembled by the main thread (transferred), editSeq}` → mesh buffers. If any of the 26 neighbours isn't loaded (for example a remote edit at the view edge), fall back to GEN_MESH.
- Results whose `version` is stale are dropped. If newer edits arrived while a job was in flight, the main thread patches the returned voxels from the EditLog and queues a REMESH.

**Priorities:**
- P0: local edit transactions.
- P1: remote edits.
- P2: chunks within the 3×3×3 physics region.
- P3: in-frustum chunks by distance.
- P4: remaining chunks by distance.

Unload beyond R + 32 (hysteresis). A dropped chunk keeps its EditLog entries.

**In-flight cap:**
- Loading screen: the whole pool.
- Play: ≤2 streaming jobs, with 1 worker always free for P0/P1.

The play cap is there because the iGPU shares the package power and thermal budget with the CPU cores, so saturating 6 cores lowers iGPU clocks. It also keeps edit wait ≤ 1 job.

**Rejected:**
- World worker as the authority: collision and picking would need the voxels on the main thread anyway (duplicated memory), every edit would gain a thread hop, and it would be one more topology to maintain.
- SharedArrayBuffer: needs cross-origin isolation, which IPFS gateway paths can't provide. It could be an optional later path on amorf.us via Cloudflare `_headers`.
- WASM or GPU-compute meshing: JS is already <1 ms core per chunk, and physics needs CPU geometry.
- OffscreenCanvas render worker: premature. Defer.

## 4. "Immediately": measurable definition and design
**Spec:**
- **E0, same frame as the input event:** voxel store, collision geometry, picking and the highlight reflect the edit.
- **E1:** the reshaped surface is on screen within **≤2 presented frames at p95 and ≤3 at p99** (≤33 / 50 ms at 60 Hz), measured from the input event's `performance.now()` to the rAF frame that swaps the meshes. This includes the worst case, a chunk-corner edit that remeshes 8 chunks.
- Remote edits: the same bound, counted from message receipt.
- Sustained editing at 10 edits/s must not build a backlog.

**Design:**
- Apply the edit to the EditLog and the dense voxels synchronously. Compute the dirty set: every chunk whose padded region contains the voxel (1, 2, 4 or 8 chunks). With a 1-voxel apron, 17.6% of voxels in a 32³ chunk are on a border; with 2 voxels, 33%.
- Assemble the padded copies, 8 × 0.15 ms = 1.2 ms on the main thread in the worst case. Dispatch them as one **edit transaction** at P0 across free workers. Est. corner case: ~2 chunks per worker × 1.3–2 ms, plus ≤1 in-flight streaming job of wait (≤4–8 ms), so ~4–12 ms wall.
- **Swap every chunk in the transaction in the same frame.** Swapping them in different frames would briefly crack the seams, which breaks the requirement's "no visible seams". Transactions bypass the upload cap.
- Coalesce: a chunk dirtied again while in flight gets `version++` and one follow-up job.
- A capsule that ends up inside new geometry is depenetrated (§5).

## 5. Player systems
**Input.** `requestPointerLock({unadjustedMovement:true})` from a "click to play" overlay.
- Since Chrome 131, the first lock shows a **permission prompt**.
- Re-locking immediately after Esc fails, and Esc always releases the lock, so Esc means pause.
- Handle promise rejection.

Mouse: left = remove, right = place, middle = pick material. Keys 1–9 select the hotbar material. `Q` toggles sharp placement, shown in the hotbar, with a sharp-looking ghost. Double-tap Space or `F` toggles fly; in fly mode Space rises and Shift descends. Ctrl is avoided because browser shortcuts can't be captured outside fullscreen Keyboard Lock.

**Constants** (tunable, but with golden tests):

| Constant | Value | Note |
|---|---|---|
| Capsule | r 0.3, height 1.8 | eye height 1.62 |
| Walk / sprint | 4.3 / 5.6 b/s | Minecraft 4.317 / 5.612 |
| Fly / sprint-fly | 11 / 22 b/s | Minecraft |
| Gravity | 32 b/s² | Minecraft 0.08 b/tick² |
| Jump v0 | 9.0 b/s | apex 1.27, so a 1-block sharp wall is jumpable |
| Terminal velocity | 50 b/s | |
| Walkable slope | ≤50° | normal.y ≥ 0.643 |
| Step-up | 0.6 | must stay <1.0 |
| Ground snap | 0.5 | |
| Reach | 5 blocks | Minecraft `block_interaction_range` is 4.5 |

Measured on unrelaxed Surface Nets:
- A 1-block rise has a steepest triangle of 45°, so it is walkable with no step logic.
- A 2-block rise is 72°, so it blocks.
- A sharp cube is a vertical 1.0 face, so it blocks.
- A **lone smooth block on flat ground is a 0.67-high bump with 54° sides**, so with step 0.6 you have to jump it. Decide this deliberately; the smoothing area may change the shape.

**Collision geometry.** No stored triangle copies. Surface-Nets-family geometry is cell-local: each quad belongs to exactly one sign-changing sample edge, and its vertices lie inside the adjacent cells. So the voxel grid *is* the broadphase. Every physics substep calls `extractLocal(world, aabb)`, the same pure kernel the workers use, on roughly 80 cells (est. ≤10 µs). This makes collision exact to what gets rendered and correct in the same frame as an edit.
- **Contract with the smoothing area:** a vertex position may depend on at most a ±2-voxel neighbourhood, deterministically.
- If the smoothing area can't meet that, fall back to CPU mesh copies bucketed into 4³-cell bricks, which is est. +15–30 MiB.

**Controller.** Substepped capsule collide-and-slide:
- Substep length ≤0.1 block (≤ r/3). dt is clamped to 50 ms, which gives ≤11 substeps at 22 b/s.
- Per substep: segment-to-triangle closest point, push out, remove the velocity component into each contact normal. Up to 4 iterations.
- Grounded if any contact has normal.y ≥ cos 50°.
- Step-up: if blocked horizontally, retry the move from +0.6 and drop down. The camera y is eased over ~100 ms.
- Snap down 0.5 when walking over crests.

Tunnelling is prevented because substeps are shorter than r and Surface Nets meshes are watertight. **Chunks that aren't ready count as solid.** Reference for a swept alternative: Fauerby 2003 swept ellipsoid, with Linahan 2012 robustness fixes. Fallback if the game feel fails playtest: Rapier KCC (`@dimforge/rapier3d-compat` 0.20.0, which has autostep, snap-to-ground and slope limits, at +2.86 MB JS with embedded WASM).

**Picking.** Amanatides–Woo DDA along the ray up to 5 blocks. For each visited cell, extract the local quads and run Möller–Trumbore. The first hit's quad maps to its **owner edge (solid sample s, air sample a)**:
- remove target = `s`
- place target = `a`

This is exact and deterministic, gives Minecraft-like face semantics on a smooth surface, and needs no rounding heuristics.
- Draw a wireframe cube on `s` and a translucent ghost on `a`. Both are necessary because smoothing hides block boundaries.
- Reject a placement if `a`'s cube intersects any player's AABB (0.6×1.8).
- Remote players are rendered and interpolated about 100 ms behind. There are no player-vs-player collisions in the MVP.

## 6. Performance targets and measurement
**Reference GPUs**, 3DMark Time Spy Graphics, from notebookcheck / videocardz:

| Role | GPU | Score |
|---|---|---|
| Floor | Intel Iris Xe 96EU (e.g. i7-1255U, *this machine*) | ~1,500 |
| **Target** | AMD Radeon 780M | ~2,650–2,850 |
| **Target** | Intel Arc 140V (Lunar Lake) | ~3,100–4,000 |

On Linux, Chrome enables WebGPU by default only on Intel Gen12+ (Chrome 144+) and NVIDIA on Wayland (147+). A 780M acceptance box therefore has to run Windows or ChromeOS, or pass a flag.

**Render resolution:** cap the backing store at ~2.3 Mpx (1920×1200) whatever the DPR is. A DPR-2 laptop panel is 5.2 Mpx, which would be 2.25× the fragment cost.

**Default view distance:**
- **R = 192 blocks** (6 chunks, fog over the last 32), matching Minecraft's default of 12×16.
- Floor preset: R = 128.
- MVP maximum: 256.

**60 fps without LOD is realistic up to R≈192–256 on target GPUs:** ~0.5–0.9 M visible triangles, ≤240 draws. LOD becomes necessary above ~256 blocks, or above ~128–160 on the floor device. The seamless requirement then forces Transvoxel-class transition cells (Lengyel 2010), which belong after the MVP.

**Frame budget, 16.7 ms, main-thread CPU p95:**

| Item | Budget |
|---|---|
| Input/physics/picking | 0.5 ms |
| Scheduler and results (≤8 results per frame) | 0.5 ms |
| Edit application and assembly (edit frames only) | ≤1.5 ms |
| Uploads (≤1 MiB and ≤8 meshes per frame; transactions exempt) | ≤1.0 ms |
| Encode (≤300 draws) | ≤3.0 ms |
| Network and UI | ≤1.0 ms |
| **Total** | **≤8 ms** |

GPU: ≤12 ms p95 at ≤2.3 Mpx. Memory: voxels ≤64 MiB, GPU mesh ≤64 MiB at R=256.

**Measurement.** An in-app `?bench=flythrough` harness drives a fixed seed along a scripted 90 s path:
- 0–10 s: load. Excluded from the percentiles and reported as a separate load time.
- 10–40 s: walk over slopes and 1-block rises.
- 40–70 s: fly straight at 22 b/s into new terrain.
- 70–90 s: 40 chunk-corner edits at 2 Hz while turning 360°.

It records:
- rAF frame-interval p50/p95/p99/max and the share of frames longer than 1.5× the refresh interval
- main-thread ms per frame
- GPU ms (the `timestamp-query` feature is optional and quantised to 100 µs in Chrome)
- edit-to-visible frames at p95/p99
- job latencies and worker utilisation

It writes a JSON report.

**Pass criteria:**
- frame interval p95 ≤18.3 ms and p99 ≤25 ms (≤1% dropped at 60 Hz)
- max ≤50 ms after load
- edit-to-visible p95 ≤2 frames

On 120 Hz panels, judge against 16.7 ms, not the refresh interval.

## 7. Terrain generator v1 (CPU-only, deterministic)
**Height:**
`H(x,z) = 32 + 48·C(x/1024, z/1024) + 24·fBm₄(x/256, z/256)`, plus a ridged-mountain term masked by `C`, which is a low-frequency "continentalness" noise. Surface heights fall roughly in [−16, 128).

**Density near the surface:**
`d = H − y + 8·fBm₂³ᴰ(x/48, y/32, z/48)`, evaluated only where |H−y| < 24. Outside that range the sign is already known.

**Caves:** remove voxels where |N(x/40, y/24, z/40)| < 0.06 and y < H−4.

**Sampling rules:**
- All 3D terms are sampled on a **world-aligned** 4-block lattice (anchored at world multiples of 4, never at the chunk origin) and trilinearly interpolated. A chunk-anchored lattice would make a chunk's apron disagree with its neighbour's core, which shows up as seams.
- 3D noise is limited to y ∈ [−64, 160). Below that band every chunk is uniform stone; above it, uniform air.

**Materials:**
- Top solid voxel with air above: grass if y > sea+2, otherwise sand.
- Next 3 voxels: dirt (sand under sand).
- Deeper: stone.
- Player-only: planks and brick.

That is 6 materials, meeting the ≥4 requirement. Water is out of scope, so "sea level" is only a sand band. Flag this to the owner.

**Determinism rules:**
- Allowed: `+ − * /`, `Math.floor/trunc/abs/min/max/sqrt/imul/fround`, integer and bit operations.
- Banned: `Math.sin/cos/exp/pow/hypot/random` and `**`. ECMA-262 §21.3.2 says the results of sin, cos, exp, pow, hypot and random "not precisely specified"; `Math.sqrt` is exact.
- Seed string → 32-bit hash via `Math.imul` → per-octave permutation tables via splitmix32/mulberry32.
- Vendor the noise code (MIT) into `src/gen/`, so that `generatorVersion` covers every line that affects output.
- The world file stores `{generatorId, generatorVersion}`.
- Golden hash test: 64 chunks × 3 seeds. It fails on any change that isn't accompanied by a version bump.

## Interface contracts other areas must honour
- **Smoothing:** a pure kernel `(padded voxels) → mesh`, plus `extractLocal`, with local support ≤2 voxels. Every quad carries its owner edge (s, a) as a Uint32. Seam test: meshing 2×2×2 chunks separately must equal meshing the 64³ region in one pass.
- **Sync:** hands the world final per-voxel values with stamps. The world never sees operations.
- **Persistence:** saves EditLog plus seed plus generator version. Voxel caches are never persisted.
- **Rendering:**
  - ≤300 draws per frame.
  - Chunk-local vertex positions, camera-relative origin.
  - Sub-allocated buffers, so no `createBuffer` per chunk.
  - One shared material.
  - Atomic multi-chunk swap.

## Hypothesis verdict

Largely sound on sizing and threading, but there are four substantive problems:

1. **Pipeline.** The "meshable = all 26 neighbours generated" pipeline is inferior to generating the padded apron inline in the worker. Generation is a pure function of world coordinates, so the worker can produce the apron itself. That avoids generating an extra chunk ring (+35% chunks at R=192) and removes the dependency tracking.
2. **Collision data.** Colliding against a stored per-chunk CPU copy of the mesh is unnecessary and lags edits. Surface-Nets-family geometry is cell-local, so collision and picking can re-extract local triangles from the voxels with the same kernel, which gives exact, same-frame correctness at zero memory cost. This depends on the smoothing area keeping its kernel local (support radius of 2 voxels or less).
3. **Auto-step.** A 1-block auto-step is wrong. It would let players walk over sharp 1-block walls, and walls are the requirement's stated use case for sharp blocks. Smoothed 1-block rises are already 45° ramps, which a 50° slope limit makes walkable. Use a 0.6 step height (Minecraft's value) and a jump apex of about 1.27.
4. **Player shape.** An AABB rides badly on smooth slopes: 0.30 blocks of float on a 45° slope versus 0.12 for a capsule. Use a capsule for movement and keep the AABB only for the placement-exclusion test.

Smaller refinements:
- **Worker pool.** The hc−1 sizing needs a dynamic in-flight cap. On a 2P+8E laptop, 10 workers measured slower than 6, and CPU load steals the iGPU's power budget.
- **Uniform chunks.** The hypothesis omits them. They must be first-class, and "uniform" has to mean the padded region is uniform: an air chunk under an overhang still owns the ceiling quads.
- **Edits.** Edits must be final per-voxel values, and noise lattices must be world-aligned, or aprons won't match neighbours.
- **Edit swaps.** Edit transactions need an atomic multi-chunk swap, or seams flash for a frame.

Confirmed as-is: 32³ cubic chunks, Uint16 blocks, chunk data as a derived cache, transfer rather than shared memory, the main thread as the owner of block data, edits at top priority, and per-frame upload caps.

## Key decisions
- **Chunk dimensions** → 32x32x32 cubic chunks, Uint16 blocks (bits 0-7 material, bit 8 sharp, 9-15 reserved), uniform-chunk elision from day one, no palette compression in MVP
  - why: Measured/projected: 32^3 needs ~135 visible draws at R=192 vs ~610 for 16^3. Memory for both stays under 45 MiB up to R=256. The worst-case corner edit (8 chunks) still remeshes in est. 4-12 ms wall across the worker pool, inside a 2-frame budget.
  - rejected 16^3 chunks: About 4.5x more draws, jobs and Map entries. That matters most if three.js WebGPURenderer is chosen (per-object overhead: issue #30560). Its 6x cheaper remesh isn't needed to meet the latency spec.
  - rejected 32^3 with 4-bit palette compression: Would save ~33 MiB at R=256, but raw storage already fits the budget. Worth revisiting only for R>256.
  - rejected 32^3 data with 16^3 mesh sections: Two granularities to keep consistent, and no requirement needs it.
- **Chunk pipeline** → The worker generates the padded 34^3 region inline (a pure function of seed and world coordinates), applies the padded-region edits and meshes in one GEN_MESH job. REMESH jobs use a padded copy assembled on the main thread.
  - why: Removes the 26-neighbour dependency graph and the extra generated ring (+35% chunks at R=192, +46% at R=128). Per-chunk gen cost is ~15-20% higher. Every job is independent, so the first mesh is ready sooner.
  - rejected requested->generated->meshable (all 26 neighbours generated): More chunks to generate overall, dependency tracking, and main-thread assembly for every fresh chunk.
- **Where authoritative block data lives** → Main thread (WorldStore + EditLog). Stateless worker pool. ArrayBuffers are transferred, never shared.
  - why: Collision, picking and edit application need the data synchronously, and WebRTC runs on the main thread by default. Measured costs are small: assembling a padded 34^3 array takes 0.15 ms, a message round trip ~0.25 ms.
  - rejected Dedicated world worker as the authority: Adds a thread hop to every edit, and physics still needs a main-thread copy, so the data would be duplicated.
  - rejected SharedArrayBuffer: Needs COOP+COEP cross-origin isolation, which IPFS gateway paths can't provide.
  - rejected WASM or GPU-compute mesher: The JS core mesher is already 0.66 ms per 32^3 chunk. A GPU mesher would need readback for collision.
- **Worker concurrency** → Pool of clamp(hc-2, 2, 6). In-flight cap equals the pool while loading and 2 streaming jobs + 1 reserved edit lane during play. At most 1 job per worker; the queue lives on the main thread.
  - why: Measured on the 2P+8E i7-1255U: 6 workers reach 2,937 chunks/s, 10 workers only 2,586/s with job p95 of 8.2 ms. The iGPU shares package power with the CPU cores. Steady-state streaming needs <10% of one core.
- **Collision geometry source** → Re-extract local Surface-Nets-family geometry from the voxels, using the same pure kernel as the workers, for every physics query. No stored triangle copies.
  - why: Collision matches what's rendered exactly, reflects an edit in the same frame, and costs no memory. The voxel grid serves as the broadphase.
  - rejected CPU copy of each chunk's render mesh (hypothesis): Costs est. 15-30 MiB, and collision lags edits by the remesh latency. Keep it as the fallback if the smoothing kernel turns out not to be local.
  - rejected Voxel-cube AABB collision with smoothing tolerance: Stair-stepped feel on smooth slopes, with feet visibly floating or sinking by up to 0.5 block.
  - rejected Rapier trimesh + KCC: +2.86 MB bundle, and trimesh colliders must be rebuilt per edit. Kept as the fallback if the custom controller fails playtest.
- **Player shape and step rules** → Capsule r=0.3, h=1.8. Slope limit 50 degrees, step-up 0.6, ground snap 0.5. Substeps of 0.1 block or less. Unready chunks count as solid. AABB 0.6x1.8 used only for placement exclusion.
  - why: Measured: a smoothed 1-block rise is 45 degrees (walkable) and a 2-block rise is 72 degrees (blocked). A 1.0 auto-step would make sharp 1-block walls non-barriers. On a 45-degree slope a capsule floats 0.12 blocks above the surface, an AABB 0.30.
  - rejected Auto-step for 1-block ledges: Defeats sharp walls, which the requirements name explicitly. Smoothed rises don't need it.
- **Picking-to-voxel mapping** → Each mesh quad maps to its owner edge (solid sample s, air sample a): remove s, place at a. Wireframe on s and a ghost cube on a.
  - why: Exact and deterministic on a smoothed surface. Without the highlight, block boundaries are invisible (a lone block renders as a 0.67-high bump).
- **Definition of 'immediately'** → Collision, picking and data update in the same frame. The visible surface updates within 2 frames at p95 and 3 at p99, with all affected chunks swapped atomically.
  - why: Measurable in the harness. Meeting it in a single frame for an 8-chunk corner edit would stall the main thread (8 x ~2 ms). The atomic swap prevents transient seams.
- **Performance targets** → Target Radeon 780M / Arc 140V class at R=192 with a 2.3 Mpx render cap. Floor: Iris Xe 96EU at R=128. Pass: frame-interval p95 of 18.3 ms or less and p99 of 25 ms or less over a scripted 90 s flythrough.
  - why: Named GPUs span ~1,500-4,000 Time Spy Graphics. High-DPR laptop panels would otherwise mean 5.2 Mpx. Minecraft's default render distance is 192 blocks.
- **Generator design** → 2D height fBm plus 3D density near the surface and 3D caves, on a world-aligned 4-block lattice with trilinear interpolation. Arithmetic-only JS on the CPU, vendored noise, a generatorVersion field and a golden-hash gate.
  - why: The lattice made generation 2.5x faster (2.1 ms vs 5.3 ms per chunk). ECMA-262 leaves sin/cos/exp/pow/hypot implementation-approximated. Peers can run different JS engines: Firefox ships WebGPU on Windows since 141.

## Facts
- [V] Local measurement on an i7-1255U, Node 22.22.1 (V8): optimised binary Surface Nets core takes 0.66 ms mean per 32^3 chunk (p95 1.08, max 1.49), 0.11 ms per 16^3 and 5.1 ms per 64^3, about 20-27 ns per voxel. The naive implementation takes 3.0 ms per 32^3. — research/2026-09-23/proto/bench/bench2.mjs, bench.mjs
- [V] Local measurement: generating a padded 34^3 chunk costs 2.1 ms per dense chunk with 3D noise on a 4-block lattice plus trilinear interpolation, vs 5.3 ms with per-voxel 3D noise. — research/2026-09-23/proto/bench/bench.mjs
- [V] Local measurement of gen+mesh throughput: 1 worker 909 chunks/s; 6 workers 2,937/s (job p95 4.0 ms); 10 workers 2,586/s (job p95 8.2 ms, max 18 ms) on a 12-thread 2P+8E CPU. — research/2026-09-23/proto/bench/par.mjs
- [V] Local measurement: a main-worker postMessage round trip is ~0.25 ms p50 in Node worker_threads; copying a 78.6 KB buffer costs 0.48 ms p50 vs 0.25 ms transferred; assembling a padded 34^3 array from 27 neighbours costs 0.15 ms. Node figures are a proxy, not a browser measurement. — research/2026-09-23/proto/bench/msg.mjs
- [V] Local measurement on unrelaxed binary Surface Nets: a 1-block rise has a 45-degree maximum triangle slope; a 2-block rise 72 degrees; a lone block on flat ground becomes a 0.67-high bump with 54-degree sides. — research/2026-09-23/proto/bench/shape.mjs
- [V] Local measurement on test terrain (160-block band with caves): 41% of 32^3 chunks and 59% of 16^3 chunks were uniform; ~2.94 dense and 2.45 meshed chunks per 32-column; ~4.4 quads per block^2 of map area (terrain-dependent). — research/2026-09-23/proto/bench/bench.mjs, table.py
- [V] simplex-noise.js README benchmarks: noise2D 72.9M ops/s, noise3D 47.9M ops/s, noise4D 35.6M ops/s, single thread on a Ryzen 5950X in Node. Latest version 4.0.3, npm metadata last modified 2024-07-26. — https://github.com/jwagner/simplex-noise.js ; npm view simplex-noise
- [V] Lysenko (0fps, 2012): on a 65^3 volume in JS, Surface Nets took 24-124 ms vs marching cubes 30-275 ms, and produced roughly 4-5x fewer vertices and faces than marching cubes. — https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/
- [V] ECMA-262: the results of acos, acosh, asin, asinh, atan, atanh, atan2, cbrt, cos, cosh, exp, expm1, hypot, log, log1p, log2, log10, pow, random, sin, sinh, tan and tanh are 'not precisely specified' (fdlibm is only recommended). Math.sqrt returns F(the square root of R(n)), i.e. exact. — https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-function-properties-of-the-math-object
- [V] SharedArrayBuffer requires a secure context and cross-origin isolation (the COOP and COEP headers). — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- [unverified] Public IPFS path gateways do not send COOP/COEP, so pages served under /ipfs/<CID>/ are not cross-origin isolated. — inference; no gateway header survey performed
- [V] Cloudflare Workers static assets support a _headers file that can set Cross-Origin-Embedder-Policy and similar headers. — https://developers.cloudflare.com/workers/static-assets/headers/
- [V] WebGPU in Chromium: Windows, macOS and ChromeOS since 113; Linux Intel Gen12+ since 144; NVIDIA on Wayland since 147; other Linux GPUs behind a flag. Firefox ships it on Windows since 141 and macOS since 145/147. Safari since 26. — https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- [V] Chrome quantises WebGPU timestamp queries to 100 microseconds; the 'WebGPU Developer Features' flag disables the quantisation. — https://developer.chrome.com/docs/web-platform/webgpu/developer-features
- [unverified] Multi-draw-indirect was only available as chromium-experimental-multi-draw-indirect behind the unsafe-webgpu flag as of Chrome 131. Whether it has shipped by 2026-09 is unconfirmed. — https://developer.chrome.com/blog/new-in-webgpu-131
- [V] PlayCanvas measured 20,000 draws with 100 materials at 23.6 ms CPU frame time in Chrome WebGPU on an M4 Max (~1.2 us per draw including the engine); setBindGroup costs ~75 ns. — https://github.com/playcanvas/engine/pull/9487
- [V] three.js issue #30560: 20,000 non-instanced meshes run at ~15 fps with WebGPURenderer vs ~60 fps with WebGLRenderer on an M1 Pro. The issue is open and labelled high priority. — https://github.com/mrdoob/three.js/issues/30560
- [V] The latest three.js on npm is 0.186.0 (modified 2026-09-08). @dimforge/rapier3d-compat is 0.20.0 (2026-09-19), and its rapier.mjs with embedded WASM is 2.86 MB. — npm view three; npm view @dimforge/rapier3d-compat; npm pack --dry-run
- [V] Rapier's kinematic character controller supports autostep (max height, min width), snap-to-ground, a max slope climb angle and a min slope slide angle. — https://rapier.rs/docs/user_guides/javascript/character_controller/
- [V] Minecraft Java: walk 4.317 m/s, sprint 5.612, creative fly 11.0, creative sprint-fly 22.0. — https://minecraft.wiki/w/Transportation
- [V] Minecraft player hitbox is 0.6 wide x 1.8 tall with eye height 1.62. Attribute defaults: step_height 0.6, gravity 0.08 blocks/tick^2, jump_strength 0.42 blocks/tick, block_interaction_range 4.5. — https://minecraft.wiki/w/Player ; https://minecraft.wiki/w/Attribute
- [V] Minecraft Java's default render distance is 12 chunks (192 blocks). — https://www.thespike.gg/minecraft/beginners-guide/how-to-change-render-distance-in-minecraft
- [V] Minecraft samples terrain noise on 4x8x4-block cells and fills in with trilinear interpolation. — https://www.alanzucconi.com/2022/06/05/minecraft-world-generation/
- [V] 3DMark Time Spy Graphics: Iris Xe 96EU averages ~1,496 (notebookcheck, via search snippet; the page returned 403 to fetch); Radeon 780M 2,650-2,850 (videocardz, 7940HS); Arc 140V ~3,077 to ~3,900-4,000 average; Radeon 890M ~3,647. — https://videocardz.com/newz/intel-core-7-155h-arc-igpu-tested-in-3dmark-timespy-faster-than-amd-radeon-780m ; https://www.cpu-monkey.com/en/igpu-intel_arc_140v ; https://www.notebookcheck.net/Manufacturer-claims-AMD-Radeon-890M-can-beat-Intel-Lunar-Lake-Arc-140V-iGPU-in-Time-Spy.874757.0.html
- [V] The i7-1255U has 2 P-cores (with HT) and 8 E-cores (12 threads) and an Iris Xe 96EU iGPU at up to 1.25 GHz. This dev machine reports that CPU with nproc = 12. — https://www.intel.com/content/www/us/en/products/sku/226259/intel-core-i71255u-processor-12m-cache-up-to-4-70-ghz/specifications.html ; local /proc/cpuinfo
- [V] Laptop integrated GPUs share the package power and thermal budget with the CPU cores, so heavy CPU load can lower iGPU clocks. — https://lkml.iu.edu/hypermail/linux/kernel/1005.1/03207.html (Intel intelligent power sharing driver)
- [V] From Chrome 131, Pointer Lock and Keyboard Lock require permission, with a prompt on the first request. requestPointerLock accepts {unadjustedMovement:true} and returns a Promise in Chrome; it needs transient activation, and re-locking immediately after the default unlock gesture fails. — https://developer.chrome.com/blog/keyboard-lock-pointer-lock-permission ; https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
- [V] RTCDataChannel is transferable to workers in Chrome/Edge 130+, Firefox 144+ and Safari 15+. — https://caniuse.com/mdn-api_rtcdatachannel_transferable
- [V] Vite recommends new Worker(new URL('./worker.js', import.meta.url), {type:'module'}). ?worker&inline inlines the worker as base64. base './' makes generated URLs relative and requires import.meta support. — https://vite.dev/guide/features.html#web-workers ; https://vite.dev/guide/build.html#relative-base
- [unverified] Module workers load correctly when the page is served through the Helia service-worker gateway (inbrowser.link, which runs in subdomain mode with origin isolation). — inference; https://ipshipyard.com/blog/2025-a-post-gateway-world/ confirms subdomain mode only
- [V] Fauerby's 2003 'Improved Collision detection and Response' covers swept ellipsoids vs triangle meshes; Linahan (2012) fixes its numerical robustness. — https://www.peroxide.dk/papers/collision/collision.pdf ; https://arxiv.org/abs/1211.0059
- [V] Transvoxel (Lengyel, 2009/2010) stitches voxel meshes of different resolutions together without seams, for LOD. — https://transvoxel.org/
- [unverified] The estimated per-draw cost on a mid-range laptop CPU is 2-5 us for engine+WebGPU (extrapolated from the PlayCanvas and three.js figures), and production mesher cost is 2-3x the measured core Surface Nets. — inference

## Risks
- (medium) The smoothing technique chosen by the smoothing area isn't local (e.g. multi-iteration relaxation, or dual contouring that needs wider support), which breaks local re-extraction for collision/picking and widens remesh invalidation | impact: Collision would fall back to CPU mesh copies (+15-30 MiB). Edit dirty sets would grow beyond 8 chunks, adding remesh latency. | mitigation: Make 'vertex depends on a neighbourhood of +/-2 voxels or less' an interface contract, and test it by comparing chunked vs whole-region meshes. Keep the brick-bucketed CPU-copy fallback designed.
- (high) E-core scheduling and laptop thermal limits double worker job times; CPU load drains the iGPU's power budget | impact: Streaming hitches, fps drops while flying, edit latency near 3 frames | mitigation: Dynamic in-flight cap (2 streaming + 1 edit lane during play), unload hysteresis, and measurement on the floor device (the owner's i7-1255U).
- (medium) three.js WebGPURenderer per-object CPU overhead (issue #30560, still open) if the rendering area picks three.js | impact: Several ms per frame of CPU at a few hundred chunks | mitigation: 32^3 chunks keep visible draws at ~135 (R=192) and 236 or fewer (R=256). Use one shared material and chunk-local geometry. Raw WebGPU with sub-allocated buffers is the escape hatch.
- (medium) A hand-written collide-and-slide controller has feel bugs: snagging on triangle edges, jitter in concave corners, sliding on 45-degree ramps | impact: Movement feels bad; possible stuck states | mitigation: Golden movement tests in node; a depenetration iteration cap with averaged normals; Rapier KCC named as the fallback.
- (medium) Generator output drifts (dependency update, refactor, a banned Math function slips in), silently corrupting saved worlds and splitting peers' terrain | impact: Edits land on different terrain than intended; peers desync | mitigation: Vendored noise, a generatorVersion field, a golden-hash test in npm run check, a lint rule banning Math.sin/cos/exp/pow/hypot/random and ** under src/gen, and an optional cross-engine test in Firefox.
- (low) Module worker scripts fail to load under gateway subpaths or Helia service-worker loaders | impact: Terrain never loads; blank world | mitigation: An e2e check served under /ipfs/<CID>/ from a local gateway; a worker-ready handshake with a visible error; Vite ?worker&inline as the fallback.
- (high) Chrome 131+ pointer-lock permission prompt and the re-lock cooldown after Esc confuse players | impact: First-run friction; clicks that seem ignored | mitigation: An explicit click-to-play overlay that explains the prompt, handling of promise rejection, and a pause menu on unlock.
- (high) High-DPR laptop panels make the backing store 2x+ larger than planned | impact: The iGPU misses 60 fps on fragment cost alone | mitigation: Cap the backing store at ~2.3 Mpx; optionally a dynamic render scale.
- (medium) Chunks near a fast-flying player aren't ready yet, so the player could fall through the world | impact: The player falls through or clips into terrain | mitigation: Unready chunks count as solid; the physics region runs at priority P2; spawn is held until the 3x3x3 region is ready.

## Requirement conflicts
- [major] '60 fps on mid-range hardware (integrated GPU on a recent laptop) at a reasonable default view distance' + 'no visible seams between chunks or regions': Larger view distances need LOD, and seamless LOD for smooth voxel meshes needs Transvoxel-class transition cells, a large piece of work. Without LOD, triangles and draws grow with R^2, so 60 fps on an iGPU caps view distance at ~192-256 blocks. → MVP has no LOD. Default R=192 on target iGPUs (780M/Arc 140V class), a 128 preset for the Iris Xe floor, a hard max of 256, and fog at the edge. Seamless LOD is a post-MVP milestone.
- [major] '60 fps on mid-range hardware' (no device, resolution or metric given) + 'Acceptance: ... 60 fps on the target hardware': Not testable as written. High-DPR laptop panels (up to 5.2 Mpx) change the GPU load by 2x or more, and 120 Hz displays change what 'fps' means. → Name the reference GPUs (floor Iris Xe 96EU; target Radeon 780M / Arc 140V), cap the render resolution at ~2.3 Mpx, and define pass as frame-interval p95 of 18.3 ms or less and p99 of 25 ms or less over a scripted 90 s flythrough with edits.
- [minor] Owner norm 'build-blocking npm run check' + acceptance '60 fps on target hardware': GPU frame rate can't be gated in CI: runners have no representative GPU, and headless Chrome WebGPU falls back to software or nothing. → npm run check gates deterministic proxies: golden generator hashes, seam equivalence, movement golden tests, and triangle/draw/chunk-count budgets at the benchmark viewpoint. The fps harness runs on the reference device before each release, with its JSON report committed.
- [minor] 'Edits reshape the smoothed surface immediately' + 'Terrain generation and smoothing must not stall the frame loop': A literal same-frame remesh of a chunk-corner edit (8 chunks x ~2 ms) on the main thread would blow the 16.7 ms budget; off-thread remeshing costs at least one frame. → Define 'immediately' as: data, collision and picking update the same frame; the visible surface within 2 frames at p95 and 3 at p99; all affected chunks swapped atomically.
- [minor] 'Must work when served from IPFS ... gateway subpaths and Helia-based loaders' + multithreaded generation/meshing: Gateways can't send COOP/COEP, so SharedArrayBuffer and shared-memory WASM threads are unavailable. Worker script loading under service-worker loaders is unproven. → Transfer-only design (already planned); an e2e worker-load test under /ipfs/<CID>/; an inline-worker fallback.
- [minor] 'Targets current desktop Chrome and Edge with WebGPU': On Linux, Chrome enables WebGPU by default only for Intel Gen12+ (Chrome 144+) and NVIDIA on Wayland (147+). A Linux laptop with a Radeon 780M, one of the named mid-range iGPUs, would get the no-WebGPU message. → Run acceptance on Windows, macOS or ChromeOS (or Intel on Linux), and state this in the README.
- [minor] 'easy to edit block by block' + 'Blocks adjust to their neighbors so the terrain forms smooth surfaces': Measured with unrelaxed Surface Nets, a lone placed block renders as a 0.67-high bump with 54-degree sides, and block boundaries aren't visible on smooth terrain, so players can't see which block they will edit. → Map every picked triangle to its owner edge (an exact block face), draw a cube outline on the target block and a ghost cube at the placement cell, and decide deliberately whether lone blocks can be stepped over (step-up height).

## Third-party deps
- simplex-noise (recommended to vendor into src/gen, MIT, v4.0.3) or a hand-written OpenSimplex2 (Jonas Wagner (open-source maintainer)) build-time (bundled into the worker); runs at runtime locally: Noise functions for terrain generation | sees: Nothing: pure local computation
- @dimforge/rapier3d-compat (fallback only, not planned for MVP) (Dimforge) build-time (bundled, +2.86 MB with embedded WASM): Kinematic character controller, if the custom controller fails playtest | sees: Nothing: local computation

## Test ideas
- Golden hashes: xxhash of the voxel arrays for 64 chunks x 3 seeds, checked into the repo; any change fails npm run check unless generatorVersion is bumped.
- Apron consistency property test: for random chunks, generate(c, pad=1)'s apron equals the core voxels of the 26 neighbours (catches chunk-anchored lattices).
- Seam equivalence: meshing a 2x2x2 block of 32^3 chunks separately yields exactly the same triangle set, in world space, as meshing the 64^3 region in one pass; repeat after random edits at borders and corners.
- Dirty-set test: an edit at an interior, face, edge or corner voxel dirties exactly 1, 2, 4 or 8 chunks, and remeshing only those equals a full remesh.
- extractLocal equivalence: the triangles extracted locally for any AABB equal the subset of the worker-produced chunk mesh inside that AABB.
- Picking properties on random terrain: the remove target is always solid, the place target is always air and 6-adjacent to it, and a ray straight down onto flat ground selects the top block and the cell above it.
- Movement golden tests in node with scripted inputs: walk up a smoothed 1-block rise without jumping; blocked by a 2-block rise; blocked by a 1-block sharp wall; jump clears a 1-block sharp wall; 5 s of sprint-fly at 22 b/s into a wall with 100 ms dt hitches never ends inside solid; a fall at terminal velocity onto a 1-block floor lands on it.
- Depenetration: a placement or remote edit that creates geometry intersecting the capsule resolves within 1 physics step with no upward launch over 0.5 blocks.
- Scheduler tests: P0 edits pre-empt streaming; all chunks of an edit transaction are swapped in the same frame; stale results (version mismatch) are discarded; edits arriving mid-flight are patched and re-queued; 10 edits/s for 10 s leaves no backlog.
- Determinism lint: static check that src/gen contains no Math.sin/cos/tan/exp/log/pow/hypot/random and no **; optional Playwright run of the golden-hash test in Firefox (SpiderMonkey).
- Budget proxies in npm run check: at the benchmark seed and viewpoint with R=192, total triangles are 1.5M or fewer, meshed chunks 400 or fewer, dense voxel memory 32 MiB or less.
- e2e: serve the build under /ipfs/<CID>/ from a local gateway, and confirm workers start (ready handshake) and chunks mesh.
- In-browser ?bench=flythrough on the reference devices: frame-interval p95 of 18.3 ms or less and p99 of 25 ms or less, max 50 ms or less after load, edit-to-visible p95 of 2 frames or less; the JSON report is committed per release.

## Milestone notes
This area should be built in this order.

**M1: World core.** Pure TS, testable in node:
- block bit layout, chunk keys, uniform/dense storage
- EditLog holding final values, apply-after-generate
- generator v1 on a world-aligned lattice
- golden-hash test and banned-Math lint
- dirty-set computation

**M2: Mesher and streaming.** Built together with the smoothing area:
- the pure mesher kernel plus extractLocal, with owner edges
- seam-equivalence test
- worker pool, GEN_MESH/REMESH jobs, main-thread priority queue, version/stale handling
- per-frame upload caps
- a free-fly camera with no collision, to measure throughput on the i7-1255U

**M3: Player.**
- pointer lock, capsule collide-and-slide on extractLocal, walk/jump/fly, step 0.6, slope 50 degrees
- unready chunks count as solid
- picking via owner edges, highlight and ghost
- edit transactions with atomic swap
- movement golden tests

**M4: Performance.**
- ?bench=flythrough harness and JSON report
- tune render-scale cap, view-distance presets and in-flight caps on the floor and target devices
- deterministic budget proxies wired into npm run check

**Multiplayer hooks:** remote edits enter the same P1 path, so there is no extra work in this area.

**Deferred past MVP:**
- palette compression
- SharedArrayBuffer path on amorf.us via _headers
- seamless LOD (Transvoxel-class)
- occlusion culling
- evicting voxels of unedited distant chunks
- OffscreenCanvas render worker
- networking in a worker
- Rapier
- dynamic resolution/view-distance governor
- water/fluids

## Open questions
- Which physical machine and OS are the acceptance device, and what are its panel resolution, DPR and refresh rate? The dev box is an i7-1255U / Iris Xe laptop running WSL2, which is the floor tier, not mid-range; WebGPU acceptance would run in Windows Chrome.
- Should a lone smooth block (a 0.67-high bump in unrelaxed Surface Nets) be walkable without jumping? This sets step-up at 0.6 vs ~0.75 and depends on the final smoothing shape.
- Default view distance: a single R=192, or presets (128 floor / 192 target) chosen manually or from GPUAdapterInfo?
- Vertical world limits: effectively unbounded cubic chunks (±32k blocks), or a declared build range (e.g. y in [-256, 512]) that persistence and sync can rely on?
- Are water and fluids definitively out of MVP? Without them, 'sea level' is only a sand band.
- Generator compatibility policy: keep every old generator version in the codebase forever, or declare pre-1.0 worlds non-portable across generator changes?
- Will the smoothing area commit to a local kernel (vertex support of ±2 voxels or less)? Collision and picking re-extraction depend on it.
- Will rendering use three.js WebGPURenderer or raw WebGPU? The per-draw overhead differs by several times and affects the draw budget.