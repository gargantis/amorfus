# smoothing: Smoothing technique (block grid -> smooth surface, sharp blocks, seams, picking)

## Recommendation

# Smoothing: guarded surface nets on binary topology, initialised from generator density hints

## 0. What this is based on
**Read in full or at source level:** Gibson, MERL TR99-24 (the full CESN paper text); the NoCubes source (`SurfaceNets.java`, `SDFMesher.java`, `ModUtil.java`, `NoCubesConfig.java`, `CollisionHandler.java`); the 0fps surface-nets post; godot_voxel `smooth_terrain.md`; transvoxel.org; the READMEs of fast-surface-nets-rs and fastNaiveSurfaceNets; the ECMAScript spec (Math); MDN on SharedArrayBuffer.

**Built and measured:** a JS prototype of the hypothesis and of every variant discussed below. It lives at `research/2026-09-23/proto/`, in `sn.mjs` (reference mesher), `fast.mjs` (optimised mesher), `eval*.mjs`, `final.mjs`, `tunnel.mjs`, `seam.mjs`, `invariants.mjs`, `inv2.mjs`, `bench2.mjs` and `ambig.mjs`. Every number in this section comes from those runs on an i7-1255U laptop under Node 22.22.1 (V8), unless it is marked otherwise.

**Unverified:** claims about 7 Days to Die, Space Engineers and Enshrouded come from search snippets only.

## 1. The design in one paragraph
- **Topology:** exactly Minecraft's culled faces. There is one quad per solid/air block-face pair and one vertex per grid corner whose 8 surrounding blocks are mixed. Part of the hypothesis is kept as is here.
- **Starting positions:** naive surface nets on a per-block density ρ. For blocks whose shape was never edited, ρ is the generator's own density (a "hint"). For shape-edited blocks, ρ = ±1.
- **Relaxation:** damped Jacobi runs only where hints are missing or blocks were edited. It runs inside a per-vertex, per-axis box. The box:
  - pins the axes that are normal to sharp faces;
  - stops 1-block features from collapsing (the thin-feature guard);
  - limits how far the surface may intrude into air next to edits, so dug or built passages stay passable.
- **Arithmetic:** all of it runs on offsets relative to each vertex's grid corner, quantised to 1/256 of a block. That is what makes the positions and normals on both sides of a chunk border bit-identical.
- **Fallback:** if hints are absent (before milestone M3, or if the generator lacks a density), every block counts as hint-less. The same code then reduces to "hypothesis + guard".

## 2. Precise algorithm spec

### 2.1 Per-block inputs (contract with the world model)
- `solid`: material id ≠ 0.
- `sharp`: 1 bit. Part of the synced edit.
- `shapeEdited`: occupancy or `sharp` differs from the generated state. A material-only change does **not** set it, so repainting a block never changes its shape. This bit is derived, never synced.
- `hint`: int8, `round(127·clamp(g(b), −1, 1))`, where g is the generator's density at the block centre, positive meaning solid (roughly a signed distance; for heightmaps use `(h(x,y) − z_c)/sqrt(1+|∇h|²)`).
  - The hint is derived from the seed. It is never persisted and never synced.
  - ρ(b) = hint/127, unless the block is shapeEdited, has no hint, or its hint's sign disagrees with its occupancy. In those cases ρ = +1 if solid, −1 if air.

### 2.2 Topology (fixed; identical to Minecraft's culled mesh)
- **Cell:** corner c (integer). Its dual cell is blocks c−1..c on each axis. Mask bit i = solid(c − 1 + (i&1, (i>>1)&1, (i>>2)&1)).
- **Vertex:** exists iff the mask is not 0 or 255.
- **Quad:** exists for each pair of face-adjacent blocks b and b+e_a that differ in solidity.
  - Its corners lie on the plane b_a+1 and span [b_u, b_u+1]×[b_w, b_w+1], with (u,w) = ((a+1)%3, (a+2)%3).
  - Winding (0,0),(1,0),(1,1),(0,1) gives a +a normal. Reverse it when b is air, so every normal points from solid to air.
  - The quad records (solidBlock, axis, sign) for picking.
  - It is **owned** by the chunk that contains b.
- **Relaxation graph (mesh edges only):** the edge c→c±e_a exists iff `(mask & H) ∉ {0, H}`, where H for −x,+x,−y,+y,−z,+z is 0x55, 0xAA, 0x33, 0xCC, 0x0F, 0xF0.
  - Do **not** link every adjacent surface cell, as Gibson does. Measured: a free 1-thick slab collapses to 0.41 thick at k=4 under Gibson's linking.
- **Non-manifold edges** (diagonal-only contacts) are allowed. The mesh stays a closed 2-chain. Gibson's paper calls this case "pinched".

### 2.3 Constraint box per vertex (offset d from corner; lo_a ≤ d_a ≤ hi_a)
Rules 1 and 2 apply only to vertices in the relax set R (§2.5). Every other vertex has the box ±0.5 plus rule 3.
1. **Thin-feature guard.**
   - h = min over the non-sharp blocks in the cell of G[n6], where n6 is the number of a block's 6 face-neighbours with the same solid/air state, and G = [0.20, 0.25, 0.30, 0.5, 0.5, 0.5, 0.5].
   - lo = −h, hi = +h.
   - This applies to air blocks too, so dents and 1-block shafts are guarded as well.
2. **Edit clearance, hE = 0.20.** Applies if any block in the cell is shapeEdited. For each axis, let s− and s+ be the solid counts in the two halves of the cell.
   - If s+ < s−: hi_a = min(hi_a, hE).
   - If s+ > s−: lo_a = max(lo_a, −hE).
3. **Sharp, axis-pinned.** For each of the 12 face-adjacent pairs inside the cell (bits i and i^1, i^2, i^4) that is (sharp solid, air), set lo_a = hi_a = 0 on that pair's axis.
   - The simpler whole-vertex pinning is an acceptable M2 fallback. With hints it leaves a groove of up to 0.5 along the base of sharp walls. Measured: a sharp block on hinted ground at 0.3 has its base corner at 0.00 (vertex pinning) versus 0.50 (axis pinning).

