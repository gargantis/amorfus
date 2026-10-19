# Prior-art survey (round 1)

## Recommendation

Evidence. I read:
- PLAN.md §6.1, §7.1–7.9, §8.3–8.4 and Appendix A.1;
- the study README;
- src/core/mesh/mesher.ts (aoOf, emitVertex), src/render/shaders/terrain.wgsl, src/core/world/block.ts, src/core/gen/v1/index.ts (the material thresholds);
- docs/build-decisions.md (the bevel entries).

Prior art is from the cited sources. Five sets of measurements are mine, from the study harness with production geometry: volume-kernel materials, oracle distance fields, AO variants, and a real-terrain bench. They are in work/pa/ (pa-vol.mjs, pa-oracle-sdf.mjs, pa-oracle-sdf2.mjs, pa-ao.mjs, scripts/bench-pa.mjs; outputs under out/). Cost figures marked 'est.' are inference, not measurement. The repo was not touched.

1. Material boundaries: the representation is not the bottleneck; working out the right field is.
- Two linear per-vertex distance channels (u8, interpolated per triangle, thresholded) reproduce every material scene to std ≤0.012 when the field is right. That includes 1-wide diagonals (connected) and square corners (exact).
- Local reconstruction from block data cannot get there. Trilinear and B-spline kernels fix 1:1 (0.03–0.04) but leave 1:5–1:8 at 0.22–0.27 (raw cubes 0.28–0.30). Widening to a Gaussian with σ = 1.2 straightens 1:3 (0.02) but deletes single blocks and 1-wide lines and still leaves 1:8 at 0.16.

So:
- (a) Generated terrain: take the boundary field from the generator, as hints already do for shape (sand/grass is the contour H = SEA_LEVEL + 2). Smooth by construction, seam-safe, and no team covers it. It needs an owner decision on the dirt stripes, which disappear.
- (b) Edited terrain: fit contours on the CPU at mesh time over the quad adjacency graph with run-length-aware pixel-art heuristics (Kopf–Lischinski / ScaleFX-style; window ≥8–16 blocks, so apron 10; deterministic) [mv]. Store two distance channels plus the other material's id in the 3 reserved vertex bytes [mf], and threshold with a Valve-style fwidth band.
- (c) Finish with low-contrast height-based blending.
- Keep fragment-only local rules [mx] as the fallback for patterns fitting cannot resolve (checkers, single specks), preferably with tags precomputed on the CPU.
- If the vertex bytes run out (3-material corners, per-quad cases), use programmable vertex pulling rather than growing the 16-byte vertex.

2. AO: compute it from the field that positions the surface, at the vertex's true position. A tent kernel over rho partial-volume occupancy removed the bands completely on generated terrain: hinted slope 0.041 → 0.000, hinted hill 0.065 → 0.002, and the real mountainside stripes are gone. It costs about +5 ms per chunk in unoptimised harness JS, within apron 3. On edited terrain the bands come from the binary data and terraced geometry, so they remain (ramps about 0.04) until edited cells get a smooth field from gh. Add a cheap mesh-curvature term for contact shading there. Keep screen-space GTAO for the High tier only.

3. Surfaces: for built terrain, the only prior-art family that removes terraces on shallow slopes is a non-local smooth embedding constrained by the binary data (Whitaker 2000; Lempitsky 2010). That is the gh direction, ideally Lempitsky's convex objective solved per edit cluster in world space so seams stay deterministic. Converged relaxation (gs) is the vertex-space version of the same idea; the D-3 caps bound it, so context-aware caps are what unlock it. Curved refinement (gc) polishes shading and silhouettes but cannot remove terraces, and done on the GPU it breaks 'what you see is what you hit'.

Avoid density sculpting, MC/Transvoxel and DC: the prior art confirms the §7.7 rejections. Avoid microvoxel or raymarching designs (Teardown) for the iGPU floor.

The bevel rule should not become the default: its facets are what any one-step local corner-cutting rule produces.

## Not covered by the prototype teams

- Generator material hints, the highest-value gap. Generated materials are thresholds of continuous generator fields: sand where H ≤ SEA_LEVEL + 2; top, dirt and stone by dTerrain ≤ 1, ≤ 4, or beyond (src/core/gen/v1/index.ts). Interpolating those fields per vertex would fix the real-terrain grass/sand stair-steps the way rho fixed generated slopes. It is seam-safe (a pure function of the cell) and needs an apron of 1. An oracle test puts the floor at std ≤0.012. Owner decision needed: on the continuous surface the dirt stripes on generated slopes disappear.
- Two-channel per-vertex distance encoding (MSDF-like, the min of two edge distances) rather than one channel. Measured with oracle fields: one channel splits 1-wide diagonals into 13–25 parts and cuts square corners (std 0.11, max 0.46). Two channels keep both exact (≤0.011). Two channels plus the other material's id fit the 3 reserved vertex bytes.
- AO from rho partial-volume occupancy at the vertex's true position, not from binary blocks. Measured: hinted slope 0.041 → 0.000, hinted hill 0.065 → 0.002, and the real-terrain mountainside AO stripes vanish. Fits apron 3; est. 1–2 ms per chunk optimised. gn may already cover the smooth kernel; the choice of field is what matters.
- Programmable vertex pulling with manual barycentrics or quad UVs, in core WebGPU (primitive_index is only an optional feature). It gives per-quad data and true bilinear interpolation without splitting vertices or growing the 16-byte vertex. That unlocks pixel-art tags, autotile cases, 3-material corners, bilinear AO and GPU curved patches.
- ScaleFX-style precomputation of pixel-art rule tags on the CPU at mesh time, as deterministic integer passes. Long windows (level 6, enough for shallow slopes) then cost nothing per fragment; a fragment-only rule is capped by how many loads per pixel the iGPU can afford.
- Height-based blending (Mishkinis; Terrain3D), optionally with a low-amplitude world-space noise bias, as a finishing layer on any soft boundary field. Cheap, and it hides leftover polygon straightness at texture scale.
- A curvature/cavity AO term from the final mesh. It is zero on planes by construction, cheap and deterministic, and gives contact shading on edited terrain where field-based AO cannot help.
- Lempitsky's convex higher-order embedding (sign constraints at block centres, minimal second derivatives) as the formal objective for gh's synthetic hints, solved per edit cluster in world space so seams stay deterministic.
- A stored 7-bit shape density in the reserved block bits 9–15 (7 Days to Die style). This is a fallback if mesh-time synthesis cannot be made seam-safe within the edit-latency budget, and it needs a protocol bump.
- A block-material/occupancy volume texture as a fragment data path, for volumetric AO and neighbourhood rules. Measured as insufficient for boundaries on its own: trilinear leaves 1:8 at 0.266; a Gaussian with σ = 1.2 erases single blocks and 1-wide lines; on real terrain it pulls in sub-surface dirt.
- Screen-space GTAO as a High-tier option only.
- Material-driven shaping (Roblox 'cubify' etc.) as a style lever that keeps planks and brick crisp without the sharp bit.

