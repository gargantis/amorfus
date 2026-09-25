# build: Build tooling, IPFS publishing, Helia loaders, amorf.us deploy, check gate

## Recommendation

## Evidence base (what was read vs. inferred)

**Owner repos read:**
- Private owner material (not described here).
- `peatyscot/peatyscot/{wrangler.jsonc,package.json}`: Worker in front via `run_worker_first`; `deploy = check && wrangler deploy`, run locally.
- `nytime5/nytime5/wrangler.jsonc`; private owner material (not described here).
- `bitsy-services/wiki/.github/workflows/check.yml`: CI runs the same gate as the local hook.
- `uniteum/docs/.github/workflows/deploy.yml`: deploys from GitHub Actions via wrangler-action.
- Private owner material (not described here).
- No source read defines "Helia-based loader"; that term's meaning is an open question.

**Experiments run for this report** (prototypes in `research/2026-09-23/proto/`):
- `vt/`: a Vite 8.3.0 app exercising every URL-emitting feature. Its outputs were served and loaded in headless Chromium 153 through five hosts:
  - a static server at `/`
  - the same server under `/ipfs/<cid>/` (`serve-prefixed.mjs`)
  - a real kubo 0.43.1 offline gateway, path form and subdomain form
  - the real IPFS Service Worker Gateway 3.4.15, cloned to `swg/` and backed by local kubo
- Also in `vt/`: CID comparisons between ipfs-car and kubo, a wrangler 4.137 dry-run and `wrangler dev`, headless WebGPU flag probes (`render*.mjs`), a Filebase-CSP emulation, and a working dist-audit prototype (`audit-dist.mjs`).
- Everything marked "verified" below came from these experiments or from a primary source fetched this session. Items marked "inference" were not.

## 1. Toolchain (versions checked against the npm registry, 2026-09-23)

| Tool | Version | Why |
|---|---|---|
| Node | `>=22.12` (`engines`), `.nvmrc` = 22 | Vite 8 engines `^20.19 \|\| >=22.12`. Local is 22.22.1. |
| vite | `^8.3.0` | Released 2026-09-10. Bundles Rolldown 1.1.x as its only bundler. 8.0 went stable 2026-03-12. |
| typescript | `^7.0.2`, typecheck only (`tsc --noEmit`) | Native port, still ships `tsc`. Verified: typechecks `vite/client` and `@webgpu/types` in 0.35 s and reports errors correctly. TypeScript 6.0.3 is an equally valid choice (see decisions). |
| vitest | `^4.1.11` | Peer range covers Vite 8. 5.0.1 exists (2026-09-15); move later. |
| @playwright/test | `1.63.0` (exact) | Chromium headless shell 153.0.8010.12. |
| ipfs-car | `3.1.0` (exact) | Pure JS, 512 KB. Its CID equals kubo's `unixfs-v1-2025` profile (verified). |
| kubo | `0.43.1` via `npx -y kubo@0.43.1`, only in release scripts, not a dependency | The npm package is 120 MB and downloads a binary from GitHub releases at postinstall. Keeping it out of `npm install` keeps the acceptance command light. |
| wrangler | `^4.137.0` devDependency | `$schema: node_modules/wrangler/config-schema.json` convention. |
| acorn, acorn-walk, parse5 | `^8` / `^8` / `^7` | Parsers for the dist audit. |
| @webgpu/types | `^0.1.74` | |

**Keep Vite; don't use esbuild or Rolldown directly.**
- esbuild still has no worker bundling and no `new URL(...)` asset bundling. GitHub issues #312 and #795 are both open.
- Raw Rolldown would mean re-implementing the HTML entry, CSS `url()` rewriting, worker sub-builds and the dev server.
- Vite 8 already *is* Rolldown underneath.

## 2. `vite.config.ts` (every line below was verified in the experiment)

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: './',                 // every emitted URL is relative to the file that contains it
  worker: { format: 'es' },   // REQUIRED. Vite 8.3 default is 'iife', which inlines worker dynamic imports
  build: {
    target: 'esnext',
    outDir: 'dist', emptyOutDir: true,
    sourcemap: false,         // three/webgpu's map alone is 4.8 MB; keep the pinned DAG small
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

**What Vite 8.3.0 emitted with `base: './'` (verified in `dist/`):**
- HTML: `<script src="./assets/index-*.js">`, `<link rel="modulepreload" href="./assets/vendor-*.js">`, `<link rel="stylesheet" href="./assets/*.css">`.
- A root-absolute `href="/favicon.svg"` pointing at a `public/` file was rewritten to `./favicon.svg`.
- CSS `url(./tex-*.png)`, relative to the CSS file.
- Dynamic chunks: `import('./lazy-*.js')`. The preload helper resolves dependencies with `new URL(dep, import.meta.url)`.
- Worker: `new Worker(new URL('mesher-*.js', import.meta.url), {type:'module'})`. The worker's own `import('./worker-lazy-*.js')` and its `new URL('../x.wasm', import.meta.url)` are also relative.
- `?raw` WGSL becomes an inline string constant: no fetch at all, so `.wgsl` MIME types never matter.
- Build output never contained a root-absolute URL.

**What Vite does NOT fix:**
- Hand-written string literals survive untouched. `fetch("/data/level.json")` reached `dist` unchanged, and the audit below catches it.
- `import.meta.env.BASE_URL` is `'./'`. Inside a worker that resolves against the worker's own URL, so never build URLs from it.

## 3. Source rules (each is enforced by the audit or the e2e test)

- **Asset URLs:** only through the module graph.
  - `import url from './x.bin?url'`, or `new URL('./x.bin', import.meta.url)` written literally at the use site.
  - Shaders use `?raw`.
  - Never a leading `/`, never `location.pathname` string surgery, never `BASE_URL`.
- **Workers:** `new Worker(new URL('./workers/mesher.worker.ts', import.meta.url), { type: 'module' })`, with the `new URL` literal inside the constructor. Never `?worker&inline` or blob workers: `import.meta.url` inside them is `blob:`.
- **`public/`:** holds only `_headers`. No other root-referenced files.
- **Routing:** no service worker and no History API.
  - State lives in the fragment only. Write it with `location.replace('#…')` or `location.hash = …`; read it on `hashchange`.
  - Invite link = `location.href.split('#')[0] + '#join=…'`. On `/ipfs/<cid>/` this pins the invitee to the identical build, and the fragment never reaches gateway logs.
- **Storage names:** prefix with `amorfus-`, and never clear all Cache Storage or IndexedDB. The Service Worker Gateway keeps `/@helia/service-worker-gateway/blocks` (IndexedDB) and `immutable-cache-v*` caches on the *same origin* as the app (verified in its source).
- **Detecting WebGPU:**
  - Use `const a = await navigator.gpu?.requestAdapter(); if (!a) fallback()`. Also handle a `requestDevice` rejection and `device.lost`.
  - `'gpu' in navigator` is not enough: headless Chromium exposes `navigator.gpu` but returns a null adapter (verified).
  - The "WebGPU unavailable / failed to load" message must be **static HTML visible by default**. `main.ts` hides it once the app boots. Then a loader that serves JS with the wrong MIME type still shows a message rather than a blank page.
  - No inline scripts: CSP-restricted gateways block them. Vite emits none (the modulepreload polyfill lives inside the entry chunk).
- **No WASM on the critical path.** Under Filebase's gateway CSP, `WebAssembly.compile` throws (verified). If WASM is ever added, keep a JS fallback.

## 4. The gate: `npm run check`

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -p tsconfig.json && vite build && node scripts/audit-dist.mjs dist",
  "test": "vitest run",
  "e2e": "playwright test",
  "check": "npm test && npm run build && npm run e2e",
  "cid": "node scripts/cid.mjs dist",
  "check:release": "npm run check && node scripts/kubo-gateway-smoke.mjs",
  "publish:ipfs": "npm run check:release && node scripts/publish-ipfs.mjs",
  "deploy": "npm run check && wrangler deploy",
  "verify:live": "node scripts/verify-live.mjs"
}
```

The audit runs *inside* `build`, following peatyscot, whose build runs validate. That way `npm install && npm run build` can never produce a folder that breaks under a subpath. Playwright browsers are installed separately with `npx playwright install --only-shell chromium` (~261 MB), so `npm install` stays small.

### `scripts/audit-dist.mjs`
A prototype is at `research/2026-09-23/proto/vt/audit-dist.mjs`. It caught the planted `/data/level.json`. Against a real three.js 0.185.1 WebGPU bundle (769 kB) its only other hit was the XHTML namespace URI, which is handled by an allowlist entry.

Rules:
1. **HTML** (parse5): every `src`/`href`/`poster`/`data` attribute must not start with `/` or `//` and must resolve to an existing file under `dist`. No `<base>` element.
2. **CSS:** every `url()` and `@import` follows the same rule.
3. **JS** (acorn AST):
   - Import specifiers and `new URL('<lit>', import.meta.url)` must resolve to existing files relative to the chunk.
   - Any string or template literal that starts with `/` and ends in an asset extension fails.
   - Any `http(s)://` or `ws(s)://` literal must name a host listed in `third-party.json` (see below).
   - `history.pushState`/`replaceState` and `navigator.serviceWorker.register` fail.
