# rendering: Rendering approach (WebGPU, engine choice, iGPU budget, failure messaging)

## Recommendation

## Evidence base (what was actually looked at)
- **Read:** `REQUIREMENTS.md`; private owner material (not described here); three r185.1 source from the three.js package (`WebGPURenderer.js`, `WebGPUBackend.js`, `Renderer.js`, `BatchedMesh.js`, `Object3D.js`); the WebGPU and WGSL editor's drafts dated 23 Sep 2026; Chrome WebGPU release posts for 121, 144, 146, 147-148 and 149-150; Chrome 153 release notes; the gpuweb Implementation-Status wiki (updated 13 Aug 2026); gpuweb#5272 and #4349; three#30560 (read through the GitHub API); Chrome troubleshooting docs; and the MDN, Toji and webgpufundamentals articles.
- **Run on this machine:** an i7-1255U (whose iGPU is an Iris Xe 96EU) under WSL2, which has no `/dev/dri`. Vite 8.1.3 builds were used to measure bundle sizes. Chrome for Testing 149.0.7827.55 was driven headless by Playwright 1.63, using SwiftShader, to benchmark CPU cost per frame and probe secure-context and headless behaviour. `webgpu`@0.6.1 (Dawn for Node) was tried on Mesa llvmpipe. Scratch files are under `research/2026-09-23/proto/`.
- **Estimated, not measured:** all GPU-side timings for real iGPUs (Iris Xe, Arc 140V, 780M). No real GPU was reachable from this session. These numbers must be confirmed in Milestone R0 on real hardware.

## 1. Graphics layer: raw WebGPU plus wgpu-matrix (the hypothesis holds, and the measurements back it)

### Measured CPU cost per frame
Setup: i7-1255U, the same 15 W CPU class as the target, Chrome 149 headless with SwiftShader. Each chunk is a unique geometry sharing one material. Timings are the median JS time for the whole frame over 60 frames, including culling and submit.

| Scene | 500 meshes | 2000 meshes |
|---|---|---|
| Raw WebGPU: one shared vertex/index pool, `drawIndexed(..., firstInstance=slot)`, JS frustum cull and sort | **0.4 ms** | **1.0 ms** |
| three r185.1 `WebGPURenderer`, Lambert node material (`static` = false / true) | 2.5–3.8 ms | **8.6–11.9 ms** |
| Babylon 9.27.1 `WebGPUEngine`, `StandardMaterial` (frozen or not) | 6.3–6.6 ms | **22.8–23.5 ms** |

- Raw draw encoding cost about 0.15–0.2 µs per draw with no state changes (0.3–0.4 ms per 2000 draws).
- Adding a per-draw `setVertexBuffer` and a dynamic-offset `setBindGroup` raised that to 0.8–1.0 µs per draw (1.6–2.0 ms per 2000).
- SwiftShader shares the CPU with the page, so the absolute numbers are pessimistic. The ratios, roughly 9x and 20x, are the useful result.
- three's many-render-item overhead is tracked as three#30560: open, labelled high priority, last activity 2026-09-15.

### Bundle size
Minimal Vite 8 build, minified and gzipped.

| Library | Minified | Gzipped |
|---|---|---|
| wgpu-matrix | 39.6 KB | 9.9 KB |
| `three/webgpu` | 768 KB | ~207–210 KB (tree-shaking is poor) |
| Babylon | ~1.31 MB across 48 files | ~317 KB |

### Why raw WebGPU, point by point
- **Fallback control.**
  - three's `WebGPURenderer` hard-wires a WebGL2 fallback through `getFallback`.
  - It can be detected after `await renderer.init()` with `renderer.backend.isWebGPUBackend`.
  - It can be avoided by creating the `GPUDevice` yourself and passing `{ device }`, which skips `requestAdapter` entirely.
  - r185 also asks for `featureLevel: 'compatibility'` and turns MSAA off in compatibility mode.
  - Relying on this automatic fallback would break the "show a clear message" requirement.
  - Babylon's `WebGPUEngine` does not fall back. However, its defaults point at `cdn.babylonjs.com` (glslang and twgsl, loaded lazily for GLSL shaders) and `assets.babylonjs.com`. That is a hidden third-party runtime fetch on an IPFS/static site.
- **Upload control.**
  - Raw WebGPU lets us suballocate large buffers, schedule every `writeBuffer`, and swap several chunks in the same frame.
  - three uploads inside `render()` whenever `needsUpdate` or `addUpdateRange` is set. Its equivalent (`BatchedMesh` with `addGeometry`/`setGeometryAt`/`setGeometrySize`/`optimize`) is workable but means fighting the abstraction.
- **Development speed.**
  - three would save perhaps 1–2 weeks: camera, fog, controls, CSM shadows and post-processing come ready-made.
  - Amorfus needs only about 4 pipelines (terrain, sky, lines, avatars), one of which (terrain) is custom anyway.
  - Estimated renderer size: about 2,000 lines of TypeScript plus about 400 lines of WGSL.
- **Plan B, if raw velocity disappoints:** three r186 with a pre-created device passed in, one `BatchedMesh` for all terrain, and `Object3D.static`. Do not use one `Mesh` per chunk.
- **Libraries to take:** wgpu-matrix 3.4.2 (MIT, clip-space z in 0..1, has `perspectiveReverseZ`) and `@webgpu/types`.
- **Library to skip:** `webgpu-utils`. Its `generateMipmap` alone costs 33–40 KB gzipped; write a mip generator of about 60 lines instead.

## 2. Platform matrix as of Chrome 153 (stable 8 Sep 2026)
WebGPU is on by default in these cases:
- Windows x64, macOS and ChromeOS from Chrome 113.
- **Linux: Intel Gen12+ only**, from Chrome 144. WebGPU runs on Vulkan while the rest of Chrome stays on GL.
- **Linux: NVIDIA driver ≥535.183.01 on Wayland**, from Chrome 147.

It is **behind a flag** in these cases:
- All other Linux GPUs, **including AMD (the Radeon 780M), NVIDIA on X11, and pre-Gen12 Intel**.
- **Windows on ARM64** (Snapdragon X) in Chrome and Edge. The wiki as of Aug 2026 and gpuweb#5272 both say so.
- Compatibility mode (GLES/D3D11) has shipped on Android only. It does not help on desktop.

Configurations that will fail the "two different machines" test (no adapter, or `navigator.gpu` missing):
- Linux with AMD, NVIDIA on X11 or an older driver, or older Intel.
- Windows on ARM.
- VMs, RDP or WSLg without a GPU. This session's WSL2 got a null adapter with no flags.
- "Use graphics acceleration" turned off, or a blocklisted driver.
- Any page opened over `http://<LAN IP>` (section 3).

Edge follows Chromium's gating; its Linux build is unverified. Chrome ignores `powerPreference` on Windows and uses the iGPU on laptops. That is fine here, because the iGPU is the target.

## 3. Secure context, verified in Chrome
- `navigator.gpu` is `[SecureContext]` in the spec.
- Measured results:
  - **`http://<private LAN IP>:8765`: `isSecureContext` is false and `navigator.gpu` is undefined**, even with `--enable-unsafe-webgpu`.
  - `http://127.0.0.1` and `http://<cid>.ipfs.localhost:port` (the Kubo subdomain-gateway style) are secure and have `navigator.gpu`.
  - **`file://` is a secure context, but ES module scripts do not run there. External classic scripts do run.**