## Techniques

### Naive surface nets on block counts (NoCubes; 0fps; Roblox's dual mesher)

- Problem: surface; covered by: none
- Summary: One vertex per cell that straddles the surface, placed at the mean of the density field's edge crossings, and one quad per sign-changing edge. On block data the density is a count of solid blocks around each corner. NoCubes (Minecraft mod) defaults to Surface Nets, with Marching Cubes and a legacy renderer as options. Roblox's smooth terrain uses a CPU dual mesher 'inspired by Dual Contouring and Naive Surface Nets': the vertex sits at the average of the edge crossings, the normal is the average triangle normal, and each vertex takes one dominant material.
- Mapping to Amorfus: This is already Amorfus's topology (PLAN §7.2: a vertex per mixed corner, a quad per solid/air pair, d0 = mean zero crossing of rho). With binary data, no hints and no guard, it is the first row of PLAN §7.6.
- Quality: PLAN §7.6 (prototype, measured): bump/dent 0.67, floating-block volume 0.04, pillar 0.50, 1:4 slope 16.6° rms, sphere r=7 12.7°. Everything rounds into blobs, lone blocks almost vanish, and shallow built slopes still terrace.
- Cost: The cheapest option: one pass, 38³ region.
- Risks: Loses 1-block features without the thin-feature guard. Any local rule on binary data terraces shallow slopes (C-7).
- Sources: https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/; https://modrinth.com/project/nocubes; https://zeux.io/data/siggraph2020.pdf; https://github.com/mikolalysenko/isosurface

### Constrained elastic SurfaceNets run to convergence (Gibson 1998; Frisken 2022)