### 2.4 Starting position
- d0 = the mean of the zero crossings of ρ, linearly interpolated, on those of the cell's 12 lattice edges whose endpoints differ in sign (block centres are at c ± ½). Then clamp d0 into the box.
- When every ρ is ±1, the crossings are edge midpoints, which is the NoCubes/naive-SN chamfer.
- Vertices whose three axes are all pinned start at d = 0.

### 2.5 Relaxation
- **Relax set R:** vertices whose cell contains a shapeEdited or hint-less block. All other vertices keep d0.
- **Update:** k = 6 iterations, with ping-pong buffers:
  - m = (Σ over w ∈ N(v), in the fixed order −x,+x,−y,+y,−z,+z, of (e_vw + d_w)) / |N(v)|
  - d ← clampBox(d + 0.5·(m − d))
- **Offset space only:** e_vw is a unit step. Never average absolute or chunk-local coordinates.
- **Damping:** λ = 0.5 is required. Undamped λ = 1 measured faster collapse (pillar 0.07 wide at k=4).
- **Optional speed-up:** at iteration i, update only vertices within ring distance k−1−i of the output corner box. Measured on cave chunks at k=8: relaxation 11.7 → 5.9 ms.

### 2.6 Output
- **Positions:** offset q = round(256·d), q ∈ [−128, 128]. Position = local corner + q/256, stored as Int16 local fixed point (range −128..8448 for N=32). Exact in f32 as well.
- **Normals:**
  - Area-weighted. Each smooth quad adds cross(p2−p0, p3−p1) to its 4 corners. This includes quads owned by neighbouring chunks, which are computed but not emitted over a 1-block border.
  - Sharp faces are excluded from smooth normals.
  - A zero normal (at a pinch) falls back to the cell's occupancy gradient.
  - Encode as octahedral snorm16x2.
- **Sharp quads:** their own 4 vertices, with a flat face normal.
- **Smooth vertices:** keyed by (corner, material). Vertices split only at material borders; normals and AO are shared across the split.
- **Triangulation:** split each (non-planar) quad on its shorter 3D diagonal; on a tie, use 0–2.
- **Pick record:** one u32 per quad (solid block local index, axis, sign). Quads are sorted by owning block, with CSR offsets.

## 3. Why this design: measured comparison (binary input, no hints)
Columns:
- **Features:** bump = apex of one block placed on flat ground; dent = depth of one removed block; iso = volume of a floating single block; pillar = width of a 1×1 column; wall = thickness of a 1-thick wall. All in blocks; the cube value is 1.00.
- **Slopes:** normal error on staircases of slope 1:n, as rms/max in degrees.
- **Sphere:** rms normal error on a voxelised sphere of radius 7.

| variant | bump | dent | iso | pillar | wall | 1:2 | 1:4 | 1:8 | sphere R7 |
|---|---|---|---|---|---|---|---|---|---|
| cubes | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 43/63 | 38/76 | 28/83 | 49 |
| naive SN (NoCubes default) | 0.67 | 0.67 | 0.04 | 0.50 | 1.00 | 12.5/18 | 16.6/31 | 13.5/38 | 12.7 |
| **hypothesis** (corner, k4, h .5) | 0.55 | 0.55 | **0.007** | **0.32** | 0.99 | 7.8/11 | 12.0/22 | 10.9/29 | 10.0 |
| corner k8 | 0.50 | 0.50 | 0.00 | 0.10 | 0.95 | 1.4/2 | 5.4/8 | 7.3/15 | 5.5 |
| k6 + guard | 0.75 | 0.75 | 0.22 | 0.40 | 0.97 | 3.1/4 | 7.8/13 | 8.7/20 | 6.3 |
| blur [1,4,6,4,1] start + k4 + guard | 0.75 | 0.75 | 0.22 | 0.40 | 0.98 | 0/0 | 2.2/3 | 5.5/10 | 8.4 |
| Taubin (λ .5, μ −.53) k4 | 0.93 | 0.93 | 0.54 | 0.90 | 1.00 | 35/53 | 32/66 | 24/72 | 37 |
| **with generator hints** (k6 + guard, no relaxation off-edit) | edit +0.75 | – | – | – | – | 0.0/0 | 0.0/0 | 0.1/0 | 4.9 |

**Tunnels (clearance of a dug 1×2 tunnel):**
- Symmetric relaxation, k6 + guard: 0.59 wide × 1.00 tall. A 2×2 tunnel becomes 1.52 × 1.52.
- With the edit-clearance limit, clearance is exactly (W − 2hE) × (H − 2hE):
  - hE = 0: 1.00 × 2.00
  - hE = 0.1: 0.80 × 1.80
  - hE = 0.2: 0.60 × 1.60
  - hE = 0.5: 0.23 × 1.00

**Final spec (`final.mjs`, k6), hinted ground surface at 0.3:**
- bump +0.45, dent −1.10;
- floating block volume 0.22;
- pillar 0.40;
- dug 1×2 clearance 0.60 × 1.60, dug 2×3 clearance 1.60 × 2.60;
- built smooth doorway ≥1.12 wide.

**Binary fallback:** bump +0.75, dent −0.80, with the same clearances.

**Takeaways:**
1. Plain Laplacian relaxation erases single blocks and thin features. The guard fixes this without touching slopes or spheres; those numbers are identical with and without it.
2. No local smoother on binary data removes terraces on gentle slopes. Removing a terrace n blocks wide needs about n² Jacobi steps and an apron of about n blocks, which matches Gibson's finding for filters. Generator hints make generated slopes exact at any gradient.
3. Blur-density starting positions help slopes but are discontinuous: cells with no crossing fall back to the corner, which worsens the sphere result.
4. Taubin smoothing keeps volume but barely smooths.