- Consequences:
  - "Local static server" must mean localhost on the same machine.
  - A second machine must load the game over https (amorf.us or a public gateway), serve its own copy on localhost, or use `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
  - Serving the dev server on the LAN over plain http will not work for WebGPU testing on another device.

## 4. Boot, detection and messages
**`index.html`** contains:
- A visible static `<div id="boot">` holding "Loading Amorfus…", plus a `<noscript>`.
- A hidden `<canvas>`.
- **`./boot.js`**, a classic script from `public/`, loaded before the module entry. It is an external file rather than inline so that a future CSP header on Workers stays possible. Check in R0 that Vite passes it through.

**`boot.js`** is ES2017, has no imports, and runs even on `file://`. In order:
1. `location.protocol === 'file:'` → **F**
2. `!isSecureContext` → **S**
3. `!('gpu' in navigator)` → **U**
4. Otherwise start a 20 s timer → **L**. The module entry cancels it with `window.__amorfusBooted = true`.

**Module `gpu-init.ts`** returns a typed result. The mapping from result to message is a pure function with unit tests.
1. Call `requestAdapter()` with the default core feature level. `null` → **A**.
2. If `adapter.info.isFallbackAdapter` is true, continue on the lowest tier and show banner **W**.
3. Call `requestDevice({ requiredFeatures: ['timestamp-query' if present] })`.
   - `TypeError` or `OperationError` → retry once with a fresh adapter, then **D** with `err.message`.
   - Also race `device.lost` for 1 s. The spec says an expired adapter can hand back an already-lost device.
4. Build all pipelines with `createRenderPipelineAsync` behind "Preparing shaders…". A failure → **D**.
5. **At runtime**, `device.lost`:
   - `reason === 'destroyed'` → ignore.
   - Otherwise show overlay **R**. Retry up to 3 times with backoff (0.5, 2 and 5 s): new adapter and device, then recreate pipelines, textures and pools, and **re-mesh loaded chunks near-first from CPU voxel data**. There is no need to keep CPU copies of meshes.
6. `device.onuncapturederror` → count and log errors and show the count in the debug HUD. Wrap init in `pushErrorScope('validation')` during development.

**Message texts.** `chrome://` URLs cannot be navigated to from a web page, so show them as copyable text.
- **F:** "Amorfus can't start from a file on disk. Serve this folder with a local web server (e.g. `npx serve dist`, then open http://localhost:3000) or open it through an IPFS gateway."
- **S:** "Your browser only allows GPU access on secure pages. This page was opened over plain http at *{host}*. Open it via https://amorf.us, an https IPFS gateway, or http://localhost on the machine serving it."
- **U:** "This browser doesn't support WebGPU, which Amorfus needs. Use a current Chrome or Edge on Windows, macOS or ChromeOS, or Chrome 144+ on Linux with an Intel (Gen12 or newer) GPU." Link: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- **A:** "WebGPU is present but no usable GPU was offered. Check: (1) chrome://settings/system → 'Use graphics acceleration when available' is on; (2) chrome://gpu shows 'WebGPU: Hardware accelerated'; (3) update your graphics driver. On Linux with AMD/NVIDIA-X11 GPUs and on Windows-on-ARM, WebGPU is still behind chrome://flags/#enable-unsafe-webgpu (at your own risk)." Same link as U.
- **W:** "Running on a software renderer — expect a low frame rate."
- **D:** "Couldn't initialise the GPU: {message}. Reload to retry; if it persists, update your graphics driver."
- **R:** "The GPU was reset (driver update, sleep/resume or a crash). Your world is saved. Reconnecting the renderer…" After 3 failures: "…couldn't reconnect. [Reload]".
- **L:** "Still loading… If this is an IPFS gateway, it may be slow to fetch the app; try another gateway or amorf.us."

Set `<meta name="referrer" content="no-referrer">` so external links do not leak the CID or world path.

## 5. Renderer design (MVP)
**Pipelines and passes.** Four pipelines, all opaque, in one render pass:
1. Terrain: smooth and sharp geometry in the **same** mesh and pipeline; sharp faces simply carry flat normals.
2. Sky: a fullscreen triangle drawn **after** terrain, depth test `greater-equal` against the far value.
3. Selection outline: a `line-list` pipeline; lines are 1 px, which WebGPU mandates.
4. Remote-player avatars: one instanced box or capsule, with ≤16 instances in a small storage buffer.

HUD, hotbar, crosshair, menus and name labels are DOM elements. Labels are placed by projecting their positions with CSS transforms.

**Depth and precision**
- Use `depth32float` with reversed Z (clear 0, compare `greater`, `mat4.perspectiveReverseZ`).
- **Camera-relative integer origins:**
  - A per-chunk `ChunkInfo { origin: vec3<i32>, texOrigin: vec3<i32> }` sits in a storage buffer indexed by `@builtin(instance_index)`.
  - A direct `drawIndexed` with `firstInstance = slot` is core WebGPU. WGSL's `instance_index` includes `firstInstance`.
  - The shader computes `vec3f(origin - camBlock) + local - camFrac`. Border vertices of neighbouring chunks then become bit-identical near the camera, so no hairline cracks. Plain f32 world positions lose exactness beyond about 2^13 blocks when there are 10 fractional bits.
  - Triplanar UVs use `(origin mod P) + local` with a positive modulo and P = 64 blocks, so UVs stay small.

**Vertex format: 20 B, stride multiple of 4**

| Field | Type | Bytes | Content |
|---|---|---|---|
| Position and AO | `uint16x4` | 8 | xyz chunk-local in 1/1024-block fixed point; w = AO(8) \| flags(8) |
| Normal | `snorm8x4` | 4 | normal xyz |
| Material weights | 2 × `unorm8x4` | 8 | **weights for 8 global material slots** |

- Linear interpolation of the weights is always consistent, so there are no material-ID interpolation artefacts. With 8 slots the MVP needs no per-chunk palette.
- Use `uint32` indices everywhere, for simplicity and because a pathological chunk of sharp cubes can exceed 65,535 vertices.

**Textures and materials**
- A `texture_2d_array` of 8 layers, 256² `rgba8unorm`, with full mips (about 2.8 MB).
- **Generated at startup by a WGSL compute pass** (FBM variants per material), then mips from our own downsample pass. Nothing is downloaded.
- Sampler: linear/linear/linear with `maxAnisotropy` 4 on Medium and 8 on High.
- Triplanar weights are `pow(abs(n), 4)` normalised. Skip any plane with weight < 0.03 and any material slot with weight < 1/255. That gives about 2–6 fetches per fragment in practice and 9 at worst.
- Biplanar mapping is a later optimisation.

**Lighting.** Colour = albedo × (sun: Lambert N·L × sunColor × lerp(1, AO, 0.5) + hemispheric ambient: mix(ground, sky, n.y·0.5+0.5) × AO), followed by exp² distance fog towards the horizon colour. Fog reaches about 95% at `viewDistance − 16`, which hides chunk pop-in at the edge. **No shadow maps in the MVP.**

