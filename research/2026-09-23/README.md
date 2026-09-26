# Research evidence, 2026-09-23

The evidence behind `PLAN.md`. Eight research passes ran in parallel on 2026-09-23/24, followed by a critic pass that reconciled them and an adversarial review of the plan. This folder keeps their reports and the small prototypes that produced the measured numbers. The prototypes are research code: they are not part of the build, the gate or `npm run check`.

**Sanitised for this public repo.** Local paths were rewritten to `research/2026-09-23/proto/…` (or `proto/…`, relative to this folder), the owner's name was removed and a LAN IP masked. Private sibling material was removed from this public copy. Line numbers are unchanged, so cross-references such as `world.md:354` still resolve; a removed line reads "(removed: private source)" or "(removed from the public copy: refers to private owner material)".

## reports/

- `smoothing.md`: smooth-voxel meshing (Surface Nets plus relaxation, thin-feature guard, seams, tunnels), measured on the prototype.
- `rendering.md`: raw WebGPU compared with three.js and Babylon, secure-context and headless-WebGPU probes, and GPU budgets.
- `p2p.md`: browser P2P signalling (Trystero over Nostr or torrent trackers), relay/STUN/TURN probes, and why libp2p was rejected.
- `sync.md`: world-state sync (per-cell LWW compared with Yjs, Loro and Automerge), and how deterministic `Math` and noise are across V8 versions.
- `persistence.md`: IndexedDB saves, origin classes on gateways, and export and snapshot sizes.
- `build.md`: the Vite 8 build, the relative-URL `dist` audit, IPFS/CID publishing and Cloudflare static assets.
- `world.md`: chunk size, generation and meshing throughput, the worker pool and the draw budget.
- `independent.md`: a blind end-to-end plan, drafted without the other passes.
- `critique.md`: the critic pass (traceability, conflicts between passes, what to re-measure).
- `plan-review.md`: the adversarial review of `PLAN.md`, through eight lenses from requirements to feasibility.

## proto/ (what backs which numbers)

- Smoothing mesher: `sn.mjs` (the reference mesher) and `fast.mjs` (the optimised one). Also `eval*.mjs`, `final.mjs`, `seam.mjs`, `invariants.mjs`, `inv2.mjs`, `tunnel.mjs`, `ambig.mjs`, `scenarios.mjs`, `quality.mjs`, `bench.mjs` and `bench2.mjs`. These produced 0/821 seam mismatches, 0 watertight violations, tunnel clearance and per-chunk cost.
- CRDTs and determinism: `crdt/`. Library benchmarks (`bench*.mjs`), the `Math.pow` drift (`mathdiff.mjs`, `powdump.mjs`), the noise golden hash (`gold.mjs`), the LWW fast-check property (`prop.mjs`) and edit encoding (`enc.mjs`). The small entry files are esbuild bundle-size inputs.
- World throughput: `bench/`. The mesher core, generation, the worker pool (`par.mjs`), `postMessage` cost (`msg.mjs`), shape checks and `table.py`.
- Save and export sizes: `sizeest*.mjs`.
- P2P: `tp/`. Bundle-size entries (`e-*.mjs`), relay probes (`probe.mjs`, `rt*.mjs`, `pick.mjs`), two- and four-peer joins in Chromium (`bt*.mjs` with `web/` and `web2/`), a local ws-relay (`relay-server.mjs`, `peer.mjs`) and a TURN probe (`turnprobe.mjs`). Also `stun.py`, `turn.py`, and the bundle-size entries `lp/` (js-libp2p) and `trb/` (Trystero).
- Build and IPFS: `vt/`. A Vite fixture app, `audit-dist.mjs`, headless render probes (`render*.mjs`), gateway, service-worker and CSP probes (`probe*.mjs`), prefixed/CSP static servers and `wrangler.jsonc`. `ts7/` is the TypeScript 7 typecheck fixture.
- Headless WebGPU and renderer cost: `pw/` (a Playwright runner plus `file://` and secure-context probe pages) and `nodewgpu/` (Dawn for Node). Frame-time benchmarks: `rawbench/`, `threebench/`, `babsize/`. Bundle sizes: `rawsize/`, `threesize/`, `babsize/`, `th/entry.js`.
- Review re-runs: `review-fidelity/` (the mesher with per-axis air limits, and quantised hints) and `review-gate/` (BroadcastChannel, Web Locks and pointer-lock behaviour in Playwright). `review-fidelity/slopecheck.mjs` was added on 2026-09-24. It measures hand-built slope terracing with no clearance caps, with the research 0.2 cap and with the plan's D-3 caps, and backs the corrected C-7 numbers.
- Viewer: `viewer/amorfus-smoothing-bench.html` is an interactive three.js (WebGL) page that runs `sn_axis.mjs` on the plan's test scenes. It needs an http server, because module scripts don't run from `file://`: `npx serve viewer`. It is an early form of the plan's M3 smoothing gallery.

## Running them

Everything ran on Node 22 (22.22.1). The top-level `*.mjs` files use only Node built-ins: `node seam.mjs`. The subfolders need npm packages that were installed ad hoc during the research. Their `package.json` files record caret ranges, and there are no lockfiles, so versions are **not pinned** and a fresh `npm install` may resolve newer releases. Some steps need a manual setup:

- Playwright scripts need a Chromium: `npx playwright install chromium`.
- `review-gate/` imports Playwright from `../vt/node_modules`.
- `tp/bt*.mjs` serve `web*/app.js` and `mesh.js`, which are esbuild bundles of the matching `.mjs` files. Rebuild them with `npx esbuild --bundle --format=esm`.
- `pw/run.mjs` serves `pw/site/{raw,three,bab}/`, which are the `vite build` outputs of `rawbench/`, `threebench/` and `babsize/`.
- `vt/` and `ts7/` expect binary fixtures in `src/assets/` (`data.bin`, `tex.png`, `lazytex.png` and `mod.wasm`, which is a WASM header). Any placeholder files of those names will do.
- `sizeest3.mjs` is a stub whose imported helper was not kept, so it will not run.

Live-service observations are a dated snapshot from 2026-09-23 on one machine. That covers relay and TURN reachability, gateway behaviour and npm versions, and it will drift.

## Not included

- `node_modules/`, lockfiles, `dist/` and other build outputs, esbuild bundles (`out*.js`, `app.js`, `mesh.js`, `o.js`, `b.js`, `w.min.js`) and minified bundles of third-party libraries (`wu_*.js`, from webgpu-utils).
- Binary files: `.car` files, `*.bin` float dumps, image, WASM and data fixtures, and packed tarballs.
- Third-party material: the NoCubes Java sources, the fdlibm-derived `ieee754.cc`, library READMEs and package extracts (Trystero, PeerJS, three, Vite, verified-fetch, pypdf), the Kubo config doc, the Gibson and HLC paper texts, MDN/BCD JSON, spec copies (WebGPU, WGSL, ECMA-262, WebRTC, IndexedDB), blog posts and other downloaded HTML or text dumps, and the service-worker-gateway clones.
- Local state: logs, the Kubo repo (which holds node keys), Wrangler/Miniflare state and a pid file.
- `research/critique.json`, the machine-readable twin of `critique.md`. Also `build_copy.md`, a duplicate of `build.md`, and the empty placeholders `t.mjs` and `t.wgsl`.
