# Amorfus: Requirements

Build **Amorfus**, a browser-based voxel sandbox game. This prompt states requirements only. You choose the architecture, algorithms, libraries, and file layout. Before writing code, propose a plan that covers those choices and wait for my approval.

## Concept

- Minecraft-style building: the world is made of blocks the player can place and remove
- Blocks adjust to their neighbors so the terrain forms smooth surfaces instead of stair-stepped cubes
- The world should look organic while staying easy to edit block by block

## Gameplay (MVP)

- First-person movement: walk, jump, fly toggle, collision with terrain
- Place and remove blocks with mouse and keyboard
- At least 4 block/material types with visually distinct surfaces
- Procedurally generated terrain that extends as the player explores
- Edits reshape the smoothed surface immediately, with no visible seams between chunks or regions
- A player can also choose to keep a block sharp and cube-shaped (e.g. for building walls)

## Multiplayer

- Peer-to-peer: players connect directly to each other
- No game server run by me; any third-party signaling/relay dependency must be named in the plan
- Players can join a shared world via a link or code
- Block edits and player positions sync between peers
- Conflicting edits resolve deterministically so all peers end up with the same world
- Supports at least 4 simultaneous players

## Persistence

- Worlds save locally in the browser and survive reloads
- Export a world to a file and import it again
- A world can be shared as a seed plus edits (it doesn't have to be the full geometry)

## Platform constraints

- JavaScript (TypeScript allowed if you recommend it)
- Rendering via WebGPU
- Deploys as a **fully static site**: no backend, no server-side code
- Must work when served from IPFS, including through gateway subpaths (`/ipfs/<CID>/`) and in Helia-based loaders:
  - All asset and module references are relative
  - No reliance on server rewrites, history-API routing, or absolute root paths
- Build output is a single folder that can be pinned as-is
- Source lives in the `amorfus` GitHub repo; site will also be served from amorf.us

## Performance and compatibility

- Targets current desktop Chrome and Edge with WebGPU
- 60 fps on mid-range hardware (integrated GPU on a recent laptop) at a reasonable default view distance
- Terrain generation and smoothing must not stall the frame loop
- If WebGPU is unavailable, show a clear message instead of a blank page

## Quality

- Readable, modular code with a short README covering how to run, build, and publish to IPFS
- Automated tests for the non-rendering core (world data, smoothing inputs/outputs, sync/merge logic)
- No secrets, API keys, or tracking

## Out of scope for MVP

- Mobile and touch controls
- Accounts, login, or any central identity
- Mobs, combat, crafting, inventory beyond block selection
- Audio beyond optional simple effects

## Acceptance

- `npm install && npm run build` produces a static folder
- Opening that folder over a local static server and through an IPFS gateway path both work
- Two browsers on different machines can join the same world and see each other's edits
- Placing and removing blocks produces smooth, seamless terrain at 60 fps on the target hardware

## First deliverable

A written plan covering: rendering approach, smoothing technique, chunk/world data model, P2P stack and signaling, sync/conflict model, persistence format, build tooling, and milestones. Flag any requirement you think conflicts with another or is unrealistic.