## 4. Materials, AO, shading
- **Materials:** a palette of up to 8 for MVP (u8 id; the requirement is ≥4).
  - A smooth quad takes the material of its owning solid block, so a single placed block reads at 100% of its own material. Per-vertex averaging would dilute it to about 25% on flat ground.
  - Material borders follow the relaxed quad edges: crisp but organic.
  - Soft blending is deferred. WGSL has no barycentric builtin (gpuweb#5566 is open, milestone 4+). If blending is wanted later, give each quad its 4 corner materials plus bilinear weights derived from the corner index.
- **Texturing:**
  - Mapping: world-space triplanar or biplanar (iq), from a mipmapped 2D texture array (8 layers).
  - Scale: one tile per block, so sharp axis-aligned faces show exact block textures.
  - Blend: sharpness exponent about 4–8.
  - Normal maps (optional): Golus's whiteout/UDN method.
  - Assets: self-made or procedural textures, referenced by relative paths.
- **AO:** per corner, f = the solid fraction of the 4×4×4 blocks c−2..c+1, and ao = clamp(1 − 1.2·max(0, f − 0.5), 0.55, 1).
  - This needs an apron of 2 blocks, which the mesh apron already covers, so AO is seam-identical.
  - The same value is used for sharp and smooth vertices at a corner.

## 5. Chunks, apron, seams, edit remeshing
- **Chunk and apron:** N = 32, mesh chunk = data chunk. Apron A = k + 3 = 9 blocks, so the worker's grid is S = 50.
  - Derivation: output corners are [0, N]. Normals need final positions on [−1, N+1]. k iterations need starting data on [−1−k, N+1+k]. The guard reads 1 more block. Always derive A from k in code.
- **Worker input:**
  - The worker receives a copy of the 50³ neighbourhood (occupancy, flags, hints; about 125 kB per byte-plane), cut from the 27 surrounding chunks, as a **transferable** buffer.
  - SharedArrayBuffer needs COOP/COEP cross-origin isolation, which an IPFS gateway page cannot be given.
  - The neighbours' data (not their meshes) must exist first, so the generation radius is the mesh radius + 1.
- **Seam proof and test:** a shared vertex is computed in both chunks from the same inputs, by the same operations, in offset space, then quantised. Measured over 6 chunk pairs and 821 shared vertices:
  - offset space + quantisation: 0 position and 0 normal mismatches;
  - chunk-local f32 coordinates without quantisation: 72 position mismatches (max 3.05e-5) and 767 normal mismatches;
  - chunk-local coordinates with quantisation: 0 position and 3 normal mismatches;
  - apron k+1 instead of k+3: 27 normal mismatches.
- **Which chunks an edit dirties:** an edit at block b changes corners in [b−k−2, b+k+3] on each axis.
  - A chunk with origin o is dirty iff its corner range [o, o+N] intersects that range on every axis.
  - For k = 6, N = 32: on average about 3.6 chunks per edit, at most 8.
- **Remesh and swap:** remesh the dirty set at top priority, and swap all of its GPU buffers in the same frame (a swap group). Otherwise a half-updated border shows a transient crack.
- **Budget:** about 3.6 × 4–11 ms, spread over ≥2 workers, gives 10–25 ms, i.e. 1–2 frames.

## 6. Cost and memory (i7-1255U, Node 22, one thread, median per 32³ chunk)
**Time:**

| k (apron, grid size S) | hills chunk (≈2.9k triangles, 1.5k vertices) | cave chunk (≈13k triangles, 6.9k vertices) |
|---|---|---|
| k=4 (A 7, S 46) | 2.9 ms | 8.7 ms |
| k=6 (A 9, S 50) | 3.9 ms | 10.2 ms (10.6 with windowing) |
| k=8 (A 11, S 54) | 3.9–5.4 ms | 13.4 ms windowed, 20.1 ms full |

- With hints and no edits, relaxation is skipped, so these are upper bounds.
- Literature for comparison: native SIMD code does 0.1–0.4 ms per 32³, so JS is roughly 10–30× slower, but inside the frame budget once meshing runs off the main thread.

**Memory:**
- Output with f32 position+normal and u32 indices: hills about 70 KB per chunk, caves about 315 KB.
- Packed format (16 B vertex, u16 index) estimate: about 41 KB and 190 KB.
- CPU block data: about 3 B per block (material, flags, hint), i.e. about 96 KB per chunk.

## 7. LOD
- **Not in MVP.** View radius 6 chunks (192 blocks, the same as Minecraft Java's default 12×16) or 8 chunks.
- That is roughly 3–4k triangles per chunk column × 113–200 columns ≈ 0.4–0.8M triangles loaded, about a third of them inside the view frustum. This is an estimate; the GPU budget itself is not measured.
- **Later:** mesh coarse levels from a mean-density mip of the hints, with no relaxation. Close the seams with skirts first, then seam strips generated the dual-contouring way. Transvoxel is marching-cubes-specific and does not transfer.

## 8. Picking and collision contract
- **Picking:**
  - Walk the ray over blocks with a DDA (Amanatides–Woo), up to the reach limit.
  - At each visited block, test the quads owned by solid blocks within Chebyshev distance 1. This is sufficient because every vertex stays inside its own cell.
  - Use Möller–Trumbore on both triangles of each quad; the nearest hit wins.
  - The hit gives (solid, air): "remove" targets the solid block, "place" targets the air block.
- **Collision** is the physics area's decision. I recommend colliding against these same triangles, which is what NoCubes does.
  - The hE rule guarantees dug openings of W×H blocks keep at least (W−0.4) × (H−0.4) clearance.
  - So a player capsule of ≤0.6 wide × ≤1.6 tall fits through a dug 1×2 tunnel.
  - Openings built from sharp blocks are exact.

## 9. Gate (part of `npm run check`, vitest, pure TS, runs in Node)
The invariants are listed in `test_ideas`. The mesher is a pure function, `meshChunk(input) → output`, with no DOM or GPU, so it runs in both workers and Node.

## 10. Visual sign-off
A static "smoothing gallery" page renders these scenes with sliders for k, G, hE and whether hints are on:
- bump, dent, isolated block, pillar, wall;
- 1×2 and 2×3 tunnels;
- stairs, slopes 1:2 to 1:16;
- a sphere;
- a sharp wall on a slope.

The owner approves the defaults there. The invariants lock the mechanics; they cannot judge taste.

## Hypothesis verdict

The skeleton is right; the smoothing rule as written fails, in measurable ways.

**Right, and kept:**
- binary topology with vertices at cell centres reproduces the cube mesh exactly (verified);
- one quad per solid/air pair, which gives unambiguous picking;
- Jacobi rather than Gibson's sequential updates (required for determinism);
- clamping to the dual cell as a box;
- sharp faces flat-shaded;
- an apron-based seam strategy.

**Wrong or weak:**
1. **Relaxation clamped to ±0.5 erases 1-block features.** At k=4: a floating single block shrinks to volume 0.007, a 1×1 pillar to 0.32 wide, and a single-block bump or dent to 0.55; at k=8 the floating block is gone entirely. The ±0.5 box contains the block centre, so nothing stops the collapse. Fix: the thin-feature guard (floating block 0.22, pillar 0.40, bump 0.75, with slope and sphere quality unchanged).
2. **Symmetric smoothing closes passages.** A dug 1×2 tunnel becomes 0.59 × 1.00, and a 2×2 tunnel 1.52 × 1.52, so smooth collision would trap the player. Fix: cap intrusion into air at hE = 0.2 in edited cells, which guarantees (W−0.4) × (H−0.4) clearance.
3. **Binary input cannot remove terracing on gentle slopes.** At k=4, 1:8 slopes still show 10.9° rms / 29° max normal error, and a local method would need about n² iterations for a terrace n wide. Fix: generator density hints (0.0–0.1° on any slope).
4. **"Surface neighbours" must mean mesh edges.** Gibson's "adjacent surface cubes" linking collapses a 1-thick slab to 0.41.
5. **λ must be damped (0.5).** Undamped collapses faster.
6. **The apron is under-sized.** It must be k+2 for positions plus normals, and k+3 with the guard. Too small an apron measurably breaks normals at the seams (27/821).
7. **"Identical arithmetic" is not enough for bit-identical seams.** It must happen in corner-offset space with 1/256 quantisation; chunk-local float coordinates mismatch 72/821 positions and 767/821 normals.
8. **Whole-vertex pinning next to sharp blocks** leaves grooves on hinted ground. Pin per axis instead.
9. **Smaller gaps:** smooth normals must exclude sharp faces; non-planar quads need a deterministic triangulation rule; zero normals at non-manifold pinches need a fallback.

## Key decisions
- **Mesh topology** → Binary surface-nets topology: one vertex per mixed corner cell, one quad per solid/air block-face pair (the hypothesis's topology, kept)
  - why: Reproduces the Minecraft culled mesh exactly when no vertex moves (0 mismatches over 20 random worlds). Every quad maps to exactly one (solid, air) pair, so picking and edits are unambiguous. Measured 0 watertight violations over 51,778 quads.
  - rejected Marching cubes / Transvoxel on blurred or binary density: Topology follows the blurred field, so 1-block features vanish (NoCubes' source says so explicitly). About 4x the vertices of surface nets (0fps: 1140 vs 272 on a sphere). Quads no longer map 1:1 to block pairs.
  - rejected Dual contouring with synthetic Hermite data: Binary data carries no real normals; the QEF preserves sharp features, which is the opposite of what smooth blocks want; sharp blocks are grid-aligned, so pinning gives exact sharp features without any QEF. Higher cost.
  - rejected Topology from a blurred field (NoCubes' 2x smoothness mode): The blur removes single blocks and 1-thick walls from the topology, which breaks block-by-block editing.
- **Where sub-block shape comes from** → Generator density hint per block (int8, derived from the seed, never persisted or synced); edited blocks saturate to ±1
  - why: On binary input, gentle slopes stay terraced under any local smoother: measured rms/max normal error of 7–11°/13–29° on 1:4–1:16 slopes even at k=6–8. With hints, generated slopes come out at 0.0–0.1° at any gradient, and a block placed on a hinted slope still makes a clear +0.75 bump.
  - rejected Binary only, more iterations (k=12): The 1:8 slope is still 5.6°/10°; 2×2 pads flatten to 0.50; the apron grows to 15 blocks.
  - rejected Blur occupancy for the starting positions (5-tap binomial): Helps slopes (1:4 2.2°) but is discontinuous where a cell has no crossing: the sphere worsens to 8.4° vs 6.3°.
  - rejected Store a full density byte per block and let edits add or subtract density (Astroneer / 7DTD style): Edits would stop being block-sized. It also changes the sync and persistence model.
- **Relaxation scheme** → Damped Jacobi (λ=0.5), k=6, over the mesh-edge graph, in corner-offset space, double-buffered, with a fixed neighbour order; only on vertices whose cell touches a shape-edited or hint-less block
  - why: Jacobi is order-independent, so it is deterministic and seam-safe; Gibson's sequential updates are not. Linking only along mesh edges prevents slab collapse (Gibson's linking measured 0.41 thickness). Offset space plus quantisation is required for bit-identical seams (0/821 mismatches vs 72/821). Restricting to edited cells leaves hinted terrain exact and makes relaxation cheap.
  - rejected Taubin λ/μ smoothing: Keeps volume (floating block 0.54) but barely smooths: 1:1 staircase still 30° off, sphere 37°.
  - rejected Undamped λ=1: Measured faster collapse (pillar 0.07 at k=4). On a bipartite graph it does not damp the checkerboard mode (this last point is inference).
- **Vertex constraint** → Per-axis box around the corner. Half-width from the thin-feature guard G=[0.20,0.25,0.30,0.5...] by n6. Intrusion toward the air-majority side capped at hE=0.20 in edited cells. Axes normal to incident sharp faces pinned.
  - why: A ±0.5 box contains the block centre, so relaxation shrinks single blocks to nothing: volume 0.007 at k=4. The guard gives volume 0.22, pillar 0.40, bump 0.75, with slopes and sphere unchanged. hE guarantees dug and built passages keep (W−0.4)×(H−0.4) clearance. A box keeps each vertex inside its cell, which bounds picking and collision queries.
  - rejected Sphere-shaped clamp: No benefit, and it makes the per-axis asymmetric and pinned limits awkward.
  - rejected Forbid any intrusion into edited air (hE=0): Dug tunnels then keep perfectly square inner corners, i.e. blocky caves.
  - rejected Pin every vertex whose cell contains a diagonal-only (ambiguous) configuration: Rare in terrain (0.03–0.32% of vertices) but it would make diagonal builds blocky. Leave them pinched instead.
- **Sharp blocks** → Pin per axis: a vertex is fixed only along the normals of the incident (sharp solid, air) faces. Sharp quads get their own flat-shaded vertices; smooth normals exclude sharp faces.
  - why: Every sharp face stays exactly on its grid plane (62,600/62,600 vertices on-plane; 0 watertight violations), and the smooth ground can meet a sharp wall at the ground's own height instead of cutting a groove of up to 0.5.
  - rejected Pin the whole vertex whenever it touches a sharp block (hypothesis): Correct, and a fine M2 fallback, but with hints it leaves a groove or ridge of up to 0.5 around every sharp block on generated ground.
  - rejected Treat sharp blocks as air for the smooth mesher (NoCubes): The smooth surface bevels away from the block and leaves gaps (inferred from density −1 = air in NoCubes).
- **Where meshing runs** → Pure-TS mesher in module workers; inputs copied into transferable buffers; no SharedArrayBuffer; no GPU compute meshing in MVP
  - why: Measured 3–11 ms per chunk in V8 fits a worker budget. The same code runs in Node for the tests the owner's gate needs. SharedArrayBuffer needs COOP/COEP headers that IPFS gateway pages can't get.
  - rejected WebGPU compute-shader meshing: Not unit-testable in Node; needs readback for picking and collision; determinism across GPUs is not guaranteed.
  - rejected Rust/WASM (fast-surface-nets): Adds a toolchain; JS is already within budget. Keep as a later optimisation.
- **Materials** → Quad material = its owning solid block's material; vertices split per (corner, material); triplanar/biplanar texture array; AO from occupancy per corner
  - why: A single placed block shows 100% of its material, and ≥4 distinct materials is trivially met. Lighting stays continuous across material borders because normals and AO are shared.
  - rejected Per-vertex blend weights from the 8 cell blocks: Dilutes a single block of a different material to about 25% on flat ground: edits read poorly.
  - rejected Per-triangle 3-material barycentric blending: WGSL has no barycentric builtin (gpuweb#5566 open); workarounds duplicate vertices.
- **LOD** → None in MVP; view radius 6–8 chunks of 32
  - why: Estimated 0.4–0.8M triangles loaded, from measured per-chunk counts. Coarse LODs need a density mip and a seam method, which is better built after the core is signed off.
  - rejected Transvoxel transition cells: Marching-cubes-specific; surface nets is a dual method.

## Facts
- [V] Gibson's CESN places one node at the centre of each surface cube (8 voxels, not all equal), links up to 6 face-neighbour nodes, and relaxes 'by considering each node in sequence and moving that node towards a position equi-distant between its linked neighbors' (sequential, i.e. order-dependent). The constraint keeps each node inside its original surface cube; without it the net shrinks to a point. The examples use 10 and 100 relaxations; ambiguous diagonal cases are 'pinched'. — https://www.merl.com/publications/docs/TR99-24.pdf
- [V] Gibson: local low-pass filters do not remove terracing unless their extent is comparable to the terrace width; even a 19^3 Gaussian leaves unacceptable terraces. — https://www.merl.com/publications/docs/TR99-24.pdf
- [V] Naive surface nets (0fps) places each vertex at the centroid of the cell's edge crossings. On a sphere, MC gives 1140 verts/572 faces vs SN 272 verts/270 faces. — https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/
- [V] NoCubes' default SurfaceNets mesher is a port of Lysenko's naive SN. It feeds block densities (±1) as if they were corner values and offsets the mesh by 0.5; the source comments that averaging densities 'results in loss of terrain features (one-block large features effectively disappear)'. — https://github.com/Cadiboo/NoCubes/blob/master/common/src/main/java/io/github/cadiboo/nocubes/mesh/SDFMesher.java
- [V] NoCubes gives non-smoothable blocks density NOT_SMOOTHABLE = -1, the same as air, so its smooth mesher treats them as empty. — https://github.com/Cadiboo/NoCubes/blob/master/common/src/main/java/io/github/cadiboo/nocubes/util/ModUtil.java
- [V] NoCubes mesher options: SurfaceNets and OldNoCubes, plus Debug_SurfaceNets2xSmoothness, Debug_MarchingCubes(2x), Debug_CullingCubic, Debug_StupidCubic, Debug_CullingChamfer and Debug_WulferisMesher. — https://github.com/Cadiboo/NoCubes/blob/master/common/src/main/java/io/github/cadiboo/nocubes/config/NoCubesConfig.java
- [V] NoCubes collision runs the mesher on the block and its surroundings and turns the faces into collision shapes. Its CollisionHandler lists requirements including 'Player should be able to walk into and out of single block holes'. The repo was last pushed 2024-10-09. — https://github.com/Cadiboo/NoCubes/blob/master/common/src/main/java/io/github/cadiboo/nocubes/collision/CollisionHandler.java ; https://api.github.com/repos/Cadiboo/NoCubes
- [V] godot_voxel: a 0/1 grid 'is good for polygonizing blocky surfaces, but not curves'. Smooth terrain stores quantised SDF (8-bit or 16-bit) and uses Transvoxel transition meshes for LOD; the mixel4 format blends up to 4 textures per voxel. The blocky and smooth meshers are separate. — https://github.com/Zylann/godot_voxel/blob/master/doc/source/smooth_terrain.md
- [V] Transvoxel (Lengyel, 2009) stitches LOD levels with transition cells: 512 cases in 73 equivalence classes; free of patent claims. — https://transvoxel.org/
- [V] Astroneer stores a signed density per voxel, polygonises with marching cubes, and re-meshes only the affected chunks on deformation. — https://www.gamedeveloper.com/design/what-i-astroneer-i-s-devs-learned-while-leaving-early-access
- [unverified] 7 Days to Die terrain blocks carry an editable 'density' that swells or contracts the smooth surface; building blocks are a separate model-based system. — https://steamcommunity.com/app/251570/discussions/0/2957167122122632987/ (search snippet only)
- [unverified] Space Engineers keeps diggable voxel terrain and block grids as separate systems. — https://spaceengineers.wiki.gg/wiki/VRage (search snippet only)
- [unverified] Enshrouded uses a proprietary voxel engine with block-by-block building (including round staircases); no algorithm has been published. — https://tryhardguides.com/enshrouded-unveils-voxel-based-building-and-terraforming-in-latest-gameplay-video/ (search snippet only)
- [V] Dual contouring (Ju, Losasso, Schaefer, Warren, SIGGRAPH 2002) contours Hermite data (intersection points plus normals) with QEFs and supports octree simplification without crack patching. — https://dl.acm.org/doi/10.1145/566570.566586
- [V] Cubical Marching Squares (Ho et al., CGF 24(3):537-545, 2005) preserves sharp features, keeps topology consistent and extracts adaptively without crack patching. — https://diglib.eg.org/handle/10.2312/CGF.v24i3pp537-545
- [V] fast-surface-nets (Rust) generates about 20M triangles/s on one 2.5 GHz i7 core; its example uses a 16^3 chunk with 1-voxel padding (18^3) and emits no faces on the positive chunk boundaries. — https://github.com/bonsairobo/fast-surface-nets-rs
- [V] fastNaiveSurfaceNets (C++ SSE) takes about 0.1-0.4 ms per 32^3 on one Ryzen 1700 thread. — https://github.com/bigos91/fastNaiveSurfaceNets
- [V] WGSL has no barycentric-coordinates builtin; gpuweb issue #5566, requesting one, is open (opened 2026-02-14, milestone 4+). — https://github.com/gpuweb/gpuweb/issues/5566
- [V] ECMAScript: Math.sin returns an 'implementation-approximated' value, while Math.sqrt returns the correctly rounded result. Generator code that decides occupancy must avoid approximated Math functions if peers are to agree. — https://tc39.es/ecma262/ (sections 4.4 and 21.3.2.31/33)
- [V] SharedArrayBuffer needs a secure context plus cross-origin isolation (COOP/COEP headers). That an IPFS gateway page cannot get these headers is my inference. — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- [unverified] Minecraft Java's default render distance is 12 chunks (of 16 blocks, i.e. 192 blocks). — https://www.thespike.gg/minecraft/beginners-guide/how-to-change-render-distance-in-minecraft (search snippet)
- [V] Measured, hypothesis (corner start, k=4, λ=0.5, ±0.5 clamp): bump/dent 0.55, floating single block volume 0.007 (0.000 at k=8), 1x1 pillar width 0.32, 1:8 slope normal error 10.9° rms / 29° max, sphere R7 10.0°. — prototype research/2026-09-23/proto/eval.mjs + sn.mjs
- [V] Measured: linking relaxation neighbours by any adjacent surface cell (Gibson) collapses a free 1-thick slab and a 1-thick wall to 0.41 at k=4; mesh-edge linking keeps 1.00 and 0.99. — prototype proto/scenarios.mjs
- [V] Measured: the thin-feature guard G=[0.2,0.25,0.3,0.5,...] at k=6 gives bump 0.75, floating block volume 0.22 and pillar 0.40, with slope and sphere numbers identical to unguarded k=6 (1:4 7.8°/13°, sphere 6.3°). — prototype proto/eval.mjs
- [V] Measured: with generator density hints (and no relaxation on unedited cells), slopes from 1:2 to 1:16 come out at ≤0.1° rms normal error; a block placed on a hinted 1:4 slope still makes a +0.75 bump. — prototype proto/eval4.mjs
- [V] Measured: a dug 1x2 tunnel under symmetric k=6 smoothing narrows to 0.59 x 1.00; with the edit air-intrusion limit hE, clearance is (1-2hE) x (2-2hE) (hE=0.2 gives 0.60 x 1.60; hE=0.5 gives 0.23 x 1.00). — prototype proto/tunnel.mjs, eval7.mjs, final.mjs
- [V] Measured, seams (6 chunk pairs, 821 shared vertices, f32): offset space + 1/256 quantisation gives 0 position and 0 normal mismatches; chunk-local coordinates without quantisation give 72 position (max 3.05e-5) and 767 normal mismatches; apron k+1 instead of k+3 gives 27 normal mismatches. — prototype proto/seam.mjs + fast.mjs
- [V] Measured: 0 watertight (directed-edge) violations over 51,778 quads in 20 random closed worlds with 10-30% sharp blocks; 9,752 non-manifold edges from diagonal contacts. k=0 and all-sharp worlds reproduce the cube mesh exactly. With axis pinning, 62,600/62,600 sharp-face vertices lie exactly on their grid plane. — prototype proto/invariants.mjs, inv2.mjs
- [V] Measured: ambiguous (diagonal-only) cells are 0.03% of vertices in smooth hills and 0.32% in 3D-noise caves. — prototype proto/ambig.mjs
- [V] Measured on an i7-1255U, Node 22.22.1, single thread, 32^3 chunk, medians: hills (~2.9k triangles) 2.9 / 3.9 / 3.9-5.4 ms at k=4/6/8; caves (~13k triangles) 8.7 / 10.2 / 13.4 (windowed) - 20.1 (full) ms. Output about 70 KB (hills) and 315 KB (caves) with f32 position+normal and u32 indices. — prototype proto/bench2.mjs + fast.mjs
- [unverified] Undamped Jacobi (λ=1) on the bipartite cube-lattice graph does not damp the checkerboard mode; in the prototype it also collapsed features faster (pillar 0.07 at k=4). — inference (linear algebra) + prototype proto/scenarios.mjs

## Risks
- (high) The look is subjective: guard radii, k and hE defaults may not match the owner's taste (e.g. a +0.45 bump on hinted ground may read as too soft) | impact: Rework of tuning constants after integration; possible churn in golden hashes | mitigation: Build the smoothing-gallery page in M2 with sliders and get owner sign-off before M3. Keep constants in one config module, and regenerate golden hashes only on deliberate changes.
- (medium) Hint and occupancy disagree, or differ across peers, because the generator uses implementation-approximated Math (sin/exp/pow) | impact: Peers disagree on occupancy, so the world diverges (a world-model bug). Locally the mesher saturates the mismatched cells, which is cosmetic. | mitigation: Generator uses integer hashing and +,-,*,/,sqrt only. The mesher saturates ρ whenever sign(hint) ≠ occupancy. Add a cross-platform golden test for generated occupancy.
- (medium) Edit latency: an edit near a chunk corner dirties up to 8 chunks, and the delayed swap shows cracks or lag | impact: The edit is visible 2+ frames late, or a transient seam appears | mitigation: Priority queue for edit jobs, ≥2 workers, and atomic swap groups. Fall back to 16^3 mesh sub-chunks if latency exceeds 2 frames.
- (medium) Zero or garbage normals at non-manifold pinch vertices; rare self-intersections after relaxation | impact: Black speckles or small shading artifacts on diagonal builds | mitigation: Fall back to the cell's occupancy gradient when a normal is zero; test for no NaN or zero normals. Splitting vertices in ambiguous cells is deferred.
- (medium) JS meshing too slow on low-end CPUs during initial load (caves 10-20 ms per chunk) | impact: Slow world fill-in, visible pop-in | mitigation: Worker pool sized to hardwareConcurrency-1; windowed relaxation; skip relaxation where there are no edits and hints are present; WASM port as a later option.
- (medium) Vite's module-worker URLs are not relative under IPFS gateway subpaths | impact: Meshing workers fail to load from /ipfs/<CID>/, leaving a blank world | mitigation: Belongs to the build-tooling area: base './' and an acceptance test that loads the build from a subpath. The mesher itself has no asset references.
- (medium) Collision against the smoothed mesh admits a player of a given size only if physics picks dimensions compatible with hE | impact: Players stuck in their own dug tunnels | mitigation: Record the clearance invariant (W−2hE)×(H−2hE) in the plan. Physics picks a capsule ≤0.6×1.6, or collides against block AABBs. Add a gameplay acceptance test: dig a 1x2 tunnel and walk through it.
- (low) Memory: hints plus flags add ~2 B/block (≈64 KB per loaded chunk) | impact: Tens of MB at radius 8 | mitigation: Store hints only for chunks near the surface, or sparsely for |hint|<127; drop hints for chunks outside the mesh radius.

## Requirement conflicts
- [major] "Blocks adjust to their neighbors so the terrain forms smooth surfaces" vs "easy to edit block by block" / "Place and remove blocks": Smoothing a 1-block feature inherently shrinks it. Under the hypothesis, one placed block becomes a 0.55-high bump and a floating block shrinks to a speck (volume 0.007). Smoothness and block-scale edit feedback pull against each other at the 1-block scale. → Thin-feature guard (single block keeps ≥0.6 side, bump ≥0.75) plus the per-block "sharp" toggle for exact cubes. The owner signs off on the guard defaults in the smoothing gallery.
- [major] "First-person movement ... collision with terrain" vs smooth surfaces vs Minecraft-style digging/building: If collision follows the smoothed surface, block-sized openings shrink: a dug 1x2 tunnel becomes 0.59 x 1.00 and a 2x2 becomes 1.52 x 1.52, so the player cannot pass. If collision follows the blocks, what you see and what you hit differ by up to 0.5 block (floating, sinking, camera clipping). → Collide against the smoothed mesh and cap air intrusion at hE=0.2 in edited cells, which guarantees (W−0.4)×(H−0.4) clearance. Physics then picks a player capsule ≤0.6 wide × ≤1.6 tall. Alternatively, block-AABB collision with hE limiting camera clipping. Either way it is a decision the owner should make explicitly.
- [major] "terrain forms smooth surfaces instead of stair-stepped cubes" (with blocks as the only data) vs "Procedurally generated terrain" with gentle slopes: No local smoother over binary blocks removes terraces on gentle slopes: 1:4 to 1:16 slopes keep 7-11° rms and 13-32° max normal ripples even at k=6-8. Taken literally with block data alone, the requirement is unattainable on gentle slopes. → The generator supplies a per-block density hint (derived from the seed; not persisted or synced), and edits saturate it. Generated slopes become exact (≤0.1°); edits stay block-scale. The binary-only fallback remains available.
- [minor] "keep a block sharp and cube-shaped" vs "no visible seams" vs smooth neighbours: For the surface to be watertight, smooth vertices shared with a sharp block must be pinned. Pinning the whole vertex leaves a groove or ridge of up to 0.5 where smooth ground meets a sharp wall. → Pin only the axes normal to incident sharp faces: faces stay exactly planar and the ground meets the wall at its own height. Whole-vertex pinning is the M2 fallback.
- [minor] "Edits reshape the smoothed surface immediately" vs "no visible seams between chunks" vs "must not stall the frame loop": The apron-based smoothing means one edit dirties up to 8 chunks (≈3.6 on average at k=6). Those must be remeshed off-thread and swapped together, so 'immediately' realistically means 1-2 frames. → Define 'immediately' as ≤2 frames at 60 fps. Use a prioritised worker queue with atomic swap groups, and measure in the performance acceptance test.
- [minor] "Procedurally generated terrain that extends as the player explores" + "60 fps ... reasonable default view distance" with no LOD in MVP: Without LOD, view distance is capped at about 192-256 blocks; far terrain simply is not drawn. → Default radius of 6 chunks (192 blocks, the same as Minecraft Java's default). Build LOD (density mip plus skirts or seam strips) after MVP.

## Third-party deps
- vitest (Vitest team (npm package, open source)) build-time: Test runner for the mesher invariants inside npm run check (^4.1) | sees: Source code and test fixtures only; nothing at runtime
- three.js (WebGPURenderer) (three.js maintainers (npm, open source)) runtime (bundled into the static build): Consumes the mesher's buffers for rendering (a rendering-area decision). The mesher itself does not depend on it. | sees: Mesh buffers inside the page; no network access
- None for smoothing itself (n/a) runtime: The mesher is roughly several hundred lines of in-repo TypeScript; no mesher library, no WASM, no remote service | sees: n/a

## Test ideas
- Cube reproduction: with k=0 and start=corner, or with every block sharp, every vertex sits exactly on its integer corner, and the quad set equals the set of solid/air face pairs.
- Watertight: in closed random worlds, and in multi-chunk unions of emitted quads, every directed edge occurs as often as its reverse (a closed 2-chain; non-manifold edges allowed).
- Seam identity: mesh chunk A and its +x, +y, +z and diagonal neighbours from one world; shared corner vertices must match bit-for-bit in quantised position and normal. Include negative controls (apron k+1, chunk-local arithmetic, no quantisation) that must fail, to prove the test has teeth.
- Partition invariance: meshing a 64^3 world as one region vs as 8 chunks gives the identical union of quads and positions.
- Determinism: identical input gives byte-identical output regardless of worker count and job order; golden SHA-256 hashes for ~6 fixed worlds (hills, caves, stairs, sharp wall on slope, random noise, diagonal builds).
- Box constraint: every vertex offset lies within its computed box; pinned axes are exactly 0; every vertex stays inside its own cell.
- Sharp faces: all 4 vertices of every sharp quad lie exactly on the quad's grid plane; a vertex whose incident sharp faces cover 3 axes sits exactly at its corner.
- Thin-feature guard: a floating single placed block has volume ≥ (1−2·0.2)^3 = 0.216; a single-block bump apex is ≥ 1−0.25 above its base plane; a 1x1 pillar is ≥ 0.4 wide.
- Edit clearance: for random dug W×H openings (W,H ∈ 1..3), the free cross-section is ≥ (W−2hE)×(H−2hE), and no triangle enters an edited air block shrunk by hE (triangle/AABB overlap test).
- Picking round trip: for random rays that hit the mesh, the hit quad's (solid, air) blocks are face-adjacent with the correct states; remove(solid) then place(same material) restores the world, and so does place(air) then remove.
- Dirty-set correctness: after a random edit, remeshing only dirtySet(edit) gives the same meshes as remeshing every chunk.
- Hints: a hinted planar density at any slope gives face normals within 0.5° of analytic; with hints disabled the output equals the binary fallback; a hint whose sign disagrees with occupancy is saturated.
- Normals are finite and non-zero everywhere, including in random worlds full of diagonal contacts.
- Mesh-edge graph: a free 1-thick slab stays exactly 1.00 thick after relaxation (catches Gibson-style linking regressions).

## Milestone notes
**M1: mesher core (pure TS, no GPU, runs in Node).**
- Block-data input contract, cell masks, culled-face topology, quad ownership, the apron copy from 27 chunks, and the dirty-set function.
- Gate: cube reproduction, watertightness, seam identity (with negative controls), determinism hash, and edit locality.
- Relaxation off. This alone renders Minecraft-exact meshes, so M1 unblocks rendering.

**M2: smoothing.**
- Offset-space damped Jacobi, the constraint box (guard, then sharp pinning: whole vertex first, per axis once tested), 1/256 quantisation, area-weighted normals with fallback, triangulation rule.
- Invariants 6-10 added to the gate.
- The smoothing-gallery page, and **owner sign-off on the defaults before M3.**

**M3: generator hints.**
- Int8 density hints from the generator, shapeEdited semantics, the relax set R, and the hE edit-clearance rule.
- Gate: hinted planes exact, tunnel-clearance property, hint/occupancy disagreement saturates.

**M4: shading and interaction.**
- Material vertex splitting, texture array, triplanar/biplanar mapping, AO, pick records plus DDA picking, and the collision triangle index.

**M5: scheduling and performance.**
- Worker pool, priority queue, atomic swap groups.
- Benchmark script (reported, not a hard gate, because timings are noisy); performance acceptance on the target laptop.

**Deferred past MVP:**
- LOD (density mip plus skirts or seam strips);
- soft material blending across quads;
- splitting vertices in ambiguous cells;
- a relaxation blend ring around edits;
- 16^3 mesh sub-chunks;
- WASM or GPU meshing;
- per-material "always sharp" defaults.

## Open questions
- Collision model (physics area): collide against the smoothed mesh (recommended, with hE=0.2 and a player capsule ≤0.6×1.6), or against block AABBs? This decides hE.
- Block size relative to the player: 1 block = 1 m (Minecraft) or smaller (e.g. 0.5 m)? Smaller blocks shrink smoothing artifacts relative to the player but cost 8x the data and meshing per volume.
- Is 'sharp' a per-block toggle that travels with the edit (assumed), or also a per-material default (e.g. brick is always sharp)?
- Default view radius: 6 chunks (192 blocks) or 8 (256)? Which integrated GPU is the 60 fps reference?
- Does placing back a block that matches the generated state drop the edit record and restore the hint (world-model area)? Recommended: yes.
- Are the default feel values acceptable: bump +0.45 on hinted ground, dent −1.1, a floating block shown at 0.6 size? To be decided in the smoothing gallery.