**Colour output.** The canvas uses `getPreferredCanvasFormat()` with `viewFormats: [that format + '-srgb']`. Render into the sRGB view; the MSAA texture uses the same sRGB format and resolves into it. The spec forbids sRGB formats directly in the canvas configuration.

**MSAA.** Only sample counts 1 and 4 exist. Use a 4x colour and depth attachment with `storeOp: 'discard'` and `resolveTarget` set to the canvas view. It is tied to the quality tier (section 6).

**Buffers**
- Vertex and index pools are made of **pages of 64 MiB** (the default `maxBufferSize` is 256 MiB), managed by an O(1) offset allocator (TLSF-style, 256 B granularity).
- Add a page when occupancy passes 80%, during an idle frame.
- Group draws by page so each page is bound once.
- **Never create a buffer per chunk.**
- **Freed ranges can be reused at once when writing through `queue.writeBuffer`.** The spec captures the data at call time and applies the write on the queue timeline in order with earlier submits, so no fences are needed.

**Culling and submission.** Each frame:
1. JS frustum-cull the chunk AABBs (Gribb-Hartmann planes).
2. Sort the visible chunks front to back for early-Z.
3. Bind the pipeline, bind group, vertex buffer and index buffer once per page.
4. For each chunk: `drawIndexed(indexCount, 1, firstIndex, baseVertex, slot)`.

Do not use render bundles: the draw list changes whenever the camera turns. Do not use GPU or indirect culling: there is no multi-draw-indirect without the unsafe flag. Revisit both after the MVP.

**Profiling.** When the adapter has `timestamp-query`, put `timestampWrites` on each pass, resolve them into a ring of 3 `MAP_READ` buffers, and skip a frame's sample when the ring is busy. Chrome quantises timestamps to 100 µs, which is 0.6% of a 16.7 ms frame. The debug HUD shows FPS, CPU ms, GPU ms per pass, visible and total chunks, triangles, upload bytes per frame and pool occupancy.

## 6. Performance budget and quality ladder
Everything in this section is an **estimate** until R0 measures it. The reference machine is proposed as the owner's i7-1255U / Iris Xe laptop running Chrome for Windows.

**Geometry is not the bottleneck.**
- For a heightfield-like smooth surface at about 2 triangles per surface cell and about 1.5x roughness, a view radius R gives roughly 9.4·R² triangles before culling. That is about 240k at R = 160 and 620k at R = 256, and frustum culling roughly halves it.
- With 32³ render chunks, R = 160 means about 80 columns and 250–400 draws. R = 256 means about 200 columns and 600–1,000 draws. That is about 0.3–0.5 ms of CPU per frame by the measurement above.
- **16³ render chunks (>3,000 draws) would be unwise for any engine choice.**

**The real limits** are fragment cost and bandwidth at high DPR, and CPU generation and meshing while flying.

MSAA 4x bandwidth, worst case uncompressed: 32 B per pixel is 66 MB per full write at 1080p and 118 MB at 1440p. With depth reads, overdraw and the resolve that comes to roughly 8–12 GB/s at 1080p and 14–21 GB/s at 1440p at 60 fps. Iris Xe shares 51–83 GB/s with the CPU, and Gen12 colour compression helps. Estimated cost: +1–3 ms at 1080p and +2–5 ms at 1440p.

**GPU frame estimate on Iris Xe at 1080p, Medium:** terrain 4–7 ms, MSAA 1–3 ms, sky, lines and avatars <0.5 ms, for **6–10 ms** in total.

**CPU frame estimate:** input and physics 0.5 ms, upload drain ≤1.5 ms, cull, sort and encode ~0.5 ms, net and DOM ~1 ms, plus GC slack, for about 5–6 ms.

**Internal resolution cap.** Always cap the internal resolution rather than rendering at full `devicePixelRatio`. Rendering at full `devicePixelRatio` is the classic iGPU killer on 2.8K laptop panels (about 5 MP).

**Quality tiers**

| Tier | Max internal pixels | MSAA | View radius | Anisotropy |
|---|---|---|---|---|
| Low | 1.2 MP | off | 96 blocks | 1 |
| **Medium (default)** | 2.1 MP (1080p-equivalent) | 4x | **160 blocks** | 4 |
| High | 3.7 MP | 4x | 256 blocks | 8 |
| Ultra (post-MVP) | native DPR | 4x | 384 blocks | 8, plus a single-cascade 2048² shadow map |

**Automatic downgrade.** If p95 frame time exceeds 17.5 ms over 3 s, step down: MSAA off first, then render scale −15%, then view radius −32 blocks. Never upgrade automatically, to avoid oscillation.

## 7. Render loop, uploads, input and resize
**Loop.** Call `requestAnimationFrame(frame)` first, then:
1. Clamp dt to ≤100 ms.
2. Run a fixed-step simulation at 60 Hz with an accumulator, at most 5 steps.
3. Drain uploads.
4. Interpolate the camera.
5. Cull, encode and submit.
6. Collect profiler results.

**High-refresh panels.** On 120–144 Hz displays rAF fires at the panel rate. If the measured GPU p95 exceeds the refresh interval, render only every other rAF for a steady 60 fps. Also offer a manual "Frame cap: auto / 60 / uncapped" setting.

**Hidden tabs.** rAF pauses in hidden tabs, so **networking and position broadcast must not be driven by rAF**. Chrome's intensive timer throttling exempts pages that are using WebRTC.