4. **Files:**
   - Extension must be in a MIME-safe allowlist: html, js, css, wasm, json, svg, png, webp, ico, txt, map, bin, webmanifest. No extensionless, `.ts` or `.wgsl` files.
   - No `_redirects`: IPFS subdomain and DNSLink gateways interpret it, and so does Cloudflare.
   - No file named `ipfs-sw-*`: that prefix is reserved by the Service Worker Gateway.
   - Every file ≤ 25 MiB (Cloudflare limit), plus a total-size budget.
5. **Secrets:** a regex scan for API keys and tokens, and JWT-shaped strings.

**`third-party.json`** lists every external host, with its purpose and kind (e.g. `signaling`, `stun`, `namespace-identifier-never-fetched`). It is the machine-checked version of the requirement that every third-party dependency be named. It also generates the amorf.us `connect-src` CSP and the README's dependency table.

### Playwright e2e (`e2e/`, run against `dist`)

**Server.** `e2e/serve-gateway.mjs` behaves like a gateway: strict MIME types, `X-Content-Type-Options: nosniff`, 301 to add a missing trailing slash, and a plain 404 for anything missing (no fallback). It mounts `dist` four ways:
- (a) at `/`
- (b) at `/ipfs/<CID>/`, using the real CID from `ipfs-car`. The test navigates without the trailing slash to exercise the 301.
- (c) on the subdomain host `http://<CID>.ipfs.localhost:<port>/`. Chrome resolves `*.localhost` to loopback (verified).
- (d) a variant sending Filebase's CSP: `default-src 'self'; img-src * data: blob: 'unsafe-inline'; style-src * 'unsafe-inline';`

**Browser projects:**
- `webgpu`: launch args `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader`. That is the combination found to make the WebGPU canvas work without a GPU.
- `no-webgpu`: an init script sets `navigator.gpu` to `undefined`.
- `no-adapter`: an init script stubs `requestAdapter` to resolve `null`.

**Assertions:**
1. No failed requests, no response ≥ 400, no `pageerror`, no `console.error`. Listeners attach to the whole browser context so worker requests are included.
2. **Every request URL starts with the mount's base URL, or its host is in `third-party.json`.** This is the runtime check that the static audit cannot do for URLs computed at runtime.
3. `webgpu`: `<html data-state="running">` within 20 s, then ≥ 60 frames without `device.lost`.
   - Pixels are checked through a test hook that renders to an *offscreen texture* and reads it back (works headless).
   - Canvas screenshots and 2D `drawImage` readbacks come back blank headless (verified), so never use them.
   - Load a small test world via a `#test=smoke` fragment so SwiftShader stays fast.
4. `no-webgpu` and `no-adapter`: the fallback message is visible with the specific reason.
5. CSP mount: single-player boots; the multiplayer UI reports "network blocked by this host" (triggered by the `securitypolicyviolation` event).
6. Fragment: `#join=TEST` is parsed, and the page path never changes.
7. A world saved to IndexedDB survives a reload.

**Why this replaces the hypothesis's "canvas OR message appears":** that assertion passes on a blank canvas, and whether the adapter exists depends on the machine. The three projects make both code paths deterministic everywhere.

### `check:release` (before any publish)
- `scripts/kubo-gateway-smoke.mjs`:
  - start `npx -y kubo@0.43.1` offline in a temp `IPFS_PATH` with `config profile apply unixfs-v1-2025`
  - `ipfs dag import` the CAR, and assert kubo's CID equals ipfs-car's
  - rerun the e2e spec against `http://127.0.0.1:<p>/ipfs/<cid>` and `http://<cid>.ipfs.localhost:<p>/`
  - All of this was verified working.
- **Service Worker Gateway check** (optional, weekly CI job or pre-milestone): clone `ipfs/service-worker-gateway` at a pinned tag, build with `NODE_ENV=development` (its config then points at kubo on 127.0.0.1:8088), import the CAR, and rerun the spec.
  - Verified at 3.4.15: every JS chunk, including the module worker's nested import, was served by the service worker as `text/javascript`, and `WebAssembly.compileStreaming` worked.
  - It is too heavy for every commit: 2,525 packages and about 2 minutes to install.

## 5. Publishing to IPFS

- **CID:**
  - `ipfs-car pack dist --output amorfus.car`, then `ipfs-car roots` gives the root CID. This is byte-identical to kubo 0.43.1 with the IPIP-0499 `unixfs-v1-2025` profile (CIDv1, raw leaves, 1 MiB chunks, 1024 links).
  - **Do not use `ipfs add -r --cid-version=1` with kubo defaults.** It uses 256 KiB chunks and produced a *different* CID as soon as one file exceeded 256 KiB. The three/webgpu bundle is 769 kB, so this bites from day one.
  - Three clean builds gave identical CIDs (same machine). CI prints the CID so cross-machine drift is visible.
- **Pinning:**
  - Primary: Filebase. Free tier is 5 GB, 500 pins, 10 GB egress. Upload with `aws --endpoint https://s3.filebase.com s3 cp amorfus.car s3://$BUCKET/ --metadata import=car`, which preserves the root CID.
  - Credentials come from environment variables or the OS keychain, never the repo. The script checks that the CID Filebase reports equals the local CID. (The exact response header is not verified.)
  - Optional second pin: the owner's own kubo node (`ipfs dag import` + `ipfs routing provide`).
  - **Not recommended:**
    - Pinata: CAR upload requires a paid plan. Its free folder upload computes its own CID.
    - Storacha / web3.storage: storacha.network and docs.storacha.network 301 to fil.one, which is plain S3 storage, and the console and upload hosts did not respond on 2026-09-23.
    - 4EVERLAND: its free tier is unverified.
