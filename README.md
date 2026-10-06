# amorfus

Build with blocks, get smooth surfaces. A voxel sandbox with adaptive
geometry: everything saved, synced or shared is a per-cell 16-bit block
value; every smooth surface on screen is a deterministic view of those
values. WebGPU rendering, serverless peer-to-peer multiplayer, fully
static hosting on [amorf.us](https://amorf.us) and IPFS.

[PLAN.md](PLAN.md) is the implementation contract;
[docs/conflicts.md](docs/conflicts.md) tracks its conflict register and
[docs/acceptance.md](docs/acceptance.md) the measured acceptance state.

## Run

```sh
npm install
npm run dev          # http://localhost:5173
npm run dev:lan      # https on your LAN IP (self-signed) for a second machine
```

**Platforms.** Current desktop Chrome or Edge with WebGPU on by default:
Windows x64, macOS, ChromeOS, and Linux with Intel Gen12+ or NVIDIA on
Wayland. A desktop keyboard and mouse are required.

**Secure context rule.** WebGPU and the connection APIs exist only on
https or localhost. A plain `http://<LAN IP>` page gets neither — that is
what `npm run dev:lan` is for. Opening `index.html` from a file:// URL
cannot work either; serve the folder with any static server.

**Edge note.** Edge's "Enhanced Security" mode can disable WebGPU on
unfamiliar sites; if Edge shows the no-WebGPU message, add the site as an
exception or use Balanced mode.

### Controls

WASD move · mouse look · left dig · right place · middle pick material ·
1–6 or wheel material · Q sharp placement mode · R toggle sharp on the
target · Space jump · double-tap Space or F fly (Space rises, Shift
descends) · double-tap W sprint · Esc pause/menu.

### Saves and origins

Worlds save in the browser, per origin. amorf.us (and a DNSLink name) are
stable origins: saves there survive releases. A pinned-CID origin keeps
saves with that version — move on through the handoff or Export/Import
(backup keeps everything; share strips identity and play times, and can
only be forked). The pause menu shows the storage status, including
whether the browser granted persistence.

### Privacy

No tracking, no analytics, no accounts. Single-player contacts no third
party at all. Hosting or joining contacts the signaling relays and STUN
servers listed in [third-party.json](third-party.json) — the in-game
privacy sheet shows exactly what each one sees, before the first
connection. Peers see each other's IPs; an optional TURN server you
provide can relay when direct connections fail.

## Build and check

```sh
npm run build        # typecheck, vite build, licence merge, dist audit
npm run check        # the gate — must pass before any deploy or publish
```

The gate: `lint && public-scan && typecheck && test && build && wgsl &&
e2e`. It is the definition of done and is never weakened to make a build
pass. The build refuses to emit a folder that would break under an IPFS
subpath, and the e2e drives the real app over plain, `/ipfs/<cid>/`,
subdomain, production-CSP and strict-CSP mounts, plus rendererless
storage and real-WebRTC networking projects against a local relay.

## Publish to IPFS and amorf.us

```sh
npm run cid            # pack dist/ into a CAR, print the root CID
npm run check:release  # gate + kubo CID cross-check + gateway smokes
npm run probe:relays   # 4 of 6 curated relays must answer, or no deploy
npm run publish:ipfs   # upload the CAR to Filebase (keys from your env),
                       # verify the CID, then update _dnslink.amorf.us
npm run deploy         # check + probe + wrangler deploy (scoped token)
node scripts/verify-live.mjs <cid>   # hash-check what the world serves
```

Every first-time external action waits for the owner's explicit
go-ahead. Keys and tokens live in the environment, never in this repo or
CI. The full operator sequence is in
[docs/release-runbook.md](docs/release-runbook.md).

## License

MIT — see [LICENSE](LICENSE). Bundled third-party notices ship in
`THIRD-PARTY-LICENSES.txt` inside the build output.