**Upload scheduler.** This is a pure, unit-tested module.
- Mesh results come back from workers as transferred ArrayBuffers and go straight into `writeBuffer`, with no extra JS copy.
- **Priority lanes:** edits first, then near streaming, then far streaming.
- Per-frame caps: ≤2 MB and ≤1.5 ms of `writeBuffer` and swap work for the streaming lanes.
- **Edit remeshes ignore the cap and are applied as an atomic group.** An edit near a border remeshes 2–8 chunks. All of their new ranges are written and their `ChunkInfo` entries flipped in the same frame, and the old ranges are freed after the flip. A half-applied group would show a one-frame seam.
- Target edit latency: ≤3 frames, about 50 ms.
- For scale: a 32³ smooth chunk is about 70–140 KB of mesh, so 2 MB per frame means 15–25 chunks per frame.
- Chrome 144 made `writeBuffer` up to 2x faster. Mapped staging rings are only worth adding if profiling shows `writeBuffer` as a hotspot (Toji's guidance).

**Hitches.**
- Create all pipelines asynchronously before the first frame (Chrome compiles through DXC on D3D12).
- Never create or destroy GPU buffers during play.
- Generate textures once.

**Resize.**
- Use a `ResizeObserver` with `{ box: 'device-pixel-content-box' }`, falling back to `contentBoxSize × devicePixelRatio`.
- Scale down uniformly to the tier's pixel cap and clamp to `maxTextureDimension2D`.
- Set `canvas.width` and `canvas.height`; `getCurrentTexture()` follows automatically.
- Recreate the depth and MSAA textures lazily when the size changes.
- The CSS size stays 100%, so the compositor does the upscaling.

**Pointer lock.**
- A "Click to play" overlay calls `await canvas.requestPointerLock({ unadjustedMovement: true })`. On `NotSupportedError` (for example on Linux), fall back to `requestPointerLock()`.
- Always catch rejections. Re-locking straight after the user presses Esc fails, so show the pause menu on `pointerlockchange` and relock on the next click.
- Clamp or ignore outlier `movementX/Y` spikes on the first event after locking.
- If adding fullscreen, request the pointer lock **before** `requestFullscreen()`.
- Use `KeyboardEvent.code` so WASD is independent of keyboard layout.

**Keep the renderer on the main thread for the MVP.** `GPUDevice` is not serialisable to workers. Moving to an OffscreenCanvas renderer is a post-MVP option if main-thread jank appears.

## 8. Tests and the gate (rendering part of `npm run check`)
1. **Vitest unit tests on pure modules:** frustum planes and AABB test, sort order, offset allocator (alloc, free, coalesce, fuzzed invariants), upload scheduler (caps respected, edit groups atomic, priority order), vertex pack/unpack round-trip, resize maths, the quality-ladder hysteresis, and the capability-to-message mapping.
2. **WGSL compile gate in Node:** the `webgpu` npm package (Dawn for Node, 0.6.1) compiles every shader module and creates every pipeline with the real vertex layouts. Any compilation message of type error fails the check. This was verified on WSL2 Ubuntu 24.04 with Mesa 25.2.8 llvmpipe. CI needs `mesa-vulkan-drivers`.
3. **Playwright smoke test with SwiftShader.** Only the full flag set was reliable here: `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-webgpu-adapter=swiftshader`. With `--enable-unsafe-webgpu` alone, the adapter appeared but `mapAsync` failed with "A valid external Instance reference no longer exists". The test serves `dist/` under `/ipfs/bafy…/`, loads it, expects no console errors and a non-blank canvas, and checks that the HUD reports WebGPU.
4. **Playwright negative-path tests:**
   - No flags on a GPU-less runner gives a null adapter → message A (verified).
   - `--host-resolver-rules="MAP amorfus.test 127.0.0.1"` plus `http://amorfus.test` → message S (verified: not secure, no `navigator.gpu`).
   - `file://` → message F (verified that the classic script runs and the module does not).
   - A test hook that simulates a lost device with reason 'unknown' → overlay R, then recovery.
5. **Performance:** `npm run bench` flies a fixed camera path over a fixed seed and logs p50/p95 CPU and GPU times through timestamp queries. It is a **manual, logged check on the reference laptop**, because CI has no GPU. Say so rather than pretending CI gates it.

## 9. Suggested module layout
- `src/render/` holds:
  - `gpu-init.ts` and `boot-messages.ts`, which is pure
  - `device-lost.ts`, `renderer.ts` and `frame-graph.ts`
  - `pool.ts`, `upload-scheduler.ts`, `culling.ts`, `quality.ts` and `resize.ts`, all pure
  - `profiler.ts`, `textures/proc-textures.ts` and `textures/mipgen.ts`
  - `shaders/{terrain,sky,lines,avatar,proctex,mip}.wgsl`, imported with `?raw`
- `public/boot.js` holds the classic boot script.

## Hypothesis verdict

**The core hypothesis is right, and measurement now backs it.** Raw WebGPU with wgpu-matrix and hand-written WGSL beats three and Babylon on per-frame CPU cost on the target CPU class: 1.0 ms for 2,000 chunks, against 8.6–11.9 ms (three) and 22.8–23.5 ms (Babylon). It also wins on bundle size (about 10 KB gzipped against about 210 KB and about 317 KB) and on control over uploads and the no-WebGPU message. The elements that hold as proposed:
- One terrain pipeline.
- Procedural texture array with triplanar sampling.
- Per-vertex weights and AO.
- Sun, hemispheric ambient and fog.
- CPU frustum culling per chunk.
- Suballocated large buffers.
- DOM HUD.
- Optional MSAA.
- Timestamp-query profiling.

**Gaps and corrections:**
1. **Draw submission.** Draw with `firstInstance` = chunk slot, indexing a storage buffer, from shared pool pages. Per-chunk bind groups or vertex buffers cost about 4–5x as much CPU per draw.
2. **Precision.** The hypothesis leaves it out, yet seams depend on it. Use chunk-local fixed-point positions, integer origins and camera-relative reconstruction, with triplanar UVs taken modulo a period.
3. **Material weights.** Make them slot-based (8 global slots, one unorm8 weight each), not per-vertex material IDs, which cannot be interpolated.
4. **Resolution cap.** An internal pixel cap is mandatory. Rendering at full devicePixelRatio is likely to miss 60 fps on high-DPR iGPU laptops.
5. **MSAA.** It is 1x or 4x only, so tie it to a tier.
6. **Upload path.** Use `writeBuffer` rather than mapped staging. It is queue-ordered, so freed ranges can be reused without fences.
7. **Edit swaps.** Edits must swap every affected chunk mesh atomically in one frame, or a one-frame seam shows.
8. **Boot page.** The hypothesis leaves out the whole boot and secure-context story:
   - `navigator.gpu` does not exist over http on a LAN IP (verified).
   - Modules do not run from `file://` (verified).
   - So a static message plus a classic boot script is needed.
9. **Device-lost recovery.** It needs a re-mesh path.
10. **Platform coverage.** The hypothesis assumes it is uniform, and it is not. Linux with AMD, NVIDIA on X11 or older Intel, and Windows on ARM have no WebGPU by default as of Chrome 153.
11. **Shadows.** Leave shadow maps out of the MVP.
12. **Optional features.** Do not rely on multi-draw-indirect (not available) or immediates (Chrome 149-150+; missing from the Chrome 149 probe).

## Key decisions
- **Graphics layer** → Raw WebGPU, hand-written WGSL, wgpu-matrix 3.4.2 for maths, @webgpu/types for types
  - why: Measured on the target CPU class (i7-1255U), frame CPU time for 2,000 chunk meshes was 1.0 ms raw, 8.6-11.9 ms for three r185 and 22.8-23.5 ms for Babylon 9.27.1. Gzipped bundle size was about 10 KB, versus about 210 KB and about 317 KB. Raw WebGPU gives full control over suballocation, upload timing, atomic multi-chunk swaps and the no-WebGPU message.
  - rejected three.js WebGPURenderer: Per-object CPU overhead (three#30560 still open, high priority). Automatic WebGL2 fallback by default, which conflicts with the 'show a clear message' requirement unless a device is pre-created and passed in. Uploads happen inside render(). Heavy tree-shaken bundle. Kept as Plan B: pre-created device plus a single BatchedMesh.
  - rejected Babylon.js WebGPUEngine: Highest measured per-mesh CPU cost. Snapshot rendering is invalidated by constant chunk streaming and culling. Default URLs on cdn.babylonjs.com and assets.babylonjs.com are a hidden third-party runtime fetch on an IPFS or static site.
  - rejected webgpu-utils helper library: 33-40 KB gzipped just for generateMipmap or struct views; a mip generator is about 60 lines.
- **Draw submission model** → One terrain pipeline; shared 64 MiB vertex and index pool pages; each chunk is a direct drawIndexed with firstInstance = slot, indexing a ChunkInfo storage buffer; CPU frustum culling; front-to-back sort
  - why: Measured about 0.15-0.2 µs per draw with no state changes, against 0.8-1.0 µs with per-draw setVertexBuffer and setBindGroup. firstInstance on direct draws is core WebGPU, and WGSL instance_index includes it.
  - rejected Per-chunk GPUBuffers or bind groups: About 4-5x the CPU per draw, plus IPC and allocation churn when chunks stream.
  - rejected Render bundles: The visible set changes whenever the camera turns, so bundles would be rebuilt every frame.
  - rejected GPU-driven indirect culling / multi-draw-indirect: multi-draw-indirect is not in the spec and is flag-only in Chrome; without it the CPU still issues one call per chunk. Deferred past MVP.
- **Upload path** → queue.writeBuffer from transferred worker ArrayBuffers, with a per-frame budget of at most 2 MB and 1.5 ms for streaming; edit remeshes bypass the budget and are applied as an atomic group in one frame
  - why: Toji recommends writeBuffer as the default. Chrome 144 made it up to 2x faster. The spec orders it on the queue timeline, so freed ranges can be reused at once with no fences. Atomic groups prevent one-frame seams after an edit.
  - rejected mapAsync staging-buffer ring: More complexity (map lifecycles, pools) with no demonstrated benefit; revisit only if profiling shows writeBuffer as a hotspot.
- **Position precision and seams** → Chunk-local fixed-point (1/1024 block) uint16 positions; integer chunk origins in storage; camera-relative reconstruction in the shader; world-space triplanar UVs taken modulo 64 blocks
  - why: Border vertices of adjacent chunks come out bit-identical, with no cracks, anywhere in an unbounded procedural world. Plain f32 world coordinates lose sub-block exactness beyond about 8k blocks.
  - rejected f32 world-space positions: Precision loss far from the origin produces sparkle and cracks at chunk borders.
- **Material shading** → 8 global material slots, with per-vertex unorm8 weights for each slot; triplanar sampling of a procedurally generated 8-layer 256² texture_2d_array with mips; skip low-weight planes and slots
  - why: Linear interpolation of the weights is always consistent, with no ID-interpolation artefacts. Covers the at-least-4-materials requirement. Nothing is downloaded, which suits IPFS. About 2.8 MB of VRAM.
  - rejected Per-vertex material IDs: IDs cannot be interpolated across a triangle; working around it needs de-indexed geometry or the optional primitive-index feature.
  - rejected Procedural noise evaluated in the fragment shader: Too much ALU per fragment × planes × materials for an iGPU.
- **Depth** → depth32float with reversed Z (clear 0, compare 'greater')
  - why: Uniform precision across a 96-384 block view distance at little cost; wgpu-matrix provides perspectiveReverseZ.
- **Anti-aliasing and resolution** → Cap internal resolution per tier (Medium about 2.1 MP); MSAA 4x on Medium and above; automatic downgrade turns MSAA off first
  - why: High-DPR laptop panels (4-5 MP) dominate iGPU fill and bandwidth. WebGPU only allows sample counts 1 and 4. Estimated MSAA cost is 1-3 ms at 1080p.
  - rejected Render at full devicePixelRatio: Likely misses 60 fps on 2.8K iGPU laptops.
- **Shadows** → None in the MVP. Per-vertex AO plus hemispheric ambient plus sun plus fog; optional single-cascade shadow map on the Ultra tier later
  - why: A shadow pass re-renders the terrain and adds PCF cost on iGPU, estimated at 2-4 ms. AO plus hemispheric lighting gives most of the depth cue.
- **Boot and messaging** → Static HTML message shown by default, plus an external classic public/boot.js for the file:// / insecure / missing-API checks, plus a module gpu-init with typed results and pure message mapping; device-lost recovery that re-meshes from CPU voxel data
  - why: Verified that module scripts do not run from file:// while classic external scripts do. A missing bundle (slow gateway) or a missing API must never leave a blank page.
  - rejected Module-only checks: Blank page on file:// or when fetching the bundle fails.
  - rejected Inline boot script: Would break under a future strict CSP set by a Workers front end (peatyscot-style headers).
- **Renderer thread** → Main thread; generation and meshing in a worker pool
  - why: Pointer lock and input are simpler and GPUDevice cannot be shared with workers (not Serializable in the spec). OffscreenCanvas is a post-MVP option.
- **Rendering CI coverage** → Dawn-for-Node WGSL and pipeline compile check, plus Playwright SwiftShader smoke and negative-path tests, in npm run check; performance as a logged manual benchmark on the reference laptop
  - why: All three mechanisms were verified locally without a GPU. Performance cannot be gated honestly without a real GPU in CI.

## Facts
- [V] Chrome 153 reached stable on 8 Sep 2026; its only WebGPU item is a WGSL buffer_view language feature. — https://developer.chrome.com/release-notes/153
- [V] WebGPU is on by default in Chrome 113+ on macOS, Windows x64 and ChromeOS; on Linux only for Intel Gen12+ (Chrome 144) and NVIDIA driver ≥535.183.01 on Wayland (Chrome 147). Other Linux GPUs and Windows ARM64 need flags (wiki last updated 13 Aug 2026). — https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- [V] Chrome 144 began the Linux rollout with Intel Gen12+ (WebGPU on Vulkan, rest of Chromium on OpenGL) and made writeBuffer/writeTexture up to 2x faster. — https://developer.chrome.com/blog/new-in-webgpu-144
- [V] Chrome 147-148 extended Linux WebGPU to modern NVIDIA drivers on Wayland. — https://developer.chrome.com/blog/new-in-webgpu-147-148
- [V] On a Windows 11 ARM64 Snapdragon X Elite machine, Chrome 138 and Edge 138 needed the Unsafe WebGPU flag. — https://github.com/gpuweb/gpuweb/issues/5272
- [V] WebGPU compatibility mode (featureLevel 'compatibility') shipped on Android (OpenGL ES 3.1) in Chrome 146; ChromeOS/GLES and Windows/D3D11 are only 'being explored'. — https://developer.chrome.com/blog/new-in-webgpu-146
- [V] The NavigatorGPU.gpu attribute is marked [SecureContext]; requestAdapter returns Promise<GPUAdapter?> (it can resolve to null). — https://gpuweb.github.io/gpuweb/ (Editor's Draft, 23 Sep 2026, §4.1-4.2)
- [V] Measured in Chrome for Testing 149: http://<private LAN IP> and http://amorfus.test give isSecureContext=false and no navigator.gpu; http://127.0.0.1 and http://bafyfake.ipfs.localhost give a secure context with navigator.gpu. — Local Playwright test on this machine (proto/pw/run.mjs, site/probe2)
- [V] Measured: file:// is a secure context with navigator.gpu, but a <script type=module> does not execute, while an external classic <script src> does. — Local Playwright test (proto/pw/site/filetest)
- [V] Chrome's troubleshooting doc names the causes of a null adapter: graphics acceleration off, GPU blocklist (chrome://gpu), platforms needing #enable-unsafe-webgpu, Linux Vulkan flag. It also says powerPreference has no effect on Windows and laptops default to the iGPU, and that #unsafely-treat-insecure-origin-as-secure exists. — https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
- [V] requestDevice rejects with TypeError for unknown or unsupported features and OperationError for a consumed adapter or over-limit requests; an expired adapter yields a device that is already lost with reason 'unknown'. — https://gpuweb.github.io/gpuweb/ §4.3 GPUAdapter.requestDevice
- [V] Default limits: maxBufferSize 256 MiB, maxStorageBufferBindingSize 128 MiB, maxVertexBuffers 8, maxBindGroups 4, maxTextureArrayLayers 256, maxTextureDimension2D 8192; maxImmediateSize 64. — https://gpuweb.github.io/gpuweb/ §3.6.2 limits
- [V] Texture sampleCount and multisample.count must be 1 or 4. — https://gpuweb.github.io/gpuweb/ (texture creation, multisample state)
- [V] firstInstance must be 0 only for INDIRECT draws unless 'indirect-first-instance' is enabled; direct draws may use any firstInstance. WGSL instance_index equals firstInstance for the first instance. — https://gpuweb.github.io/gpuweb/ §GPURenderCommandsMixin; https://gpuweb.github.io/gpuweb/wgsl/ §13.3.1.1.6
- [V] The GPUFeatureName enum has no multi-draw-indirect; gpuweb#4349 (MDI investigation) is closed as not planned; Chrome's chromium-experimental-multi-draw-indirect requires the unsafe flag, and it was not listed even with --enable-unsafe-webgpu on SwiftShader in Chrome 149. — https://gpuweb.github.io/gpuweb/ ; https://github.com/gpuweb/gpuweb/issues/4349 ; https://developer.chrome.com/blog/new-in-webgpu-131 ; local probe
- [V] Canvas configuration cannot use sRGB formats; use the non-sRGB format with the sRGB format in viewFormats and create an sRGB view. — https://gpuweb.github.io/gpuweb/ §21.4 GPUCanvasConfiguration
- [V] queue.writeBuffer captures the data at call time and writes it on the Queue timeline, in order with submits. — https://gpuweb.github.io/gpuweb/ §GPUQueue.writeBuffer
- [V] GPUDevice is not Serializable in the spec IDL, so it cannot be shared with workers. — https://gpuweb.github.io/gpuweb/ (interface GPUDevice IDL)
- [V] Chrome quantises WebGPU timestamp queries to 100 µs (lifted by the WebGPU Developer Features flag). — https://developer.chrome.com/blog/new-in-webgpu-121
- [V] Immediates (setImmediates, var<immediate>) arrived in Chrome 149-150 and are feature-detected through the WGSL language feature immediate_address_space; Chrome 149.0.7827.55's wgslLanguageFeatures did not include it. — https://developer.chrome.com/blog/new-in-webgpu-149-150 ; local probe
- [V] three r185 WebGPURenderer falls back to WebGL2 automatically via getFallback; forceWebGL exists; passing parameters.device skips requestAdapter; backend.isWebGPUBackend identifies the backend; WebGPUBackend requests featureLevel 'compatibility' and forces samples = 0 in compatibility mode. — three r185.1 source, three.js package (src/renderers/webgpu/WebGPURenderer.js, WebGPUBackend.js, common/Renderer.js)
- (removed: private source)
- [V] The latest versions on npm are three 0.186.0 (2026-09-08), @babylonjs/core 9.27.1 (2026-09-18), wgpu-matrix 3.4.2 (2026-02-12), @webgpu/types 0.1.74, webgpu (Dawn for Node) 0.6.1 (2026-09-12) and playwright 1.63.0 (bundling Chromium 153.0.8010.12). — npm view (run locally); playwright-core/browsers.json
- [V] three#30560 (WebGPURenderer UBO system has severe performance issues with many render items) is open, labelled high priority, and last updated 2026-09-15. — https://github.com/mrdoob/three.js/issues/30560 (GitHub REST API)
- [V] Measured minimal Vite 8.1.3 bundles: three/webgpu 768 KB minified / about 207-210 KB gzipped; wgpu-matrix 39.6 KB / 9.9 KB; Babylon 9.27.1 WebGPU about 1.31 MB / about 317 KB across 48 files; webgpu-utils generateMipmap alone 173 KB / 33 KB. — Local builds in proto/threesize, rawsize, babsize
- [V] Measured median JS time per frame (i7-1255U, Chrome 149 headless, SwiftShader) for 500/2000 meshes: raw WebGPU 0.4/1.0 ms; three r185 2.4-3.8/8.6-11.9 ms; Babylon 9.27.1 6.3-6.6/22.8-23.5 ms. Raw draw encode was 0.3-0.4 ms per 2000 bare drawIndexed and 1.6-2.0 ms with per-draw setVertexBuffer plus setBindGroup. — Local benchmarks in proto/rawbench, threebench, babsize via proto/pw/run.mjs
- [V] Babylon's WebGPUEngine defaults glslang and twgsl to ${Tools._DefaultCdnUrl} (https://cdn.babylonjs.com) and loads them when GLSL shaders are used; Tools also references assets.babylonjs.com. — node_modules/@babylonjs/core/Engines/webgpuEngine.pure.js, Engines/WebGPU/webgpuTintWASM.js (9.27.1)
- [V] Headless Chrome 149 on a GPU-less Linux box: with no flags, navigator.gpu exists and requestAdapter() returns null; with --enable-unsafe-webgpu alone (or with Vulkan or angle=swiftshader), a SwiftShader adapter appears but mapAsync fails ('A valid external Instance reference no longer exists'); with --enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-webgpu-adapter=swiftshader, rendering, 4x MSAA and pixel readback work in both new headless and chrome-headless-shell. — Local Playwright probes (proto/pw)
- [V] Dawn for Node ('webgpu' 0.6.1) validates WGSL (getCompilationInfo errors) and renders with an MSAA resolve on Mesa 25.2.8 llvmpipe under WSL2 Ubuntu 24.04, with no GPU. — Local test proto/nodewgpu/t.mjs, t2.mjs; https://github.com/dawn-gpu/node-webgpu
- [V] requestPointerLock returns a Promise, accepts {unadjustedMovement}, needs transient activation, fails if re-requested right after the user exits the lock, and must be called before requestFullscreen. — https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock
- [unverified] unadjustedMovement is unsupported on Linux and rejects with NotSupportedError, so a plain lock is the fallback. — https://chromestatus.com/feature/5723553087356928 (via search summary)
- [V] The recommended canvas sizing uses ResizeObserver with the 'device-pixel-content-box' box and devicePixelContentBoxSize, falling back to contentBoxSize × devicePixelRatio, clamped to maxTextureDimension2D. — https://webgpufundamentals.org/webgpu/lessons/webgpu-resizing-the-canvas.html
- [V] requestAnimationFrame waits while a page is hidden; Chrome's intensive timer throttling does not apply when WebRTC is in use. — https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- [V] writeBuffer is the recommended default upload path; staging-buffer pools only after profiling shows a bottleneck. — https://toji.dev/webgpu-best-practices/buffer-uploads
- [V] On an M1 Mac, a naive WebGPU renderer managed about 8,000 separately-uniformed objects at 75 fps and about 15,000 after optimisation. — https://webgpufundamentals.org/webgpu/lessons/webgpu-optimization.html
- [V] This session's host is a 12th Gen Intel i7-1255U (10C/12T) running WSL2 with /dev/dxg and no /dev/dri; the i7-1255U's iGPU is Iris Xe with 96 EUs at up to 1.25 GHz. That it is the owner's laptop and has Windows Chrome with WebGPU on Iris Xe is inference. — lscpu (local); https://www.intel.com/content/www/us/en/products/sku/226259/intel-core-i71255u-processor-12m-cache-up-to-4-70-ghz/specifications.html
- [unverified] FP32 throughput: Iris Xe 96EU about 1.5-2.4 TFLOPS; Arc 140V about 4-4.2 TFLOPS; Radeon 780M about 4.1-4.3 TFLOPS. — https://nanoreview.net/en/gpu-compare/intel-iris-xe-graphics-g7-96eu-vs-intel-arc-140v ; https://nanoreview.net/en/gpu-compare/radeon-780m-vs-intel-arc-140v (secondary sources)
- [unverified] GPU-side estimates for Iris Xe at 1080p Medium (terrain 4-7 ms, MSAA 4x +1-3 ms, +2-5 ms at 1440p; about 9.4·R² triangles before culling for a smooth heightfield) are derived by arithmetic and not measured. — Inference; to be measured in Milestone R0
- [V] Edge's Enhanced Security mode disables the JS JIT; it is off by default, and in Balanced mode it applies to sites the user rarely visits. — https://support.microsoft.com/en-us/edge/enhance-your-security-on-the-web-with-microsoft-edge
- [unverified] Web pages cannot navigate to or link into chrome:// URLs, so they must be shown as copyable text. — Recollection of Chromium behaviour

## Risks
- (medium) The acceptance test's second machine has no default-on WebGPU: Linux with AMD, NVIDIA on X11 or pre-Gen12 Intel; Windows on ARM; a VM or remote desktop. | impact: The 'two browsers on different machines' acceptance fails even though the app behaves correctly (it shows message A). | mitigation: Name the acceptance machines up front (Windows x64 / macOS / ChromeOS / Linux Intel Gen12+). Document the flags in the README. Message A lists the causes.
- (high) The build is opened on a second machine over http://<LAN IP> (a local static server exposed on the LAN). | impact: navigator.gpu is undefined, which looks like 'Amorfus doesn't work'. | mitigation: Boot message S with instructions; README says to use https (amorf.us or a gateway) or localhost on each machine; a Playwright test covers message S.
- (medium) The GPU estimates are wrong: fragment or MSAA cost on Iris Xe at high DPR exceeds budget. | impact: Misses 60 fps at the default tier. | mitigation: Milestone R0 measures the real terrain shader on the reference laptop with timestamp queries before the renderer grows. Resolution cap and automatic downgrade. Biplanar mapping and fewer active planes as fallbacks.
- (medium) CPU meshing and generation throughput while flying at high view distance on a 15 W CPU. | impact: Holes at the edge of view; upload bursts. | mitigation: Upload budget plus priority lanes; fog hides the edge; view distance per tier; the benchmark flight path measures chunks per second.
- (medium) Hairline seams or sparkles between chunks. | impact: Violates the 'no visible seams' requirement. | mitigation: Camera-relative integer-origin positions; identical border vertices from the mesher (apron); atomic group swaps for edits; a unit test that border vertices are bit-identical.
- (medium) Raw WebGPU costs more development time than three. | impact: Slower milestones. | mitigation: Scope is only 4 pipelines; Plan B is three r186 with a pre-created device and a single BatchedMesh if R0/R1 overrun.
- (medium) The SwiftShader flag recipe changes or breaks in newer Chrome (it was verified on Chrome 149; Playwright 1.63 ships 153). | impact: The smoke test in the CI gate goes red or flaky. | mitigation: Pin the Playwright version; the smoke test asserts adapter.info.isFallbackAdapter and fails loudly; the Dawn-for-Node shader check is an independent layer.
- (medium) CI runners lack Mesa lavapipe for the Dawn-for-Node shader check. | impact: The check cannot run in CI. | mitigation: Install mesa-vulkan-drivers in the workflow; run locally in WSL2, where it was verified.
- (medium) Device loss (driver update, sleep/resume, TDR). | impact: Black screen and lost session. | mitigation: Overlay R plus up to 3 re-initialisations that re-mesh from CPU voxel data; the world is persisted locally.
- (low) Pipeline compilation hitches on first use (DXC on D3D12). | impact: First-frame stalls. | mitigation: Create all pipelines with createRenderPipelineAsync during boot, before the first frame.
- (low) Edge Enhanced Security (JIT disabled) on an unfamiliar site slows JS meshing and generation. | impact: Slow streaming and lower fps in Edge for some users. | mitigation: Automatic downgrade; mention in the README troubleshooting section.

## Requirement conflicts
- [major] 'Targets current desktop Chrome and Edge with WebGPU' + 'Two browsers on different machines can join the same world': As of Chrome 153 (Sep 2026), WebGPU is off by default on Linux except Intel Gen12+ and NVIDIA on Wayland, and on Windows ARM64. 'Current desktop Chrome' therefore does not guarantee WebGPU, and the acceptance test could fail on an ordinary machine. → The acceptance names a supported matrix: Windows x64, macOS, ChromeOS, Linux Intel Gen12+ / NVIDIA-Wayland. On anything else the app shows the clear no-adapter message, which satisfies the 'clear message' requirement.
- [major] 'Opening that folder over a local static server … works' + 'Two browsers on different machines': WebGPU needs a secure context. A second machine loading the local server by LAN IP over http gets no navigator.gpu (verified). → Define the local-server test as localhost on each machine. Run the two-machine test over https (amorf.us or a public IPFS gateway). Document chrome://flags/#unsafely-treat-insecure-origin-as-secure for development only.
- [minor] '60 fps on mid-range hardware (integrated GPU on a recent laptop) at a reasonable default view distance': Not testable as written: it names no reference device, no view distance and no resolution. High-DPR (4-5 MP) and 120/144 Hz laptop panels change the target a lot. → Reference machine: the i7-1255U Iris Xe laptop on Windows Chrome (proposed; to be confirmed by the owner). Default view radius 160 blocks, internal resolution capped at about 2.1 MP, pass criterion p95 frame ≤16.7 ms on a scripted flight path; on panels above 60 Hz, a steady 60 counts as passing.
- [minor] 'Rendering via WebGPU' + 'If WebGPU is unavailable, show a clear message' versus three.js: three's WebGPURenderer silently falls back to WebGL2 by default, so the message would never appear. → Use raw WebGPU (recommended). If three is ever used, pre-create the device, pass it in, and never construct the renderer without it.
- [minor] 'Edits reshape the smoothed surface immediately' + 'Terrain generation and smoothing must not stall the frame loop': Remeshing off the main thread adds 1-3 frames of latency; remeshing synchronously on the main thread risks frame spikes on a 15 W CPU. → Define 'immediately' as within 3 frames (about 50 ms). Use a dedicated high-priority meshing lane and swap every affected chunk mesh atomically in one frame.
- [minor] 'Automated tests for the non-rendering core' + the owner's build-blocking gate norm: Rendering, the largest risk, has no automated coverage required, and CI has no GPU, so a performance gate there would be dishonest. → Add a Dawn-for-Node WGSL/pipeline compile check and Playwright SwiftShader smoke and negative-path tests to npm run check. Keep performance as a logged manual benchmark on reference hardware, stated plainly.
- [minor] 'Build output is a single folder' + 'show a clear message instead of a blank page' (for someone opening index.html directly): ES modules do not run from file://, so a module-only app shows a blank page when index.html is double-clicked (verified). → Show a static HTML message by default, plus a classic public/boot.js that detects file:// and explains how to serve the folder.

## Third-party deps
- wgpu-matrix 3.4.2 (MIT) (Gregg Tavares (greggman), npm) build-time (bundled; runs locally at runtime): Matrix and vector maths (WebGPU clip space, perspectiveReverseZ) | sees: Nothing; pure code bundled into the site
- @webgpu/types 0.1.74 (gpuweb community, npm) build-time: TypeScript declarations for the WebGPU API | sees: Nothing
- Chrome / Edge WebGPU implementation (Dawn) (Google / Microsoft) runtime: Runtime GPU API | sees: The app's GPU commands locally; adapter info (vendor/architecture) is available to the page
- Playwright 1.63 + Chrome for Testing (Microsoft / Google) build-time (CI/test): Headless browser smoke and negative-path tests in npm run check (SwiftShader) | sees: The built site served locally
- webgpu (Dawn for Node) 0.6.1 (Dawn team (github.com/dawn-gpu/node-webgpu), npm) build-time (CI/test): Headless WGSL and pipeline compile check in the gate | sees: Shader source only
- Mesa lavapipe / llvmpipe (mesa-vulkan-drivers) (Mesa project via the Ubuntu package) build-time (CI/test): Software Vulkan driver for Dawn for Node in CI | sees: Shader and pipeline workloads
- github.com (gpuweb Implementation-Status wiki link in the error messages) (GitHub / W3C gpuweb) runtime (only if the user clicks): Help link shown when WebGPU is unavailable | sees: The user's IP and user agent on click; no Referer if the page sets <meta name=referrer content=no-referrer>

## Test ideas
- Vitest: extracting frustum planes from a known view-projection matrix and classifying AABBs (inside, outside, straddling at the near and far planes with reversed Z).
- Vitest: offset allocator property test with random alloc/free sequences: no overlaps, total free space conserved, full coalescing after freeing everything, and alignment respected.
- Vitest: upload scheduler: the streaming lane respects the 2 MB/frame cap, edit groups are never split across frames, priority order is edits > near > far, and old ranges are freed only after the flip.
- Vitest: 20 B vertex pack/unpack round-trip, and bit-identical reconstruction of shared border vertices across adjacent chunk origins, including at coordinates of ±1e6 blocks.
- Vitest: capability-to-message mapping for every tuple of (protocol, isSecureContext, hasGpu, adapter null, isFallbackAdapter, requestDevice error type, lost reason).
- Vitest: quality ladder hysteresis: a p95 above 17.5 ms for 3 s steps down in order MSAA → scale → view radius and never oscillates upward.
- Vitest: resize maths: DPR 1.25/1.5/2 on 1920×1200 and 2880×1800 panels respects the tier pixel cap and maxTextureDimension2D and preserves the aspect ratio.
- Dawn for Node in npm run check: compile every .wgsl module, create every pipeline with the production vertex layouts and bind group layouts, and fail on any compilation message of type error.
- Playwright (SwiftShader flags): serve dist under /ipfs/bafy…/ and assert the boot div is hidden, the HUD says WebGPU, there are no console errors, and the canvas screenshot has non-trivial pixel variance.
- Playwright, no GPU flags on a GPU-less runner: assert message A is visible (verified: null adapter).
- Playwright with --host-resolver-rules='MAP amorfus.test 127.0.0.1' over http://amorfus.test: assert message S (verified: no navigator.gpu).
- Playwright on file://…/dist/index.html: assert message F from the classic boot.js (verified: the module does not run).
- Playwright test hook that fires the device-lost handler with reason 'unknown': assert overlay R, re-initialisation, and that the chunk count returns to its previous value.
- Manual npm run bench on the reference laptop: scripted 60 s flight plus an edit burst; log p50/p95 CPU and GPU times per pass, chunks per second meshed, and upload MB per frame into a committed perf log.

## Milestone notes
Rendering order.

**R0 – Renderer spike and gate (about 3–4 days).** Build this first; it retires the GPU estimates.
- `gpu-init` with the full message flow, `boot.js`, resize with the pixel cap, reversed-Z depth, and pool pages with the offset allocator.
- One terrain pipeline drawing a synthetic smooth heightfield of N chunks through the `firstInstance` path.
- Timestamp HUD and the `npm run bench` flight path.
- Wire into `npm run check`: Vitest for the pure modules, the Dawn-for-Node WGSL check, and Playwright SwiftShader smoke plus negative tests (null adapter, insecure host, file://).
- **Exit criterion:** measured p95 on the reference laptop at 1080p with MSAA 4x at radius 160, and the tier defaults adjusted to match.

**R1 – Real terrain look.**
- Procedural texture array (compute pass) plus mip generation.
- Triplanar shading with 8 weight slots, per-vertex AO, sun, hemispheric ambient, fog and sky.
- Integration with streaming, the upload scheduler with priority lanes, pointer-lock camera, and a fixed-step loop.

**R2 – Editing visuals.**
- Atomic multi-chunk swap groups for edits.
- Selection outline; sharp blocks in the same pipeline.
- Seam unit tests (bit-identical border vertices).

**R3 – Multiplayer visuals.** Instanced avatars and DOM name labels.

**R4 – Robustness.**
- Quality ladder with automatic downgrade and the 120/144 Hz frame cap.
- Device-lost recovery by re-meshing, with a test hook.
- Software-adapter banner.

**Deferred past the MVP:**
- Shadow maps (Ultra tier), FXAA/TAA, and biplanar mapping.
- Water and transparency.
- GPU-driven indirect culling (needs `indirect-first-instance`; multi-draw-indirect is not available) and render bundles.
- Immediates (Chrome 149-150+).
- An OffscreenCanvas worker renderer.
- Golden-image tests through Dawn for Node.

## Open questions
- Reference hardware for the 60 fps criterion: is the i7-1255U / Iris Xe laptop this session runs on (inferred to be the owner's, under WSL2) the target, measured in Windows Chrome? WSL Chrome gets no adapter.
- Which two OS/GPU combinations will the two-machine acceptance test use? Are Linux-AMD and Windows-on-ARM explicitly out of scope, with the no-GPU message counting as correct behaviour there?
- Is capping internal render resolution on high-DPR panels acceptable by default, with native resolution only on High/Ultra?
- On 120/144 Hz laptop panels, does '60 fps' mean a steady 60 (frame-capped) or matching the refresh rate?
- Should browsers other than Chrome/Edge that now expose WebGPU (e.g. Safari 26, Firefox on Windows) be allowed through best-effort, or should the app warn? The recommendation is not to sniff the user agent and to let capability detection decide.
- Is the 8-material limit for the MVP (the requirement says at least 4) acceptable? More slots means 16 B of weights per vertex or a per-chunk palette.
- Render chunk size is owned by the data-model area: this analysis assumes 32³ render chunks to keep draws at or below about 1,000. Please confirm, or group smaller data chunks into 32³ render regions.