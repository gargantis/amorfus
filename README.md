# amorfus

Build with blocks, get smooth surfaces. A voxel sandbox with adaptive
geometry: the world is 16-bit block values; every smooth surface on screen is
a deterministic view of them. WebGPU, peer-to-peer multiplayer, fully static
hosting (amorf.us and IPFS).

Status: under construction. [PLAN.md](PLAN.md) is the approved implementation
contract; [docs/conflicts.md](docs/conflicts.md) tracks its open conflicts.

## Run

```sh
npm install
npm run dev          # http://localhost:5173
npm run dev:lan      # https on your LAN IP (self-signed) for a second machine
```

Requires Node ≥ 22.12 and a browser with WebGPU (current desktop Chrome or
Edge on Windows x64, macOS, ChromeOS, or Linux with Intel Gen12+/NVIDIA on
Wayland).

## Build and check

```sh
npm run build        # typecheck, vite build, licence merge, dist audit
npm run check        # the gate: lint, public-scan, typecheck, unit, build,
                     # WGSL compile (Dawn), Playwright e2e on gateway mounts
```

`npm run check` is the definition of done; it must pass before any deploy or
publish, and it is never weakened to make a build pass.

## Publish

```sh
npm run cid          # pack dist/ into a CAR, print the root CID
npm run check:release  # gate + kubo CID cross-check + gateway + SWG smoke
npm run publish:ipfs   # upload the CAR to Filebase (key from your env),
                       # then update the _dnslink record; records RELEASES.md
npm run deploy         # check + relay probe + wrangler deploy to amorf.us
```

First-time external actions wait for the owner's explicit go-ahead. Keys and
tokens live in your environment, never in this repo.

## License

MIT — see [LICENSE](LICENSE). Bundled third-party notices ship in
`THIRD-PARTY-LICENSES.txt` inside the build output.