- Problem: surface; covered by: gs
- Summary: Each net node relaxes toward its neighbours' mean over many iterations while staying inside its cell, or within an allowed distance of the cell centre. The surface becomes as smooth as the binary data allow while keeping cracks and thin protrusions. Frisken's 2022 multi-label version uses {allowed distance, relaxations, factor} from {0.6 voxel, 10, 0.4} to {1.4 voxel, 26, 0.4} to match Flying Edges smoothness, at about 3.5 s for 800K quads on one CPU.
- Mapping to Amorfus: Pass 3 of the production rule is this method with k = 6, lambda = 0.5, half-widths 0.2–0.5 and the D-3 caps. Converging needs either more iterations (apron A = k + 4, so k = 20 means 80³ regions) or a solve restricted to edited cells. Context-aware caps would decide where the boxes may open.
- Quality: A ±0.5 box always contains the ideal plane of any 1:n staircase, so a converged net can reach it in principle. In practice the D-3 caps (0.15 horizontal, 0.05 vertical toward air) stop it: README finding 3 has ramp-1:4 and 1:8 at about 11° rms (20–27° max) under hints. Medical practice opens the range past the cell (up to 1.4 voxels) to gain smoothness at a cost in fidelity.
- Cost: Linear in iterations × relaxed vertices, and the apron grows with k. Edit latency is the binding limit (C-12: 22.7 ms per 52³ chunk today).
- Risks: Shrinkage and collapse without the guard (PLAN: undamped lambda = 1 collapsed a pillar to 0.07; Gibson's any-adjacent linking collapsed a slab to 0.41). Seams need A ≥ k + 4. Order independence needs Jacobi. The D-3 tunnel and room invariants must be re-proved wherever caps are relaxed.
- Sources: https://www.merl.com/publications/TR99-24; https://pmc.ncbi.nlm.nih.gov/articles/PMC9623606/; https://scholar.harvard.edu/sites/scholar.harvard.edu/files/sfrisken/files/surface_nets_for_multi-label_segmentations.pdf

### Smoothest field consistent with the binary data (Whitaker 2000 anti-aliasing; Lempitsky 2010 higher-order embedding)

- Problem: surface; covered by: gh
- Summary: Instead of moving mesh vertices, solve for a continuous field whose sign at every voxel centre matches the binary volume and whose curvature is as small as possible. Whitaker uses a constrained curvature level set, implemented in ITK as AntiAliasBinaryImageFilter. Lempitsky solves a convex problem with higher-order smoothness (MSR code is public) and reports smoother surfaces than minimal-area separating surfaces. Planes and gentle quadrics cost almost nothing, so a staircase becomes a plane or a curve rather than a terrace.
- Mapping to Amorfus: This is the principled form of 'synthetic hints for edited terrain':
- solve for rho over the shape-edited cells plus a margin;
- hold generated cells at their hints as boundary conditions;
- keep the sign constraints (solid ⇒ rho > 0) and quantise to i8;
- let the existing d0 rule position the vertices (it already lands generated slopes within 0.1°).
The solve must be a pure function of its inputs: a fixed iteration count, a fixed order, and only + − × ÷.
- Quality: Expected to remove terraces on built ramps and mounds. Among the prior art surveyed here, this is the only family that does that for shallow slopes. The sign constraints keep lone blocks and 1-wide features present, but they can shrink to small blobs, so the guard is still needed. Not measured here.
- Cost: An iterative solve of tens to hundreds of sweeps over the edited cluster, and biharmonic stencils reach 2 blocks per sweep. Estimated several to tens of ms per edit cluster in JS (unmeasured).
- Risks: Seam determinism: both chunks must solve the same domain with the same inputs. So define the domain per edit cluster in world space, not per chunk region, or bound the influence radius inside the apron. Influence is non-local, so dirty sets grow. Edit latency (C-12). D-3 clearance must be re-checked.
- Sources: https://itk.org/pipermail/insight-users/2002-May/000416.html; https://www.microsoft.com/en-us/research/publication/surface-extraction-from-binary-volumes-with-higher-order-smoothness/; https://mlanthology.org/cvpr/2010/lempitsky2010cvpr-surface

### Per-block stored density (7 Days to Die density byte; Roblox occupancy byte)

- Problem: surface; covered by: none
- Summary: 7 Days to Die stores a signed density (−128..127) with each terrain block, and a block's shape depends on its own density and its neighbours'. Roblox smooth terrain stores a material and an 8-bit occupancy per voxel. Occupancy 'overflows' into neighbouring voxels, and the material also shapes the terrain around the voxel. In both, the shape lives in the data, so the mesher has nothing to infer.
- Mapping to Amorfus: Amorfus block values reserve bits 9–15, which must be 0 (PLAN §6.1, src/core/world/block.ts). A 7-bit shape value per edited block could be chosen at edit time, for example copied from the replaced cell's hint or derived from the neighbourhood by the placing peer. It would sync in the existing u16 codec, and the mesher would read it as rho. This is the stored alternative to deriving synthetic hints at mesh time.
- Quality: Exactly as good as the rule that picks the value at edit time. Seam-safe by construction, because it is data, not a derivation. The shape does not update when neighbours change later, so the look depends on the order of edits.
- Cost: No extra bandwidth, since the value is already a u16. Needs a protocolVersion bump (canonical-value rule, validation, import, goldens).
- Risks: Changes the sync and persistence contract. Concurrent edits converge but can leave stale or incoherent shapes. Adds hidden per-block state the player cannot see or edit directly.
- Sources: https://community.thefunpimps.com/threads/block-density.4719; https://zeux.io/2017/03/27/voxel-terrain-storage/; https://roblox.fandom.com/wiki/Terrain

### Dual contouring / Hermite data (Ju et al. 2002; Voxel Farm and EverQuest Next Landmark)

- Problem: surface; covered by: none
- Summary: One vertex per cell, placed by minimising a QEF over the edge intersections and their normals (Hermite data). Sharp features are kept without being detected explicitly, and an octree can simplify the mesh.
- Mapping to Amorfus: Rejected in PLAN §7.7: binary block data has no real normals, and the QEF reproduces the staircase's sharp features. Roblox moved from it to a vertex at the plain average of the crossings.
- Quality: Poor on binary input: it faithfully keeps the steps.
- Cost: Surface nets plus a 3×3 solve per cell.
- Risks: Non-manifold output. Needs normals that block data does not have.
- Sources: https://www.cs.wustl.edu/~taoju/research/dualContour.pdf; https://zeux.io/data/siggraph2020.pdf

### Marching cubes, Transvoxel, density sculpting (Astroneer, No Man's Sky)

- Problem: surface; covered by: none
- Summary: Triangulate a density isosurface cell by cell (0–5 triangles per cell). Transvoxel adds transition cells for LOD seams (512 cases reduced to 73 classes). Astroneer and No Man's Sky edit the density field itself: Astroneer's 'Play-Doh' deformation, and NMS's GDC 2017 pipeline of voxel generation, then polygonisation, then texturing.
- Mapping to Amorfus: Rejected in PLAN §7.7:
- 1-block features vanish;
- about 4× the vertices;
- quads stop mapping to block pairs, which breaks the pick/collision record;
- density edits are not block-sized.
- Quality: Smooth with a real density field. On binary blocks it gives 45° chamfers and lost features.
- Cost: About 4× the vertices (PLAN).
- Risks: Breaks the block-sized edit model and the per-quad pick record.
- Sources: https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No; https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu; https://docs.rs/transvoxel; https://en.wikipedia.org/wiki/Eric_Lengyel

### Curved refinement: PN triangles, Phong tessellation, Catmull–Clark

- Problem: surface; covered by: gc
- Summary: Replace each flat triangle or quad with a curved patch built from its vertex positions and normals, then re-triangulate it. The patch is a cubic Bézier (PN), a Phong-style projection of positions (Phong tessellation), or a subdivision limit surface (Catmull–Clark).
- Mapping to Amorfus: WebGPU core has no tessellation or geometry shaders, so there are two options:
- CPU subdivision at mesh time: ×4 triangles per level, so 1.2 M becomes 4.8 M against the 1.5 M budget unless it is limited to near chunks;
- instanced patches evaluated in the vertex shader, which needs vertex pulling (see that entry).
- Quality: Rounds the silhouettes and shading of an already smooth control mesh. It cannot remove terraces, because interpolating schemes reproduce the control net's steps.
- Cost: ×4 triangles per CPU level, or vertex-shader ALU for GPU patches.
- Risks: Collision and picking use the render triangles ('what you see is what you hit'), so GPU-only curving makes the visible surface and the hit surface differ by the bulge. Cracks where sharp and smooth quads meet. Triangle budget.
- Sources: https://www.telecom-paristech.fr/~boubek/papers/PhongTessellation/; https://developer.download.nvidia.com/presentations/2009/GDC/GDC09_D3D11Tessellation.pdf

### Teardown: small voxels, rounded shading, raymarched volumes

- Problem: surface; covered by: none
- Summary: Each object is a 3D texture with one byte per voxel (a palette index), drawn as a bounding box whose pixel shader marches the volume with MIP skipping. The voxel look is softened by rounded voxel edges in shading, small voxels and heavy temporal filtering. The geometry is never smoothed.
- Mapping to Amorfus: Not applicable as a whole: Amorfus edits are 1-block, collision uses triangles, and the renderer is a rasteriser. Two parts transfer: the per-object byte volume as a GPU data path (see the volume-texture entry), and 'round the edges in shading only'.
- Quality: Hides jaggies by scale, not by smoothing.
- Cost: Raymarching and temporal accumulation need a discrete GPU, above the floor device.
- Risks: Would rewrite the renderer, the physics contract and the data model.
- Sources: https://acko.net/blog/teardown-frame-teardown/

### Vintage Story, Enshrouded, Minecraft shader packs (what the block games actually do)

- Problem: surface; covered by: none
- Summary: Vintage Story stays cubic and adds 1/16 chiselled microblocks. Its only 'smoothing' is worldgen landform mods and an unshipped 'marching cubes for sedimentary blocks' request; players argued that smooth curves clash with pixel-per-voxel textures. Minecraft shader packs smooth in screen space only (SMAA) or per texel (parallax); geometric smoothing comes from mods such as NoCubes. Enshrouded is a fully voxel, diggable world on Keen's in-house Holistic engine with voxel GI, but I found no public meshing details.
- Mapping to Amorfus: Little to take. The art-style warning matters less here because Amorfus textures are triplanar, not pixel-per-voxel.
- Quality: n/a: no geometric smoothing to borrow.
- Cost: n/a
- Risks: Without a primary source, conclusions about Enshrouded's method would be guesses.
- Sources: https://www.vintagestory.at/forums/topic/16986-a-%E2%80%9Cmarching-cubes%E2%80%9D-terrain-mod-for-sedimentary-blocks/; https://www.vintagestory.at/forums/topic/18775-smoothing-option-for-chiseling/; https://modrinth.com/mod/smaa-mc; https://www.pcgameshardware.de/Enshrouded-Spiel-74267/Specials/1-0-Technik-Test-Benchmarks-Release-1556566/

### Material-driven shaping (Roblox smooth terrain)

- Problem: surface; covered by: none
- Summary: Each material can deform its vertices procedurally:
- a pseudo-random shift;
- a lerp toward the box centre ('cubify');
- quantising to a fraction grid;
- a Y-axis 'barrel'.
Rock looks chunky and sand smooth on the same mesher (SIGGRAPH 2020 slides; slide text read via search summaries only).
- Mapping to Amorfus: A per-material post-step on the corner offset d, applied after the rule and before quantisation: for example, cubify planks and brick by 50% and keep grass and sand smooth. Rational factors keep stored values deterministic. It generalises the sharp bit.
- Quality: A style lever, not a smoothing method. Built materials stay crisp without a per-block sharp flag, but boundaries between a smooth and a cubified material show a geometric seam.
- Cost: One multiply-add per vertex.
- Risks: A corner shared by two materials needs one rule (for example, the most cubified wins), or cracks appear. It changes the D-3 measurements.
- Sources: https://zeux.io/data/siggraph2020.pdf

### Texture splatting with per-vertex weights (Frostbite; Godot Voxel Tools Mixel4; Voxel Plugin)

- Problem: material-boundary; covered by: mf
- Summary: Each vertex carries a few material indices and weights, which interpolate across triangles, and the fragment blends textures by weight (sometimes sharpened). Godot Voxel Tools' Mixel4 stores up to 4 indices with 4-bit weights per voxel, with at most 16 textures. Per cell the mesher picks the most-represented textures and packs 4 indices and 4 weights at 8 bits each into one vertex attribute. The early Voxel Plugin stored density, two material indices and a blend alpha per voxel. Frostbite splats procedural shaders over terrain.
- Mapping to Amorfus: Generator v1 has only 8 materials (§6.1), so all 8 weights at 4 bits fit in the material byte plus the 3 reserved bytes. The vertex shader unpacks them into two vec4 varyings, and vertices could then be shared per corner rather than per (corner, material). Weights computed locally from the blocks at a corner give the marching-squares contour (see the measured volume entry). Weights from a fit or from the generator give smooth curves.
- Quality: Bounded by the field behind the weights. Local corner fractions give std ≈0.04 at 1:1 but ≈0.27 at 1:8, plus anisotropy along the triangle diagonal. A fitted or generator field can reach ≤0.012 (oracle entry).
- Cost: Vertex-shader unpack, and 2 materials × up to 3 triplanar fetches inside the blend band (today: 1 material × 3).
- Risks: Linear interpolation inside triangles splits each quad's bilinear shape along its diagonal. More than 4 materials at a corner (Godot warns of artifacts). Changing the vertex-split strategy re-emits the goldens.
- Sources: https://voxel-tools.readthedocs.io/en/latest/smooth_terrain/; https://forums.unrealengine.com/t/voxel-plugin/100071; https://www.advances.realtimerendering.com/s2007/Andersson-TerrainRendering(Siggraph07)-CourseNotes.pdf; https://en.wikipedia.org/wiki/Texture_splatting

### Distance-field masks: Valve alpha-tested SDF and multi-channel SDF (oracle measured)

- Problem: material-boundary; covered by: mf
- Summary: Store a signed distance to the boundary, not a colour or weight, and threshold it in the fragment (smoothstep over fwidth for antialiasing). Linear interpolation of a distance field reproduces straight edges exactly at any magnification (Green, Valve 2007). One channel rounds corners off; Chlumský's MSDF keeps corners by taking the median of 3 channels.
- Mapping to Amorfus: Put the distances in the 3 reserved vertex bytes and threshold in terrain.wgsl. One layout: two u8 channels at 1/64 block over ±2 blocks, plus the other material's id. The distances must come from a boundary model, either fitted curves (mv) or generator fields (material-hints entry); blurring the block data is not enough.
- Quality: MEASURED with oracle fields: production geometry, harness raster, u8 quantised.
- One channel: straight edges at every slope std ≤0.009 (raw 0.26–0.30); discs 0.010–0.021; hill-materials 0.009–0.012.
- One channel fails on thin features and corners: 1-wide diagonals split into 13–25 parts; square-6 std 0.110 with 0.46 max at the corners; 2-wide band 0.119.
- Two channels (min of two edge distances): 1-wide 1:1 and 1:2 lines stay one part (width 0.66–0.71 against 0.707 ideal); square-6 0.000; edges 0.009.
The representation is sufficient. The hard part is the field.
- Cost: 2–3 bytes per vertex, which fit the reserved bytes, and a few ALU ops. Both materials are sampled only inside a band about 1 pixel wide for antialiasing.
- Risks: Three-material junctions need a third channel or per-quad data. Vertices split per material at the same corner must carry identical distances. MSAA does not antialias a hard threshold (shading runs once per pixel), so use the fwidth band. Distances must be computed deterministically (+ − × ÷ √ only) and identically in both chunks.
- Sources: https://cdn.akamai.steamstatic.com/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf; https://github.com/Chlumsky/msdfgen; work/pa/pa-oracle-sdf.mjs; work/pa/pa-oracle-sdf2.mjs; work/pa/results/pa-oracle-sdf2/results.json

### Three-material barycentric blend per triangle (Roblox; Red Blob Games)

- Problem: material-boundary; covered by: mf
- Summary: Each triangle sees the materials of all 3 vertices and blends them by barycentric weight, optionally sharpened (a power, a max, or a noise-biased max). Red Blob duplicates every vertex per triangle to get barycentrics. Per the Roblox SIGGRAPH 2020 slides (via search summaries), a naive 3 materials × triplanar × 3 textures costs 27 fetches, so Roblox samples each vertex's material once with one of 18 projection planes.
- Mapping to Amorfus: WebGPU core has no barycentric builtin, and primitive_index is an optional feature (Chrome 142), not core. Either duplicate vertices per triangle (about 2–3× vertex bytes), or use vertex pulling to emit manual barycentrics and the triangle's 3 materials as flat varyings.
- Quality: The boundary follows the triangles at half-block resolution. Better than per-quad material, but still a polyline staircase unless the weights come from a smooth field.
- Cost: Up to 9 texture fetches (3 materials × 3 planes) in mixed triangles.
- Risks: Shapes depend on the triangle diagonal. Fetch cost on the iGPU.
- Sources: https://zeux.io/data/siggraph2020.pdf; https://www.redblobgames.com/x/1730-terrain-shader-experiments/; https://developer.chrome.com/blog/new-in-webgpu-142

### Height-based blending (Mishkinis 2013; Terrain3D)

- Problem: material-boundary; covered by: none
- Summary: Modulate each material's blend weight by a per-texture height map, so stone tops poke out and sand fills the cracks, then sharpen. Terrain3D reads its control map at the 4 grid points around each pixel (5-bit base and overlay IDs, 8-bit blend), weights them bilinearly, and adjusts the weights by texture height, sharpness and world normal. That costs 5–20 lookups per pixel.
- Mapping to Amorfus: A finishing layer on any soft weight field (splatting, distance field or volume lookup). Write a height into the alpha of the procedural textures (texgen.wgsl), and in the fragment compare (weight + height) between the band's two materials.
- Quality: Does not change where a boundary runs. It turns a straight or soft edge into a crisp, natural edge at texture scale, which makes leftover polygon straightness or sub-block wiggle much less legible. Not measured: the harness renders flat colours.
- Cost: One more texture channel and a few ALU ops. Both materials are sampled only inside the band.
- Risks: Needs a soft band of at least 0.2–0.5 block. It can read as 'noisy' rather than 'smooth', so keep the contrast low. Only 8 procedural textures to tune.
- Sources: https://www.gamedeveloper.com/programming/advanced-terrain-texture-splatting; https://github.com/TokisanGames/Terrain3D/blob/main/doc/docs/shader_design.md; https://en.wikipedia.org/wiki/Texture_splatting

### Noise-biased thresholds

- Problem: material-boundary; covered by: none
- Summary: Red Blob Games' 'biased max' adds noise to the bias so boundaries come out irregular and natural, 'much cheaper than inserting hundreds of vertices into each polygon'.
- Mapping to Amorfus: Add a small world-space noise, procedural or from a tiled texture, to the distance threshold or to the splat weight in the fragment.
- Quality: Breaks the regular period of a staircase, which is what reads as 'designed'. It trades regular steps for organic wobble rather than smoothing. Suits natural pairs (grass/sand) at small amplitude; wrong for built materials.
- Cost: One noise evaluation per fragment inside the band.
- Risks: Works against the owner's 'smooth' brief if overused. Must stay world-anchored so it does not swim.
- Sources: https://www.redblobgames.com/x/1730-terrain-shader-experiments/

### Pixel-art magnifiers: EPX/Scale2x, hqx, xBR, ScaleFX, MMPX, cleanEdge

- Problem: material-boundary; covered by: mx
- Summary: Rule-based upscalers that read a pixel neighbourhood and decide sub-pixel colours. Most keep the exact palette (MMPX, ScaleFX), turn 45° steps into straight diagonals, and handle 1:2 lines and corners.
- MMPX (JCGT 2021) magnifies 2×, preserves 1-pixel features and the palette, and runs a 64k-pixel screen in under 0.5 ms.
- ScaleFX is multi-pass, reads up to 3 texels out, and 'interpolates edges up to level 6'.
- cleanEdge (GLSL, MIT) handles any scale and rotation but struggles with dithering.
- Mapping to Amorfus: On flat ground the plan-view material map is literally pixel art: one pixel per block top. On a 3D surface the neighbourhood must follow the quad adjacency graph across steps and cliffs, not world planes. A per-fragment 5×5–7×7 window means 25–49 material loads per pixel. ScaleFX's split fits better: compute the edge and corner tags per block on the CPU at mesh time (integer, deterministic) and leave only the final reconstruction to the fragment, through per-quad data (vertex pulling or a volume texture).
- Quality: Not measured here (team mx). Expected near 0 at 1:1 and good at 1:2; shallow slopes are limited by window length. The measured ceiling for kernels with 1-block context at 1:5–1:8 is std 0.22–0.27 (volume entry). 2× magnification leaves a half-scale staircase on long runs.
- Cost: Fragment-only: tens of loads per pixel, est. 0.5–3 ms at 2.1 MP on the floor iGPU (unmeasured). Precomputed tags: about 1 byte per surface block plus a cheap fragment step.
- Risks: Ambiguous patterns (checkers, dithering). Behaviour across 3D folds. Neighbourhood data must reach the fragment, which is a data-path change.
- Sources: https://casual-effects.com/research/McGuire2021PixelArt/McGuire2021PixelArt.pdf; https://raw.githubusercontent.com/libretro/slang-shaders/master/edge-smoothing/scalefx/shaders/scalefx-pass3.slang; https://forums.libretro.com/t/xbr-algorithm-tutorial/123; https://www.ffmpeg.org/pipermail/ffmpeg-devel/2014-October/164603.html; https://krita-artists.org/t/cleanedge-for-pixel-art-rotation-upscaling/56466; https://devforum.play.date/t/cleanedge-tool-to-create-clean-rotation/9903

### Depixelizing pixel art (Kopf & Lischinski 2011; real-time GPU version 2015)

- Problem: material-boundary; covered by: mv
- Summary: Resolves the ambiguity of diagonal neighbours, which touch only at a corner, so thin diagonal features stay connected (the paper does this with a similarity graph and heuristics). It then reshapes the pixel cells, extracts contours, fits spline curves and optimises their control points for smoothness. Kreuzer, Kopf and Wimmer (I3D 2015 poster) ran it in real time on the GPU for emulators.
- Mapping to Amorfus: Run on the CPU at mesh time over the surface's quad adjacency graph, per material pair. Output per-vertex distances to the fitted curves (2 channels, as in the distance-field entry) or per-quad curve parameters. The fit needs a bounded window at least as long as the run it straightens (8–16 blocks for 1:8) and identical inputs in both chunks. That means the 52³ region (apron 10), not 38³. Fixed-iteration optimisation with only + − × ÷ keeps it deterministic.
- Quality: The best-known reconstruction for shallow slopes, discs and 1-wide diagonal lines; it targets exactly the baseline's pinch and connectivity flags. The 2-channel representation measured ≤0.012 std with exact fields, so final quality is set by the fit. Not measured here (team mv).
- Cost: Per chunk, contour extraction and fitting over the surface boundaries: est. 1–5 ms in JS (unmeasured), on top of about 22 ms per chunk today.
- Risks: Seams if the fit window exceeds the apron. Instability: one placed block can move a fitted curve several blocks away, causing edit flicker and larger dirty sets. Heuristics can misread intentional pixel patterns. Three-material junctions.
- Sources: https://johanneskopf.de/publications/pixelart; https://www.cg.tuwien.ac.at/research/publications/2015/KREUZER-2015-DPA/; https://history.siggraph.org/?p=114686

### Autotile and transition tiles: OptiFine CTM overlay, Hytale transition textures, dual-grid marching squares

- Problem: material-boundary; covered by: mx
- Summary: Pick a pre-drawn transition per face from the neighbours' materials. OptiFine's 'overlay' connected-texture method uses 17 tiles for block-to-block transitions, such as grass onto sand. Hytale blocks carry transition textures toward listed block types; a mod reports that vanilla grass-type blends stack two masks on one edge. Dual-grid autotiling (marching squares) needs 16 tiles per pair, against 47 for blob sets.
- Mapping to Amorfus: A per-face case index (4–8 bits per quad) computed on the CPU from the 4 or 8 surface neighbours, plus a mask atlas of authored curved shapes. Vertices are shared per (corner, material), so the case must reach the fragment as per-quad data (vertex pulling, or primitive_index where available).
- Quality: Organic, artist-controlled edges, but the path stays quantised to the block lattice. Same family as the bilinear/trilinear contour measured in the volume entry: about 0.04 at 1:1, 0.15 at 1:2, 0.27 at 1:8.
- Cost: Small: one byte per quad and one more mask fetch.
- Risks: Corners with several materials multiply the tile count. Masks cross triplanar seams on slopes.
- Sources: https://optifine.readthedocs.io/ctm.html; https://www.curseforge.com/hytale/mods/bettergrass; https://www.boristhebrave.com/2023/05/31/quarter-tile-autotiling/; https://excaliburjs.com/blog/Dual%20Tilemap%20Autotiling%20Technique

### Boundaries as geometry: multi-material marching cubes, multi-label SurfaceNets

- Problem: material-boundary; covered by: mv
- Summary: Make material interfaces part of the mesh. Wu & Sullivan's multiple-material MC extracts every inter-material surface in one sweep. Frisken's multi-label SurfaceNets treats cells with faces that separate 3 or more labels as EdgeVertices. These relax only toward neighbours across junction faces, so the junction curve smooths along itself and stays sharp.
- Mapping to Amorfus: On an Amorfus surface, a material boundary is a junction curve of (A, B, air). Relaxing the boundary corners along that curve (a 1D Laplacian, in-plane, clamped to ±0.5) generalises the bevel rule's 0.25 seam shift. In-plane moves on flat ground leave collision unchanged; on slopes they must be projected onto the surface.
- Quality: The bevel rule's one-step version already measures 0.065 at 1:2 and 0.000 at 1:1 (README). Converged smoothing along the curve could straighten every slope. Structural limit: a 1-wide diagonal line touches only at shared corners, so it pinches there whatever the vertex positions. Thin features need the field approach.
- Cost: A few relaxation sweeps over boundary vertices; deterministic, but the apron must cover the sweeps.
- Risks: Moves vertices, so goldens change and collision shifts slightly on slopes. Pinches on thin features. Interaction with sharp pinning and the D-3 caps.
- Sources: https://pmc.ncbi.nlm.nih.gov/articles/PMC9623606/; https://doi.org/10.1002/nme.775; https://www.accu.org/journals/overload/16/87/golodetz_1510

### Per-fragment lookup in a block-material volume texture (measured)

- Problem: material-boundary; covered by: none
- Summary: Give the fragment shader a 3D texture of block materials: bytes per voxel as in Teardown, or one occupancy channel per material. Sample it at p − 0.5·n with a kernel over solid block centres and take the material with the largest weight. The boundary no longer depends on the mesh.
- Mapping to Amorfus: Two layouts:
- a 34³ u8 brick per chunk with a 1-block apron (about 39 KiB; about 13 MiB for about 340 surface chunks at R = 192, est.);
- 8 per-material unorm channels in two rgba8 3D textures (about 78 KiB per chunk), so the hardware trilinear filter does the weighting in 2 fetches.
Bricks sit in a 3D atlas indexed by chunk slot (maxTextureDimension3D defaults to 2048). Fragment-side, so outside the golden hashes.
- Quality: MEASURED, std / maxDev.
- Trilinear: 1:1 0.043, 1:2 0.153, 1:3 0.197, 1:5 0.237, 1:8 0.266; discs 0.20–0.24; hill-materials 0.248 (hints 0.330); 1-wide diagonals pinch (24 parts); a lone block shows 61% of its area.
- Quadratic B-spline: 1:1 0.028, 1:2 0.119, 1:8 0.255; lone block 27%.
- Gaussian σ 1.2 blocks: 1:2 0.006, 1:3 0.022, 1:5 0.088, 1:8 0.159, but single blocks and 1-wide lines vanish, square corners round off (0.185), and an r = 2.4 disc shrinks to 74%.
- Raw cubes: 0.26–0.30.
- Real terrain (beach view): sampling below the surface pulls in sub-surface dirt and adds blotches.
Local kernels fix only steep diagonals and wide ones erase features, so the volume is a data path, not a solution.
- Cost: 8 texel loads or 2 filtered fetches per fragment (est. ≤0.3 ms at 2.1 MP). Uploads of 39–78 KiB when a chunk streams in, and tiny writes per edit.
- Risks: Brick seams need aprons. Which depth and layer to sample (dirt under grass). Adds a binding and an upload path to the renderer.
- Sources: https://acko.net/blog/teardown-frame-teardown/; https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits; work/pa/pa-vol.mjs; work/pa/results/pa-vol-tri/results.json; work/pa/results/pa-vol-tri/img/terrain-beach-view.png

### Generator material hints: material fields from the generator, as hints are for shape

- Problem: material-boundary; covered by: none
- Summary: Generated materials are thresholds of continuous generator fields. In src/core/gen/v1/index.ts, sand versus grass is H ≤ SEA_LEVEL + 2 on the column height H, and top, dirt and stone are dTerrain ≤ 1, ≤ 4, or beyond. Evaluate those fields at vertex positions, the way d0 interpolates rho, and the boundaries are smooth by construction: the beach line becomes a contour of H. This mirrors heightmap engines that splat from continuous masks rather than per-cell IDs.
- Mapping to Amorfus: Emit a quantised i8 'material hint' per column for sand ((SEA_LEVEL + 2 − H)/S) and, if wanted, per block for depth. Both must be pure functions of (seed, generatorVersion, cell) under the exact-ops allowlist. Interpolate them per vertex into the distance channels of the distance-field entry. Edited blocks fall back to block-derived fields (mv/mf). Seam-safe automatically, since the value is a pure function of the cell; apron 1.
- Quality: With exact fields the oracle measured std ≤0.012 on edges, discs and the hill. The real-terrain grass/sand stair-steps (README finding 5) would become smooth contours. This carries a look decision: on the continuous surface dTerrain ≈ 0, so the dirt stripes on generated slopes vanish unless a slope or cliff rule is added. Those stripes are riser quads of blocks with 1 < dTerrain ≤ 4.
- Cost: A few ops per column in the generator, 1–2 bytes per vertex, and re-emitting goldens (allowed until the D-24 freeze).
- Risks: A generator change: the frozen-generator contract and the C-10 goldens. The seam between generated and edited regions needs a consistent blend. The look change (fewer dirt and stone exposures) needs the owner's decision.
- Sources: src/core/gen/v1/index.ts; work/pa/results/pa-oracle-sdf/results.json; https://github.com/TokisanGames/Terrain3D/blob/main/doc/docs/shader_design.md; https://www.advances.realtimerendering.com/s2007/Andersson-TerrainRendering(Siggraph07)-CourseNotes.pdf

### Programmable vertex pulling with manual barycentrics (WebGPU core)

- Problem: several; covered by: none
- Summary: Draw non-indexed and fetch indices and vertices from storage buffers in the vertex shader: triangle = vertex_index / 3, corner = vertex_index % 3. Each invocation can then read per-triangle or per-quad records and emit one-hot barycentrics or quad UVs. The fragment gets all 3 or 4 corners' data without duplicated vertices (Rákos, OpenGL Insights 2012). The builtin alternative, primitive_index, is an optional WebGPU feature (Chrome 142), not core.
- Mapping to Amorfus: Pool pages gain STORAGE usage (64 MiB pages fit the 128 MiB default binding size), and the chunk_origins storage buffer gains each chunk's index and vertex offsets. A per-quad side array, e.g. 8–16 B per quad (other materials, a tag or case byte, 4 corner AO values), enables:
- true bilinear interpolation per quad, with no triangle-diagonal anisotropy, for AO and weights;
- MSDF channels and a 2nd/3rd material id without growing the 16 B vertex;
- GPU-side curved patches for gc.
- Quality: An enabler. It removes the two limits the study README lists: attributes are linear within each triangle, and flat varyings come from the first vertex.
- Cost: About 3 vertex-shader invocations per triangle instead of cache reuse (est. about 1.5 M per frame at about 0.5 M visible triangles), plus storage reads. Per-quad data about 5–10 MB at R = 192 (est.). Unmeasured on the floor device.
- Risks: Gives up post-transform cache reuse. A renderer change: pipelines, pool usage flags, e2e. Per-quad data hashed with the mesh changes the goldens. WebGPU compatibility mode, if ever targeted, limits storage buffers in the vertex stage.
- Sources: https://gameenginegems.com/gemsdb/article.php?id=1169; https://developer.chrome.com/blog/new-in-webgpu-142; https://dawn.googlesource.com/dawn/+/0a7364815ce9/src/tint/transform/vertex_pulling.h

### Minecraft-style vertex AO (0fps 2013), the current baseline

- Problem: ao; covered by: gn
- Summary: Per-vertex AO from the cubes next to the vertex: 0 if both side cubes are solid, else 3 − (side1 + side2 + corner). The quad is flipped when a00 + a11 > a01 + a10 to avoid anisotropy. It assumes full cubes; a commenter notes non-cube shapes need interpolated per-vertex weights.
- Mapping to Amorfus: Amorfus's aoOf (mesher.ts) is a variant: the solid fraction f of the 4×4×4 blocks around the lattice corner, then clamp(1 − 1.2·max(0, f − 0.5), 0.55, 1). Two things make the bands: the window is anchored at the lattice corner, and it counts binary blocks under a smooth surface (README finding 4).
- Quality: MEASURED; the harness reproduces production exactly. AO roughness: hinted-slope-1:4 0.041 (an exact plane), hinted-hill 0.065, pit 0.146. Terraced bands on smooth hills and stripes on real mountainsides.
- Cost: 64 block reads per vertex.
- Risks: This is the baseline being replaced.
- Sources: https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/; work/pa/results/pa-ao-lattice/img/hinted-hill-view.png

### AO from the surface's own field at the vertex's true position (measured)

- Problem: ao; covered by: gn
- Summary: Evaluate occupancy with a smooth kernel centred on the actual vertex position, from the field that positions the surface rather than from binary blocks. Hinted cells use partial-volume occupancy, occ = clamp(0.5 + 2·rho) (rho = d/4, HINT_SCALE 4); edited cells stay ±1. This is the per-vertex analogue of SDF AO (Quilez; UE distance-field AO) and of Vorxel's smooth voxel AO.
- Mapping to Amorfus: Replace aoOf with a tent kernel of half-width 2: separable weights, only + − × ÷, reading blocks within 3 of the corner. It fits the 38³ region, and the stored AO stays deterministic.
- Quality: MEASURED AO roughness rms, production → tent over binary blocks → tent over rho:
- hinted-slope-1:4: 0.041 → 0.026 → 0.000
- hinted-hill: 0.065 → 0.015 → 0.002
- mound: 0.075 → 0.042 → 0.041
- pit: 0.146 → 0.080 → 0.080 (min AO still 0.675, so concavities stay dark)
- ramp-1:4 (edited): 0.041 → 0.043 → 0.042
On the real-terrain mountainside the AO stripes disappear. Edited terrain keeps its bands, because binary data and terraced geometry cause them there, until edited cells get a smooth field (gh). A C1 quadratic B-spline was slightly rougher than the tent on edited scenes.
- Cost: 216 block reads per vertex instead of 64. Bench: 35.3 against 30.6 ms mean per chunk in unoptimised harness JS (16 real chunks, apron 10). Est. 1–2 ms with optimised separable code.
- Risks: Generated flats read AO ≈ 1 everywhere: correct for a plane, but less ambient variation. The rho-to-occupancy map depends on HINT_SCALE. AO is discontinuous where hinted and edited cells mix and rho jumps to ±1.
- Sources: work/pa/pa-ao.mjs; work/pa/results/pa-ao-tent-rho/img/hinted-hill-view.png; work/pa/results/pa-ao-tent-rho/img/terrain-mountain-view.png; https://csh.rit.edu/~gman/PersonalWebpage/ao.html; https://teknologicus.itch.io/vorxel/devlog/688457/smooth-shaded-voxel-ambient-occlusion; https://advances.realtimerendering.com/s2015/DynamicOcclusionWithSignedDistanceFields.pdf

### Curvature (cavity) AO from the smoothed mesh

- Problem: ao; covered by: none
- Summary: Approximate occlusion from local concavity, i.e. mean curvature: darken where the surface bends inward. Hattori et al. (2012) derive occlusion from curvature via a quadric fit in two GPU passes and claim lower cost than SSAO. Griffin, Olano et al. (UMBC) estimate curvature on the GPU and use it as an AO approximation.
- Mapping to Amorfus: Per vertex on the CPU once positions are final: the umbrella Laplacian (vertex minus neighbour mean) dotted with the normal, over 1–3 rings, mapped to a darkening. Combine it with the field-based term for large-scale occlusion.
- Quality: Exactly constant on planes and slopes, so no banding by construction. Darkens creases where built ground meets walls, and pit floors. It misses occlusion wider than its ring radius (trenches, overhangs), so it complements the field-based AO rather than replacing it. Unmeasured.
- Cost: Trivial: one pass over the vertex graph, deterministic (+ − × ÷ √). Apron equals the ring count (≤3).
- Risks: On edited terrain it reacts to the terraces themselves, darkening each step's concave foot. Values depend on mesh resolution.
- Sources: https://scitepress.org/Documents/2012/38484/; https://userpages.cs.umbc.edu/olano/papers/curvature/realtime_curvature.pdf

### Volumetric AO from a 3D occupancy texture (AO fields, distance-field AO, voxel volumes)

- Problem: ao; covered by: none
- Summary: Store occlusion or occupancy in a volume and sample it per fragment along the normal. Prior art:
- Kontkanen & Laine's AO fields precompute a field around each occluder (136 fps on 2005 hardware);
- Infamous 2 baked per-voxel AO fields;
- UE's distance-field AO cone-traces SDFs (Wright 2015);
- Minecraft shader packs voxelise the world around the player (Rethinking Voxels raymarches voxelised shapes).
- Mapping to Amorfus: Reuse the block-volume data path from the volume-texture entry. Store rho-derived partial occupancy per block (smooth on generated terrain) plus a mip level. Take 1–2 trilinear taps at p + 0.5·n and p + 1.5·n in terrain.wgsl. Fragment-side, so outside the goldens.
- Quality: Per pixel and independent of the mesh: no per-vertex interpolation artefacts, and smooth on generated terrain. On edited terrain the binary staircase still shows at reduced amplitude. Unmeasured.
- Cost: 1–2 filtered fetches per fragment (est. <0.3 ms at 2.1 MP), plus the volume's memory and uploads.
- Risks: Needs the volume data path. Tuning to avoid self-occlusion bias. Brick aprons.
- Sources: https://users.aalto.fi/~laines9/publications/kontkanen2005i3d_paper.pdf; https://www.reedbeta.com/talks/ao-fields/Ambient%20Occlusion%20Fields%20and%20Decals%20in%20Infamous%202.pdf; https://advances.realtimerendering.com/s2015/DynamicOcclusionWithSignedDistanceFields.pdf; https://github.com/gri573/rethinking-voxels

### Screen-space AO: GTAO / XeGTAO, HBAO

- Problem: ao; covered by: none
- Summary: Horizon-based AO from the depth buffer. GTAO matches ray-traced ground truth at 0.5 ms on a PS4 at 1080p (Jimenez et al. 2016). XeGTAO is Intel's MIT implementation for integrated and discrete GPUs, archived in 2024.
- Mapping to Amorfus: Needs depth and normals before shading. Amorfus draws terrain in one forward pass with 4× MSAA, so it would need:
- a depth pre-pass (re-drawing about 0.5 M triangles) or deferred shading;
- a resolve of the multisampled depth;
- a half-resolution GTAO pass with a bilateral upsample.
- Quality: Pixel-scale contact occlusion with nothing tied to blocks, so no banding. View-dependent; halos and noise need denoising.
- Cost: Est. 1–3 ms including the pre-pass on the floor iGPU at 2.1 MP (unmeasured), against a 12 ms GPU budget that PLAN calls unproven at R = 192.
- Risks: Restructures the frame (§8.3). Temporal noise with no TAA. Too costly for the Medium floor; a candidate for the High tier only.
- Sources: https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf; https://github.com/GameTechDev/XeGTAO

### Raymarched voxel AO with temporal accumulation (Teardown)

- Problem: ao; covered by: none
- Summary: Cosine-weighted hemisphere rays through voxel volumes at 2 samples per pixel, plus a one-voxel screen-space step. Then a spiral blur weighted by depth and normal, temporal reprojection, and TAA.
- Mapping to Amorfus: Would need the volume data path, a raymarcher, motion vectors and TAA, none of which Amorfus has.
- Quality: Excellent view-dependent occlusion.
- Cost: Far beyond the iGPU floor.
- Risks: Noise without TAA; a renderer rewrite.
- Sources: https://acko.net/blog/teardown-frame-teardown/