- **Post-publish verification** (`verify-live.mjs`):
  - `delegated-ipfs.dev/routing/v1/providers/<cid>` returns ≥ 1 provider.
  - `trustless-gateway.link/ipfs/<cid>?format=raw` returns the root block.
  - Then print the manual-check URLs: `https://<cid>.ipfs.dweb.link/`, `https://inbrowser.link/ipfs/<cid>/`, `https://ipfs.io/ipfs/<cid>/`.
  - These are checked by hand in a real browser because ipfs.io and dweb.link serve Cloudflare Turnstile challenges to automated clients (verified).

## 6. amorf.us

**`wrangler.jsonc`** (validated with a wrangler 4.137.0 dry run):
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "amorfus",
  "compatibility_date": "2026-09-23",
  // Assets-only: no "main", so no Worker script ever runs (the "no server-side code" requirement).
  // Unmatched paths get a plain 404, the same as an IPFS gateway. Never "single-page-application".
  "assets": { "directory": "./dist", "html_handling": "auto-trailing-slash", "not_found_handling": "none" },
  "routes": [{ "pattern": "amorf.us", "custom_domain": true }]
}
```

- **No Worker script.** No `main`, no `run_worker_first`, no binding. Matching assets are served without invoking any Worker code, and static-asset requests are free and unlimited.
  - Copying peatyscot's Worker-in-front pattern would add server-side code.
  - If `www` is wanted, redirect it with a Cloudflare Redirect Rule (zone configuration, not code).
- **`not_found_handling: "none"`, not the owner's `404-page` convention.**
  - `"404-page"` needs a 404.html whose links can't be relative when it is served at arbitrary depth.
  - `"single-page-application"` returns index.html with a 200 for a missing chunk, which turns into MIME errors and hides broken references.
  - `wrangler dev` confirmed: 404 for unmatched paths, `/index.html` 307-redirects to `/`, `.wasm` is served as `application/wasm`, `.js` as `text/javascript`.
- **`public/_headers`:**
  - `/assets/*` gets `Cache-Control: public, max-age=31536000, immutable` (the default is `max-age=0, must-revalidate`).
  - `/*` gets a CSP generated from `third-party.json` (`default-src 'self'; script-src 'self'; connect-src 'self' <named signaling hosts>; img-src 'self' data: blob:`), plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.
  - **No COOP/COEP.** The app must behave the same as on gateways, where `SharedArrayBuffer` is undefined (verified on the kubo gateway, the SW gateway and localhost). Use transferable ArrayBuffers.
  - `_headers` in the pinned folder is harmless on IPFS (inference: no gateway interprets it).
- **No tracking:** make sure Cloudflare Web Analytics / RUM automatic injection is off for the zone; Cloudflare can inject a beacon into HTML on proxied hostnames. `verify-live.mjs` compares the sha256 of `https://amorf.us/` with `dist/index.html`, which catches any edge injection.
- **DNSLink:** set `_dnslink.amorf.us TXT "dnslink=/ipfs/<cid>"` at publish, using a Cloudflare DNS token from the environment.
  - This gives IPFS users a **stable origin across releases**: `https://amorf-us.ipns.dweb.link/`, `https://inbrowser.link/ipns/amorf.us`. Saved worlds survive upgrades there. Every `<cid>.ipfs.*` origin is new per release.
  - Don't use Cloudflare's Web3 DNSLink gateway: it is usage-billed, and it would compete with the Workers custom domain for the same hostname (inference).
- **Deploys:** local `npm run deploy` (peatyscot pattern). A GitHub Actions deploy with the uniteum/docs `CLOUDFLARE_API_TOKEN` secret is the alternative; owner's choice.

## 7. CI

Add `.github/workflows/check.yml`, mirroring bitsy-services/wiki. On push to main and on PRs:
- `actions/checkout@v4`
- `actions/setup-node` with `node-version-file: .nvmrc` and the npm cache
- `npm ci`
- `npx playwright install --with-deps --only-shell chromium`
- `npm run check`

There are no secrets in CI. Whether GitHub-hosted runners provide a SwiftShader adapter is **unverified**, and public reports are mixed. Test it in M0. If they don't, the owner decides (open question): either the `webgpu` project runs locally only (local `npm run check` stays the definition of done), or CI uses a GPU runner. Never "skip when there is no adapter": that makes the test vacuous.

## 8. Layout

```
index.html                  # static fallback message visible by default
vite.config.ts  tsconfig.json  playwright.config.ts  wrangler.jsonc  .nvmrc  third-party.json
public/_headers
src/main.ts  src/boot/webgpu-probe.ts
src/core/**  (pure TS, no DOM; *.test.ts next to the code, vitest in the node environment)
src/render/**  src/net/**  src/ui/**  src/workers/*.worker.ts  src/shaders/*.wgsl
e2e/smoke.spec.ts  e2e/serve-gateway.mjs
scripts/audit-dist.mjs  scripts/cid.mjs  scripts/kubo-gateway-smoke.mjs  scripts/publish-ipfs.mjs  scripts/verify-live.mjs
.github/workflows/check.yml
```

## 9. What the gate cannot prove
- 60 fps on an integrated GPU.
- Two machines on different networks connecting.
- Loading through public gateways (bot challenges).

These go on a manual acceptance checklist in the README, run against the published CID and amorf.us.

## Hypothesis verdict

Mostly right, with six corrections and three additions.

**Correct as stated:**
- Vite + TypeScript with `base: './'` and `target: 'esnext'`: every Vite-emitted URL came out relative in 8.3.0, including modulepreload links, the preload helper, CSS `url()`, dynamic chunks, the module worker and the worker's nested import.
- `?raw` WGSL: it becomes an inline string, so `.wgsl` MIME types never matter.
- No service worker: stronger reason than stated. The Helia Service Worker Gateway registers a root-scoped SW on the app's own origin, and an app SW would displace it.
- Fragment-only state.
- Vitest.
- Transferable ArrayBuffers instead of SharedArrayBuffer: confirmed. `crossOriginIsolated` is false and `SharedArrayBuffer` is undefined on a local static server, on the kubo gateway and through inbrowser.link / the SW gateway.

**Corrections:**
1. **Set `worker.format: 'es'` explicitly.** Vite 8.3 still defaults to `'iife'`, which silently inlined the worker's dynamic import.
2. **"No public/ absolute paths" is the wrong rule.** Vite already rewrites `/favicon.svg` in HTML to `./favicon.svg`. What escapes is hand-written string literals in JS (`fetch('/x')` survived into dist). So the audit must parse JS literals. Also, `import.meta.env.BASE_URL` is `'./'`, which resolves wrongly inside workers.
3. **The smoke assertion "canvas OR message" is too weak.** It passes on a blank canvas and depends on the machine. In headless Chromium 153:
   - `navigator.gpu` exists but `requestAdapter()` returns null without flags.
   - `--enable-unsafe-webgpu` gives a SwiftShader adapter, but canvas configure kills the device unless `--enable-features=Vulkan --use-angle=swiftshader` is added.
   - Canvas pixels read back blank, while offscreen render-to-texture readback works.

   Replace it with three deterministic projects (webgpu, no-webgpu, no-adapter). Add the runtime assertion that every request stays under the mount's base URL. Also add a subdomain mount (`<cid>.ipfs.localhost`) and a CSP-restricted mount. Subdomain is the dominant real mode: inbrowser.link and 4everland redirect path to subdomain, and w3s.link redirects to dweb.link.
4. **`ipfs add -r --cid-version=1` is not deterministic across tools.** kubo's default 256 KiB chunking produced a different CID from ipfs-car once a file exceeded 256 KiB. Use ipfs-car, which matches kubo's IPIP-0499 `unixfs-v1-2025` profile byte for byte.
5. **Named pinning services:** Storacha/web3.storage appears wound down (its sites redirect to fil.one; its upload hosts didn't answer), and Pinata's CAR upload is paid-only. Use Filebase, where the free tier imports a CAR and keeps its CID.
6. **Cloudflare:** the public IPFS gateway has been gone since August 2024; the Web3 DNSLink gateway is usage-billed and unnecessary. Use an assets-only Worker (no `main`, no `run_worker_first`, since a Worker script would be server-side code) plus a plain `_dnslink.amorf.us` TXT record. Use `not_found_handling: "none"`, not SPA mode, and not the owner's `404-page` convention.

**Additions:**
- The audit also bans `_redirects` (IPFS gateways interpret it), `ipfs-sw-*` filenames (reserved by the SW gateway), extensionless or `.wgsl` files, `history.*State` and `serviceWorker.register`. It enforces an external-host allowlist that doubles as the named third-party dependency list and generates the amorf.us CSP.
- Keep Playwright browsers and kubo out of `npm install`.
- The "WebGPU unavailable" message must be static HTML, so it still shows when a loader breaks module loading.

## Key decisions
- **Bundler** → Vite ^8.3.0 (Rolldown inside), base './', worker.format 'es', build.target 'esnext', sourcemap false
  - why: Verified: every emitted URL (HTML, modulepreload, CSS url(), dynamic imports, preload helper, module worker, nested worker import, new URL assets, ?url, ?raw) is relative. Vite 8.3 still defaults worker.format to 'iife', which inlines worker dynamic imports, so it must be set explicitly.
  - rejected Plain esbuild: No worker bundling and no new URL(..., import.meta.url) asset bundling; esbuild issues #312 and #795 are still open. No HTML entry or dev server.
  - rejected Rolldown directly: Vite 8 already is Rolldown; going direct means re-implementing HTML entry, CSS url() rewriting, worker sub-builds and the dev server for no gain.
  - rejected Default worker.format (iife): Classic worker, and dynamic imports get inlined (verified), which defeats code splitting in workers.
- **How relative-path correctness is guaranteed** → Two layers. A static dist audit (acorn/parse5) runs inside `npm run build`. A Playwright runtime check asserts every request URL stays under the mount's base URL, across /, /ipfs/<realCID>/, <cid>.ipfs.localhost and a CSP-restricted mount.
  - why: Vite leaves hand-written string literals alone (verified: fetch('/data/level.json') survived). The runtime check catches URLs computed at runtime that the static audit can't see. The audit prototype had exactly one false positive (the XHTML namespace URI) against three/webgpu.
  - rejected Regex grep for '"/' in JS: Too noisy on minified three.js; an AST walk plus an extension filter plus a host allowlist is precise.
  - rejected Audit only in `check`, not in `build`: `npm install && npm run build` could then emit a folder that breaks under a subpath; peatyscot precedent puts validation inside build.
- **WebGPU in the smoke test** → Three Playwright projects: webgpu (--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader; asserts app state 'running' plus offscreen render-to-texture readback), no-webgpu (navigator.gpu removed by an init script), no-adapter (requestAdapter stubbed to return null).
  - why: Verified headless on Chromium 153: no flags gives navigator.gpu present but a null adapter. --enable-unsafe-webgpu alone gives a SwiftShader fallback adapter, but canvas configure destroys the device until Vulkan+ANGLE flags are added. Canvas screenshot and drawImage readback come back blank, while offscreen texture readback works. Stubbing makes the fallback path deterministic on any machine.
  - rejected Hypothesis: accept 'either canvas or message appears': Passes on a blank canvas; which branch runs depends on the machine; never proves both paths.
  - rejected Skip the WebGPU test when no adapter is available: Makes the gate vacuous; the owner's rule is never to weaken a gate.
- **CID computation** → ipfs-car 3.1.0 (exact pin), cross-checked in check:release against kubo 0.43.1 with the IPIP-0499 `unixfs-v1-2025` profile
  - why: Verified identical root CIDs, including for a fixture with a 2.5 MB file. The hypothesis's `ipfs add -r --cid-version=1` uses 256 KiB chunks and diverged. Three clean builds gave the same CID.
  - rejected kubo `ipfs add -r --cid-version=1` defaults: Not the cross-implementation profile; CID differs from ipfs-car and from pinning services as soon as any file exceeds 256 KiB (the three/webgpu bundle is 769 kB).
  - rejected kubo as an npm devDependency: 120 MB, and it downloads a binary from GitHub at postinstall on every `npm install`; use `npx -y kubo@0.43.1` only in release scripts.
- **Pinning service** → Filebase (free: 5 GB, 500 pins, 10 GB egress; S3 upload with --metadata import=car keeps the root CID), with the owner's own kubo node as an optional second pin
  - why: Only free option verified to accept a CAR, which keeps the locally computed CID authoritative.
  - rejected Pinata: CAR upload is paid-plan only (verified in its docs); free folder uploads compute their own CID.
  - rejected Storacha / web3.storage: storacha.network and docs.storacha.network 301 to fil.one (S3 storage, no IPFS mention); console and upload hosts didn't respond on 2026-09-23.
  - rejected 4EVERLAND: Free tier and CAR support not verified from a primary source; possible fallback.
- **amorf.us hosting** → Assets-only Cloudflare Worker: no main, no run_worker_first, not_found_handling 'none', public/_headers for immutable /assets/* caching and a CSP generated from third-party.json. Apex via routes custom_domain. Plus a `_dnslink.amorf.us` TXT record updated at publish.
  - why: No Worker code ever runs, so the site stays fully static (verified in Cloudflare docs and with wrangler dev). A plain 404 matches IPFS gateway behaviour. DNSLink gives IPFS users a stable origin across releases (amorf-us.ipns.<gateway>), so saved worlds survive upgrades.
  - rejected peatyscot pattern (main + run_worker_first for www redirect and headers): That is server-side code, which the requirements forbid; use a zone Redirect Rule and _headers instead.
  - rejected not_found_handling 'single-page-application': Returns index.html with a 200 for a missing chunk, producing MIME errors that hide broken refs; behaviour IPFS doesn't have.
  - rejected not_found_handling '404-page' (owner's Hugo convention): Needs a 404.html whose links can't be relative when served at arbitrary depth; plain 404 is simpler and matches gateways.
  - rejected Cloudflare Web3 DNSLink gateway: Usage-billed and would compete with the Workers custom domain for the same hostname (inference); the TXT record alone gets DNSLink resolution everywhere else.
  - rejected COOP/COEP headers on amorf.us: Behaviour would diverge from IPFS gateways, where SharedArrayBuffer is unavailable (verified); design for transferables everywhere.
- **Service worker and routing** → No service worker. Fragment-only state via location.replace('#...') and hashchange. No History API.
  - why: The IPFS Service Worker Gateway registers /ipfs-sw-sw.js with scope '/' on the content origin (verified in source). An app service worker at the same scope would replace it and break loading. Fragments also never reach gateway logs.
  - rejected App service worker for offline play: Would displace Helia SW loaders; offline play isn't a requirement.
- **TypeScript and test runner versions** → typescript ^7.0.2 for `tsc --noEmit`, vitest ^4.1.11
  - why: TS7 verified working with vite/client and @webgpu/types and ~10x faster; it is typecheck-only, since Vite transpiles with Oxc. vitest 4.1 supports Vite 8.
  - rejected typescript ^6.0.3: Equally valid; choose it if the owner prefers the older major over typecheck speed.
  - rejected vitest ^5.0.1: Released 2026-09-03, only 3 weeks old; migrating later is trivial for a pure-TS core.
- **CI and deploy location** → GitHub Actions runs `npm run check` on push and PR, with no secrets (bitsy-services/wiki pattern). IPFS publish and wrangler deploy run locally behind the gate (peatyscot pattern).
  - why: Keeps the owner's pinning and Cloudflare keys off CI. The local gate stays the definition of done.
  - rejected Deploy from GitHub Actions (uniteum/docs pattern): Viable, but needs a Cloudflare token (and a Filebase key for IPFS) as repo secrets; owner's call.

## Facts
- [V] Vite latest is 8.3.0 (published 2026-09-10); 8.0.0 went stable 2026-03-12. — https://www.npmjs.com/package/vite (npm view vite version time)
- [V] Vite 8 uses Rolldown as its single bundler (vite 8.3.0 depends on rolldown ~1.1.x). — https://vite.dev/blog/announcing-vite8 ; vite 8.3.0 package.json (npm)
- [V] With base './', Vite 8.3.0 emitted only relative URLs: HTML script, modulepreload and stylesheet links as ./assets/...; /favicon.svg (public file) rewritten to ./favicon.svg; CSS url(./x.png) relative to the CSS file; import('./lazy-*.js'); preload helper using new URL(dep, import.meta.url); worker via new URL('mesher-*.js', import.meta.url); nested worker import('./worker-lazy-*.js'). — Experiment: research/2026-09-23/proto/vt/dist
- [V] Vite does not rewrite hand-written runtime string literals: fetch("/data/level.json") appears unchanged in dist. — Experiment (vt/dist/assets/index-*.js)
- [V] import.meta.env.BASE_URL equals './' in a build with base './'. — Experiment (window.__base in probe output)
- [V] Vite worker.format type is 'es' | 'iife' with default 'iife'. With iife, the worker's dynamic import was inlined into one chunk and self.location.href was used as the base. — https://vite.dev/config/worker-options ; experiment
- [V] ?raw WGSL is inlined as a JS string constant, so there is no runtime fetch of .wgsl. — Experiment (vt/dist/assets/index-*.js)
- [V] The test app (module worker, nested worker import, lazy chunks, CSS, vendor modulepreload, wasm URL) loaded with zero failed requests at /, at /ipfs/<cid>/ (reached via 301), on a kubo 0.43.1 path gateway, on a kubo subdomain gateway (<cid>.ipfs.localhost), and through IPFS Service Worker Gateway 3.4.15 backed by local kubo. — Experiments: vt/probe.mjs, vt/probe-gw.mjs, vt/probe-sw.mjs
- [V] kubo 0.43.1 gateway: /ipfs/<cid> gives a 301 to the trailing slash; .js and .mjs are text/javascript; .wasm is application/wasm; .wgsl is text/plain; Cache-Control is public, max-age=29030400, immutable; no COOP, COEP or CSP headers; a missing file is a plain 404. — Experiment (curl against local kubo 0.43.1 offline gateway)
- [V] The path gateway spec says a gateway MUST 301 a UnixFS directory requested without a trailing slash, SHOULD sniff Content-Type from file name and magic bytes, and MUST serve index.html when present. — https://specs.ipfs.tech/http-gateways/path-gateway/
- [V] Subdomain gateways give each root CID or IPNS name its own origin; DNSLink names are inlined by replacing '-' with '--' and '.' with '-' (e.g. amorf.us becomes amorf-us.ipns.<gw>). — https://specs.ipfs.tech/http-gateways/subdomain-gateway/
- [V] IPFS Service Worker Gateway v3 (3.4.15, commit c72ec3c, 2026-09-22) is subdomain-only: path gateway support was removed and /ipfs/cid redirects to cid.ipfs.<host>. It registers /ipfs-sw-sw.js with scope '/' and reserves /ipfs-sw-* asset paths. — https://github.com/ipfs/service-worker-gateway docs/DEVELOPMENT.md, src/lib/register-service-worker.ts, src/sw/handlers/asset-request-handler.ts
- [V] The Service Worker Gateway's production config uses trustless-gateway.net as its gateway and delegated-ipfs.dev for routing and DNS (dns-query). — https://github.com/ipfs/service-worker-gateway/blob/main/src/config/index.ts
- [V] The Service Worker Gateway stores an IndexedDB blockstore '/@helia/service-worker-gateway/blocks' and Cache Storage entries 'mutable-cache-v*', 'immutable-cache-v*', 'sw-assets-v*' and 'delegated-routing-v1-cache' on the content origin. — service-worker-gateway src/sw/lib/verified-fetch.ts:93, src/constants.ts:30
- [V] inbrowser.link/ipfs/<cid>/ 301-redirects to <cid>.ipfs.inbrowser.link, where the page is controlled by ipfs-sw-sw.js and served from the service worker, with no COOP/COEP (crossOriginIsolated false). — Experiment (Playwright against inbrowser.link, 2026-09-23)
- [V] @helia/verified-fetch 8.1.2's default contentTypeParser sniffs magic bytes via file-type, then maps extensions (.js/.mjs/.cjs to text/javascript, .css to text/css, .json, .svg, ...). The README's statement that the default is octet-stream is stale. — npm pack @helia/verified-fetch@8.1.2: src/utils/content-type-parser.ts, src/verified-fetch.ts:82
- [V] Through the Service Worker Gateway, every JS chunk (including requests made from inside the module worker) is served as text/javascript by the service worker, and WebAssembly.compileStreaming works (application/wasm). — Experiment vt/probe-sw.mjs
- [V] On 2026-09-23 ipfs.io and dweb.link answered curl and headless Chromium with a 403 Cloudflare Turnstile challenge ('Just a moment...'). — Experiment (curl and Playwright from this host)
- [V] 4everland.io path requests 301 to the subdomain form; <cid>.ipfs.w3s.link 301s to <cid>.ipfs.dweb.link; gateway.pinata.cloud returned 403 for non-owned content; ipfs.filebase.io returned 200 with 'Content-Security-Policy: default-src 'self'; img-src * data: blob: 'unsafe-inline'; style-src * 'unsafe-inline';'. — Experiment (curl, 2026-09-23)
- [V] Under Filebase's gateway CSP, WebAssembly.compile throws CompileError, a WebSocket to a third-party wss:// host is blocked (connect-src falls back to default-src), and cross-origin fetch is blocked. Same-origin module workers load, and RTCPeerConnection creation and ICE gathering are not blocked. — Experiment vt/probe-csp.mjs (header emulated on a local server)
- [V] SharedArrayBuffer is undefined and crossOriginIsolated is false on a local static server, the kubo gateway and the SW gateway; MDN says the constructor is hidden unless the document is cross-origin isolated. — Experiments; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- [V] Cloudflare's public IPFS gateway (cloudflare-ipfs.com, cf-ipfs.com) redirected to ipfs.io/dweb.link from 2024-05-14 and stopped connecting after 2024-08-14; a curl to it returned nothing today. — https://blog.cloudflare.com/cloudflares-public-ipfs-gateways-and-supporting-interplanetary-shipyard/ (search excerpt) + curl probe
- [V] Cloudflare Web3 IPFS gateways still exist as DNSLink gateways on all plans (usage-based billing, 15 gateways; Universal gateway is Enterprise-only). — https://developers.cloudflare.com/web3/ipfs-gateway/
- [V] Workers static assets serve a matching file without invoking Worker code; with no Worker script, unmatched requests get a 404. not_found_handling is 'single-page-application' | '404-page' | 'none' (default 'none'); html_handling defaults to 'auto-trailing-slash'. Requests to static assets are free and unlimited. — https://developers.cloudflare.com/workers/static-assets/ ; https://developers.cloudflare.com/workers/wrangler/configuration/ ; https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- [V] _headers is supported natively for Workers static assets (not applied to Worker-generated responses); limits are 100 _headers rules, 20,000 files per version (free) / 100,000 (paid), and 25 MiB per file. — https://developers.cloudflare.com/workers/static-assets/headers/ ; https://developers.cloudflare.com/workers/platform/limits/
- [V] wrangler 4.137.0 accepts the assets-only config (dry run OK). Under wrangler dev, /index.html 307-redirects to /, .wasm is application/wasm, .js is text/javascript, unmatched paths return 404, and the default Cache-Control is public, max-age=0, must-revalidate. — Experiment (vt/wrangler.jsonc)
- [V] Cloudflare Web Analytics automatic setup can inject the RUM beacon JS into HTML on proxied hostnames; configuration rules can turn it off (disable_rum). — https://developers.cloudflare.com/speed/observatory/rum-beacon/ ; https://developers.cloudflare.com/rules/configuration-rules/settings/
- [V] kubo 0.43.1 ships the IPIP-0499 profile 'unixfs-v1-2025': CIDv1, raw leaves, sha2-256, 1 MiB chunks, 1024 links per file node, 256 HAMT fanout. — `ipfs config profile --help` (kubo 0.43.1); https://specs.ipfs.tech/ipips/ipip-0499/
- [V] ipfs-car 3.1.0's root CID equals kubo 0.43.1 with the unixfs-v1-2025 profile for both a small dist and a dist with a 2.5 MB file; kubo `add -r --cid-version=1` defaults gave a different CID for the 2.5 MB fixture. — Experiment (dist: bafybeihs6sw2...; dist2: bafybeiezufqy... vs bafybeidhh2nr...)
- [V] Three clean Vite builds (including one with the Vite cache cleared) produced the identical root CID on the same machine. — Experiment
- [unverified] Cross-machine build determinism (different OS or Node patch version) holds. — Inference; not tested
- [V] storacha.network and docs.storacha.network 301 to fil.one; fil.one/pricing describes S3 object storage with no IPFS mention; console.storacha.network and up.storacha.network did not respond. — curl probes 2026-09-23; https://fil.one/pricing
- [unverified] Storacha/web3.storage upload service is discontinued. — Inference from the redirects and unreachable hosts above; no official announcement found
- [V] Pinata CAR uploads require a paid plan, public network only, single root CID; processing is asynchronous. — https://docs.pinata.cloud/files/uploading-files
- [unverified] Pinata free plan is 1 GB storage, 500 files, 10 GB bandwidth. — Search excerpt of https://pinata.cloud/blog/pinatas-new-free-plan/ (primary page not fetched)
- [V] Filebase free plan: 5 GB storage (shared), 500 pinned files, 10 GB IPFS egress, 1 gateway; Pro is $7.50/month. — https://filebase.com/pricing/
- [V] Filebase preserves a CAR's root CID when it is uploaded via S3 with metadata import=car (aws --endpoint https://s3.filebase.com s3 cp folder.car s3://bucket/ --metadata 'import=car'). — https://filebase.com/docs/ipfs/pinning/pinning-files
- [unverified] 4EVERLAND offers a 5 GB free IPFS tier. — Search excerpts (sourceforge, ipfs.ninja); primary not fetched
- [V] delegated-ipfs.dev /routing/v1/providers/<cid> returns a JSON provider list (90 for the Wikipedia CID), and trustless-gateway.link serves ?format=raw blocks to curl, so post-publish checks can be scripted. — Experiment (curl)
- [V] Headless Chromium 153 (Playwright 1.63.0) on Linux without a GPU (WSL2, no /dev/dri): navigator.gpu present but requestAdapter() null without flags; --enable-unsafe-webgpu gives a SwiftShader adapter with isFallbackAdapter true; compute and render-to-texture readback work; canvas configure destroys the device unless --enable-features=Vulkan plus --use-angle=swiftshader|vulkan is added; canvas screenshot and drawImage readback are blank. — Experiments vt/probe.mjs, render2-5.mjs
- [V] Chrome's guidance for headless WebGPU on Linux: --headless=new --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu (article dated 2024-01-16). — https://developer.chrome.com/blog/supercharge-web-ai-testing
- [unverified] GitHub-hosted Ubuntu runners provide a WebGPU adapter with SwiftShader flags. — Mixed community reports (search excerpts); not tested
- [V] esbuild issue #312 (WebWorker support) and #795 (URL assets bundling) are both still open. — https://api.github.com/repos/evanw/esbuild/issues/312 and /795
- [V] TypeScript 7.0.2 (2026-07-08) ships `tsc`; it typechecked a sample using vite/client and @webgpu/types in 0.35 s and correctly reported errors. — Experiment in proto/ts7; npm registry
- [V] vitest 5.0.1 is latest (2026-09-15); vitest 4.1.11 (2026-08-18) has peer vite ^6 || ^7 || ^8. — npm registry
- [V] Playwright 1.63.0 installs Chrome Headless Shell 153.0.8010.12 (~261 MB) and full Chromium (~393 MB) separately from npm install. — Experiment (npx playwright install chromium)
- [V] The kubo npm package is 120 MB and its postinstall downloads the binary from GitHub releases. — Experiment (node_modules/kubo, src/download.js)
- [V] three.js 0.185.1 three/webgpu bundles to 768.63 kB min / 210 kB gzip, with a 4.8 MB sourcemap; the audit prototype's only hit on it was 'http://www.w3.org/1999/xhtml'. — Experiment
- [V] Workers static assets serve JS as text/javascript (changed 2025-08-25). — https://developers.cloudflare.com/changelog/post/2025-08-25-workers-assets-javascript-content-type/
- [V] Brave removed native IPFS support in 1.69.153 (2024-08-22). — Search excerpt of https://brave.com/blog/ipfs-support/
- [unverified] IPFS Companion (MV3) is still available and redirects IPFS URLs to a local kubo gateway, which the kubo path/subdomain tests cover. — Search excerpts: https://docs.ipfs.tech/install/ipfs-companion/
- [unverified] IPFS gateways ignore a _headers file in the DAG (only _redirects is specified, and only on origin-isolated gateways). — Inference from IPIP-0002 knowledge; not re-checked this session

## Risks
- (medium) GitHub-hosted runners return a null WebGPU adapter even with SwiftShader flags, so the `webgpu` e2e project fails on CI. | impact: Either CI is permanently red or the render path goes untested in CI. | mitigation: Test in M0. If it fails, the owner chooses between a GPU/self-hosted runner and running that one project locally only (local `npm run check` stays the definition of done). Never skip the test when there is no adapter.
- (high) Players' saved worlds disappear after a new release on subdomain gateways, because each CID is a new origin with empty IndexedDB. | impact: Silent data loss for IPFS users on every release. | mitigation: Promote stable origins (amorf.us, DNSLink amorf-us.ipns.<gw>, inbrowser.link/ipns/amorf.us). Show an in-app warning when running on a <cid>.ipfs.* origin. Make export/import prominent.
- (high) CSP-restricting gateways (Filebase public gateway: default-src 'self') block signaling WebSockets and WASM. | impact: Multiplayer can't work on such hosts; any WASM feature breaks. | mitigation: No WASM on the critical path. Detect `securitypolicyviolation` and show a clear message. Scope the requirement: single-player on any gateway, multiplayer on hosts that don't restrict connect-src. The CSP mount in e2e enforces the graceful path.
- (medium) ipfs-car is maintained by the web3-storage/Storacha organisation, which appears wound down; a future version could change importer defaults. | impact: The published CID no longer matches what gateways and pinning services compute. | mitigation: Pin ipfs-car 3.1.0 exactly. check:release cross-checks against kubo's unixfs-v1-2025 profile and fails on mismatch.
- (medium) Public gateways (ipfs.io, dweb.link) challenge or rate-limit clients; content isn't discoverable if the pinning service doesn't advertise it. | impact: The 'through an IPFS gateway path' acceptance check fails for some users even though the build is correct. | mitigation: Post-publish script checks delegated-ipfs.dev providers and the trustless-gateway root block. A manual browser checklist covers dweb.link and inbrowser.link. Optionally add a second pin on the owner's own kubo node.
- (low) Cloudflare Web Analytics/RUM auto-injection (or a future Cloudflare-added header or script) puts tracking into amorf.us. | impact: Violates 'No secrets, API keys, or tracking'. | mitigation: Keep RUM off at the zone. verify-live compares the sha256 of https://amorf.us/ with dist/index.html after every deploy.
- (low) A future Vite upgrade changes defaults (e.g. worker format, preload helper, public-path rewriting) so that root-absolute URLs appear. | impact: Breaks IPFS subpath loading silently. | mitigation: The dist audit (inside build) and the base-URL runtime assertion (e2e) catch it on the next build.
- (medium) A 'Helia-based loader' the owner has in mind inlines index.html (srcdoc, blob:, or document.write) instead of serving the DAG at a URL. | impact: Every relative URL resolves against about:srcdoc or blob:, so the app fails to load. | mitigation: Define the loader contract in the plan: the loader must serve the UnixFS directory at a URL where index.html's directory is the base (as the SW gateway does, verified). Get owner confirmation.
- (medium) SwiftShader software rendering is slow, so render e2e tests time out or flake. | impact: A flaky gate erodes trust in it. | mitigation: A `#test=smoke` fragment loads a tiny seeded world with minimal view distance; assert state and frame count rather than wall-clock fps; generous but bounded timeouts.
- (low) Pinning free-tier limits (Filebase 500 pins, 5 GB) or policy change. | impact: Can't publish new releases for free. | mitigation: Unpin old releases in the publish script (keep the last N). The kubo self-pin fallback is documented. Everything runs from a local CAR, so switching providers is cheap.
- (low) Secrets leak (pinning key, Cloudflare token, or TURN credentials if the P2P area uses TURN) into the repo or bundle. | impact: Violates requirements; account compromise. | mitigation: Credentials only from environment or OS keychain; secret-pattern scan in the audit; .gitignore for .env and *.car.

## Requirement conflicts
- [major] "Worlds save locally in the browser and survive reloads" vs "Must work when served from IPFS, including through gateway subpaths" / "Build output is a single folder that can be pinned": Browser storage is per origin. On subdomain gateways (the dominant mode: inbrowser.link, 4everland and w3s.link all redirect to subdomains) each release CID is a new origin, so saves vanish on upgrade. On path gateways, every site on that gateway shares one origin, so storage is shared and quota-limited with unrelated dapps. amorf.us and each gateway are also separate origins, so worlds don't carry between hosts. → Saves survive reloads (met) but not host or version changes (state this). Publish a DNSLink so IPFS users get a stable origin (amorf-us.ipns.<gw>). Warn in-app on <cid>.ipfs.* origins. Make file export/import the explicit bridge. Namespace storage with an 'amorfus-' prefix.
- [major] "Must work when served from IPFS ... through gateway subpaths" vs "Peer-to-peer ... any third-party signaling/relay dependency": Some public gateways set restrictive CSP. Filebase's `default-src 'self'` blocks WebSocket and fetch connections to any signaling host, and blocks WebAssembly compilation (verified by emulation). Multiplayer therefore cannot work on such gateways whatever the P2P stack. → Define 'works' per host: single-player on any spec-compliant gateway; multiplayer where connect-src isn't restricted (amorf.us, dweb.link/ipfs.io subdomains, inbrowser.link, local kubo). Detect `securitypolicyviolation` and say so in the UI. Avoid WASM on the critical path.
- [minor] "Deploys as a fully static site: no backend, no server-side code" vs owner's Cloudflare convention (peatyscot puts a Worker in front via run_worker_first for www→apex and headers): Copying the sibling pattern adds a Worker script, which is server-side code. → Assets-only Worker (no main, no run_worker_first). Headers via _headers. www→apex, if wanted, via a Cloudflare Redirect Rule (zone configuration, no code).
- [minor] "Must work ... in Helia-based loaders" (term undefined): The only concrete Helia loader verified in 2026 is the IPFS Service Worker Gateway (inbrowser.link), which Amorfus-style builds pass. A loader that inlines HTML (srcdoc, blob:, document.write) would break all relative URLs, which the 'all references relative' requirement itself depends on. → Write the loader contract into the plan: the loader serves the UnixFS DAG at a URL whose directory is index.html's base, and must not require the app to register a service worker. Test against the Service Worker Gateway (pinned tag). Ask the owner which loader is intended.
- [minor] "No game server run by me; any third-party signaling/relay dependency must be named" vs "Must work when served from IPFS": IPFS delivery itself relies on third-party infrastructure beyond signaling: the pinning service, public gateways, and for inbrowser.link also trustless-gateway.net and delegated-ipfs.dev (verified in its config). amorf.us relies on Cloudflare. → Name them all in the plan and README (see third_party_dependencies). third-party.json makes the bundle's external hosts machine-checked.
- [minor] Acceptance: "Placing and removing blocks ... at 60 fps on the target hardware", "Two browsers on different machines can join" vs the automated build-blocking gate: Headless CI renders WebGPU with SwiftShader at best (fallback adapter; canvas readback blank; runner adapter availability unverified). It can't measure 60 fps on an integrated GPU or test NAT traversal between two machines. → The automated gate covers correctness (loads, both WebGPU paths, no path escapes, sync logic in unit tests). 60 fps and two-machine play become a documented manual acceptance checklist, plus a local perf-harness script run on the target laptop.
- [minor] "npm install && npm run build produces a static folder" vs a heavy test and publish toolchain: Playwright browsers (~261–393 MB) and kubo (120 MB, downloaded from GitHub at postinstall) would make every `npm install` slow and network-dependent on extra third parties. → Browsers are installed explicitly (`npx playwright install --only-shell chromium`); kubo runs only via `npx -y kubo@0.43.1` in release scripts; build needs only Vite, TS and the audit parsers.
- [minor] "No secrets, API keys, or tracking" vs publishing (pinning key, Cloudflare token) and Cloudflare zone features: Publishing needs credentials. Cloudflare can auto-inject a RUM beacon into HTML on proxied zones. → Credentials only via environment or keychain, never in the repo or CI unless the owner opts in. The dist audit scans for secrets. RUM stays off, and verify-live hash-compares served HTML with dist/index.html.

## Third-party deps
- npm registry (GitHub/Microsoft (npm, Inc.)) build-time: Supplies all build and test packages | sees: Package downloads from the developer or CI machine (IP, package list)
- Playwright browser CDN (Microsoft) build-time: Downloads Chromium headless shell 153 for e2e | sees: Browser download requests from the developer or CI machine
- GitHub releases (kubo binary via `npx kubo@0.43.1`) (GitHub / IPFS project) publish-time: kubo binary for the release-time gateway smoke test and CID cross-check | sees: Binary download requests
- GitHub Actions (GitHub/Microsoft) build-time: Runs `npm run check` on push and PR (no secrets) | sees: Source code (public repo) and test logs
- Cloudflare Workers static assets + Cloudflare DNS (amorf.us, _dnslink TXT) (Cloudflare, Inc.) runtime: Serves the static dist at amorf.us and hosts the DNSLink TXT record; no Worker code runs | sees: Every HTTP request to amorf.us (IP, user agent, path; never the #fragment, so not room codes); DNS lookups
- Filebase (Filebase, Inc.) publish-time: Pins the release CAR (S3 upload with import=car) and serves its blocks to the IPFS network | sees: The CAR (public content anyway) and the owner's account and API key usage
- Public IPFS gateways (ipfs.io, dweb.link; optionally 4everland.io, ipfs.filebase.io) (IPFS Foundation / Interplanetary Shipyard for ipfs.io and dweb.link (per Cloudflare's 2024 blog excerpt); 4EVERLAND; Filebase) runtime: HTTP delivery of the pinned CID to users who choose them | sees: User IP, user agent, requested CID and paths (not fragments)
- IPFS Service Worker Gateway (inbrowser.link) and its backends trustless-gateway.net and delegated-ipfs.dev (IPFS Foundation / Interplanetary Shipyard (inferred from the ipfs/service-worker-gateway repo)) runtime: Helia-based in-browser loader; resolves providers and fetches verified blocks | sees: Requested CIDs and DNSLink names, block fetches, user IP
- delegated-ipfs.dev and trustless-gateway.link (post-publish verification) (IPFS Foundation / Interplanetary Shipyard (inference)) publish-time: Scripted check that the published CID is discoverable and retrievable | sees: The CID being checked, from the owner's machine
- Signaling / STUN hosts (owned by the P2P research area) (TBD by P2P area) runtime: Listed in third-party.json; enforced by the dist audit and the amorf.us CSP connect-src | sees: TBD; the room code is exchanged via the fragment, never sent to the static host

## Test ideas
- Dist audit self-test: a fixture dist with a planted `fetch('/x.json')`, a `url(/a.png)`, a missing chunk referenced from __vite__mapDeps, a `_redirects` file, an `ipfs-sw-foo.js`, an extensionless file and `history.pushState`. The audit must report each one, and it must pass on the real build.
- Runtime base-URL containment: context-level request listener asserts every request (including from workers) starts with the mount's base URL or an allowlisted third-party host, on / , /ipfs/<cid>/ (entered without the slash), <cid>.ipfs.localhost, and the CSP mount.
- no-webgpu project (navigator.gpu deleted) and no-adapter project (requestAdapter resolves null): the static fallback message is visible and names the reason; no uncaught errors.
- webgpu project (SwiftShader flags): html[data-state=running] within 20 s, ≥60 frames without device.lost, and an offscreen render-to-texture readback of a known smoke scene matches expected pixel checksums.
- A loader that serves JS as application/octet-stream (emulated MIME failure): the static fallback message still shows, never a blank page.
- Filebase-CSP mount: single-player boots, a securitypolicyviolation is caught, and the multiplayer UI shows the 'network blocked by this host' message; no WebAssembly on the boot path.
- Fragment routing: load #join=ABC, assert state parsed and location.pathname unchanged after in-app navigation; history.length does not grow from pushState.
- Persistence: save a world, reload, assert it loads on the same mount; save on /ipfs/<cid>/ and load on a different CID subdomain to show (and document) origin separation.
- CID determinism: `npm run build` twice and `ipfs-car pack` gives the same CID; check:release asserts kubo 0.43.1 (unixfs-v1-2025) and ipfs-car CIDs match, including a fixture file >256 KiB.
- Real kubo offline gateway smoke (check:release): dag import of the CAR, then the e2e spec against the path and subdomain forms; also assert the 301 on the missing trailing slash and MIME types for .js/.css/.wasm.
- Service Worker Gateway smoke (weekly or pre-release): pinned-tag ipfs/service-worker-gateway built with NODE_ENV=development against local kubo; the app loads, the worker runs, WebAssembly.compileStreaming succeeds, and the app does not register any service worker.
- verify-live after deploy: sha256 of https://amorf.us/ equals dist/index.html; /assets/* has immutable Cache-Control; no COOP/COEP; the CSP connect-src equals the hosts in third-party.json.
- Post-publish: delegated-ipfs.dev/routing/v1/providers/<cid> returns ≥1 provider and trustless-gateway.link returns the root block for ?format=raw.
- Unit test (vitest, node) for the fragment codec and invite-link builder: link = base URL without hash + '#join=…', round-trips on all four mount URL shapes.

## Milestone notes
**M0: skeleton and gate, before any game code.**
- Scaffold:
  - vite.config.ts (`base: './'`, `worker.format: 'es'`), tsconfig, and `.nvmrc`
  - index.html with the static fallback message
  - a WebGPU probe
  - one module worker round-trip and one `?raw` WGSL import
- Checks:
  - `scripts/audit-dist.mjs`, run inside `npm run build`
  - `e2e/serve-gateway.mjs` with four mounts (/, /ipfs/<cid>/, <cid>.ipfs.localhost, CSP)
  - Playwright projects webgpu, no-webgpu and no-adapter
  - `third-party.json`, empty at first
  - `.github/workflows/check.yml`
- Answer the GitHub-hosted-runner WebGPU question empirically.
- Add wrangler.jsonc and deploy the skeleton to amorf.us. Confirm no RUM injection with verify-live.
- Publish the skeleton's CAR to Filebase. Check it by hand on dweb.link and inbrowser.link, which proves the whole pipeline end to end before any game code exists.

**M1+:** every feature milestone must pass `npm run check`.
- When P2P lands, add the signaling hosts to third-party.json. The amorf.us CSP and the audit allowlist then update from that one file.
- Add the multiplayer-blocked message and its CSP e2e assertion in the same milestone as networking.

**First playable release:**
- `check:release`: the kubo offline path and subdomain smoke test, plus the CID cross-check.
- `publish:ipfs`: Filebase `import=car`, CID verification, unpinning old releases.
- DNSLink TXT update.
- A manual acceptance checklist in the README covering 60 fps on the target laptop, two machines, and dweb.link/inbrowser.link.

**Can wait past MVP:**
- Service Worker Gateway CI job (weekly or pre-release; heavy install).
- A second pin on the owner's kubo node.
- Automatic DNSLink updates (manual TXT edits are fine at first).
- GitHub Actions deploy.
- Hosting sourcemaps.
- Vitest 5 migration.
- A size-budget ratchet.

## Open questions
- What exactly are the 'Helia-based loaders' Amorfus must work in? inbrowser.link/Service Worker Gateway (verified compatible), or something else? Is it acceptable to state that loaders which inline index.html (srcdoc or blob:) are unsupported?
- Is Filebase acceptable as the pinning provider (account and S3 key held by the owner), and should the owner's own kubo node be a second pin?
- Deploy amorf.us locally behind `npm run deploy` (peatyscot pattern) or from GitHub Actions with a CLOUDFLARE_API_TOKEN secret (uniteum/docs pattern)?
- If GitHub-hosted runners can't provide a WebGPU adapter: use a GPU or self-hosted runner, or run the `webgpu` e2e project locally only (local `npm run check` remains the definition of done)?
- TypeScript 7.0 (verified working, faster) or 6.0.3? Vitest 4.1 or 5.0?
- Is www.amorf.us needed? If so, redirect it with a Cloudflare Redirect Rule, since a Worker would be server-side code.
- Should DNSLink (`_dnslink.amorf.us`) be updated automatically at publish (needs a Cloudflare DNS-edit token locally) or by hand?
- Is it acceptable that multiplayer is unavailable on gateways that set restrictive CSP (e.g. Filebase's public gateway), with a clear in-app message?
- Should the pinned build include sourcemaps (4.8 MB for three/webgpu alone) or ship without them?