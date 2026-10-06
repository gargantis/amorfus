import './style.css';
import { gpuInit } from './render/gpu-init';
import { messageFor } from './ui/gpu-messages';
import { showMessage } from './ui/show-message';
import { Renderer, type Camera } from './render/renderer';
import { TIERS } from './render/resize';
import { meshRegion, type MeshParams } from './core/mesh/mesher';
import { setupGallery } from './ui/gallery';
import { Streaming } from './game/streaming';
import { EditManager } from './game/edits';
import { InputManager } from './game/input';
import { Hotbar } from './ui/hotbar';
import { stepPlayer, PLAYER, type PlayerState, type ControllerInput } from './core/physics/controller';
import { pickRay } from './core/physics/pick';
import type { TriangleSource, ChunkTriangles } from './core/physics/collision';
import { scenarioA, summarise } from './game/scenario-a';
import { AIR, materialOf, isSharp } from './core/world/block';
import { WorldSession, LockBusyError } from './game/world-session';
import { runCoreMode, runHandoffSender, runHandoffReceiver } from './game/core-mode';
import type { PlayerSave } from './game/player-save';
import { generateChunk, heightAt } from './core/gen/v1/index';
import { CHUNK, packChunkKey } from './core/world/coords';
import { makeBlock } from './core/world/block';

// M2 entry: boot checks passed (boot.js). Initialise WebGPU, fill terrain
// incrementally on the main thread (the worker pool arrives at M4), fly.

window.__amorfusBootReady?.();

const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
const query = new URLSearchParams(location.search);
const TEST_MODE = hash.has('test');
const SWATCH = hash.get('scene') === 'swatch';
const GALLERY = hash.get('scene') === 'gallery';
const BENCH = query.get('bench') === 'flythrough';
const SCENARIO_A = query.get('bench') === 'scenario-a';
const SEED: [number, number] = TEST_MODE ? [42, 0] : [1, 1];

const tierName = (hash.get('tier') ?? query.get('tier') ?? 'medium') as keyof typeof TIERS;
// §8.4 frame cap: auto (default), half refresh, or uncapped (= auto under
// rAF; a real uncapped mode needs no vsync, which rAF cannot give).
const FRAME_CAP = query.get('cap') ?? hash.get('cap') ?? 'auto';
const VIEW_RADIUS = TEST_MODE ? 32 : TIERS[tierName]?.viewRadius ?? 160;

async function start(): Promise<void> {
  // Renderer-free modes first (§14 core project, §12.5 handoff).
  if (await runHandoffSender()) return;
  if (hash.get('test') === 'core') {
    await runCoreMode();
    return;
  }
  if (hash.get('test') === 'handoff-receiver') {
    await runHandoffReceiver();
    return;
  }

  const init = await gpuInit();
  if (init.kind !== 'ok') {
    showMessage(messageFor(init));
    return;
  }
  if (init.isFallback) showMessage(messageFor({ kind: 'fallback-adapter' }));
  const { device } = init;
  // Surface silent validation errors: the e2e guards treat console errors
  // as failures, so nothing WebGPU-invalid can pass the gate quietly.
  device.addEventListener('uncapturederror', (ev) => {
    console.error(`webgpu uncaptured: ${(ev as GPUUncapturedErrorEvent).error.message}`);
  });
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') {
      showMessage(messageFor({ kind: 'device-lost', storage: 'stable' }));
    }
  });

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu');
  if (context === null) {
    showMessage(messageFor({ kind: 'device-rejected', reason: 'no webgpu canvas context' }));
    return;
  }

  const renderer = await Renderer.create(device, canvas, context, tierName in TIERS ? tierName : 'medium');
  const fallback = document.getElementById('fallback');
  if (fallback) fallback.hidden = true;
  canvas.hidden = false;

  const resize = (): void =>
    renderer.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight, devicePixelRatio);
  resize();
  addEventListener('resize', resize);

  // ---- scene setup ----
  const h0 = heightAt(SEED, 0, 0);
  const camera: Camera = GALLERY
    ? { position: [64, 26, 110], yaw: 0, pitch: -0.25 }
    : SWATCH
    ? { position: [16, 20, 42], yaw: 0, pitch: -0.35 }
    : TEST_MODE
      ? { position: [0.5, h0 + 40, 0.5], yaw: 0, pitch: -Math.PI / 2 + 0.001 }
      : { position: [0.5, h0 + 12, 0.5], yaw: 0, pitch: -0.25 };

  // §15 M4/M6: the worker-pool streaming world over the persisted one.
  let streaming: Streaming | null = null;
  let editManager: EditManager | null = null;
  let worldSession: WorldSession | null = null;
  if (GALLERY) {
    setupGallery(renderer);
  } else if (SWATCH) {
    buildSwatchScene(renderer);
  } else {
    if (!TEST_MODE) {
      try {
        worldSession = await WorldSession.open({ seed: SEED });
      } catch (err) {
        if (err instanceof LockBusyError) {
          const take = confirm('This world is open in another tab. Take over here?');
          if (take) worldSession = await WorldSession.open({ seed: SEED, steal: true });
        } else if (WorldSession.classify().kind !== 'no-storage') {
          console.error('storage unavailable:', err);
        }
      }
      const bannerText = WorldSession.banner();
      if (bannerText !== null) {
        const banner = document.getElementById('banner');
        if (banner) {
          banner.textContent = bannerText;
          banner.hidden = false;
        }
      }
    }
    const worldSeed = worldSession?.meta.seed ?? SEED;
    const s = new Streaming(renderer, worldSeed, VIEW_RADIUS, () => editManager?.editsByChunk() ?? new Map());
    streaming = s;
    editManager = new EditManager(s, renderer, worldSeed, {
      ...(worldSession !== null
        ? { initialEdits: worldSession.loaded.chunks, hlcSeed: worldSession.meta.hlc }
        : {}),
    });
    if (worldSession !== null) worldSession.attach(editManager);
  }

  // ---- player (§9.2/§9.3); also drives scenario A ----
  const PLAYER_MODE = streaming !== null && !TEST_MODE && !BENCH;
  const source: TriangleSource = {
    chunkAt: (cx, cy, cz): ChunkTriangles | null => {
      if (streaming === null) return null;
      let key: number;
      try {
        key = packChunkKey(cx, cy, cz);
      } catch {
        return null;
      }
      const rec = streaming.chunks.get(key);
      if (rec === undefined) return null;
      return {
        origin: [cx * CHUNK, cy * CHUNK, cz * CHUNK],
        positions: rec.positions,
        indexData: rec.indexData,
        pickRecords: rec.pickRecords,
        pickOffsets: rec.pickOffsets,
      };
    },
  };
  const savedPlayer = worldSession?.loaded.player as PlayerSave | undefined;
  let player: PlayerState = {
    position: savedPlayer?.position ?? [0.5, h0 + 2, 0.5],
    velocity: [0, 0, 0],
    onGround: false,
    flying: savedPlayer?.flying ?? false,
  };
  if (savedPlayer?.yaw !== undefined) camera.yaw = savedPlayer.yaw;
  if (savedPlayer?.pitch !== undefined) camera.pitch = savedPlayer.pitch;
  const input = PLAYER_MODE ? new InputManager(canvas) : null;
  const hotbar = PLAYER_MODE && !SCENARIO_A ? new Hotbar() : null;
  let overlay: HTMLDivElement | null = null;
  if (PLAYER_MODE && !SCENARIO_A && input !== null) {
    overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:#101418cc;z-index:20;cursor:pointer;';
    overlay.innerHTML =
      '<div style="max-width:30rem;font:15px/1.6 system-ui;color:#dde;text-align:center;">' +
      '<h2>Click to play</h2>' +
      '<p>The browser will ask to lock your mouse pointer the first time.</p>' +
      '<p style="opacity:.8">WASD move · mouse look · left dig · right place · middle pick<br>' +
      '1–6/wheel material · Q sharp mode · R toggle sharp · Space jump<br>' +
      'double-tap Space or F fly (Space rises, Shift descends) · double-tap W sprint · Esc pause</p></div>';
    overlay.onclick = (ev) => {
      if ((ev.target as HTMLElement).closest('#world-menu') === null) void input.requestLock(canvas);
    };
    // §12 world menu: export, import, save-as-copy, storage status.
    if (worldSession !== null) {
      const ws = worldSession;
      const menu = document.createElement('div');
      menu.id = 'world-menu';
      menu.style.cssText =
        'margin-top:1.5rem;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;font:13px system-ui;';
      const btn = (label: string, fn: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #567;background:#1c232b;color:#dde;cursor:pointer;';
        b.onclick = (e) => {
          e.stopPropagation();
          fn();
        };
        menu.appendChild(b);
        return b;
      };
      const download = async (profile: 0 | 1): Promise<void> => {
        const bytes = await ws.exportFile(profile);
        const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${ws.meta.name}${profile === 1 ? '-share' : ''}.amorfus`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
      btn('Export backup', () => void download(0));
      btn('Export share', () => void download(1));
      btn('Save as copy', () => {
        void ws.saveAsCopy(`${ws.meta.name} copy`).then(() => status(`copied`));
      });
      const file = document.createElement('input');
      file.type = 'file';
      file.accept = '.amorfus';
      file.style.display = 'none';
      file.onchange = () => {
        const f = file.files?.[0];
        if (f === undefined) return;
        void f.arrayBuffer().then(async (buf) => {
          const mode = (prompt('Import mode: fork / restore / merge', 'fork') ?? 'fork') as
            | 'fork' | 'restore' | 'merge';
          const r = await ws.importFile(new Uint8Array(buf), mode);
          status(r.ok ? `imported (${mode}) — open it from a reload` : `import failed: ${r.reason}`);
        });
      };
      btn('Import…', () => file.click());
      const statusLine = document.createElement('div');
      statusLine.style.cssText = 'width:100%;text-align:center;opacity:.75;margin-top:6px;';
      const status = (t: string): void => {
        statusLine.textContent = t;
      };
      const refreshStatus = (): void => {
        statusLine.textContent = `world “${ws.meta.name}” · storage: ${ws.persistStatus}`;
      };
      setInterval(refreshStatus, 2000);
      refreshStatus();
      menu.appendChild(file);
      menu.appendChild(statusLine);
      overlay.firstElementChild?.appendChild(menu);
    }
    document.body.appendChild(overlay);
    input.onPauseChange = (paused) => {
      if (overlay) overlay.style.display = paused ? 'flex' : 'none';
    };
  }

  // scenario A metrics (§C-6)
  const scn = {
    start: performance.now(),
    intervals: [] as number[],
    longTasks: 0,
    reported: false,
  };
  if (SCENARIO_A && typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver((list) => {
        scn.longTasks += list.getEntries().length;
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      // longtask unsupported: reported as 0, noted in the report
    }
  }

  const doEdit = (kind: 'dig' | 'place', material: number, sharp: boolean): void => {
    if (editManager === null) return;
    const eye: [number, number, number] = [
      player.position[0], player.position[1] + PLAYER.eye, player.position[2],
    ];
    const dir: [number, number, number] = [
      -Math.sin(camera.yaw) * Math.cos(camera.pitch),
      Math.sin(camera.pitch),
      -Math.cos(camera.yaw) * Math.cos(camera.pitch),
    ];
    const hit = pickRay(source, eye, dir, PLAYER.reach);
    if (hit === null) return;
    if (kind === 'dig') {
      // §9.3 guard: the voxel store must still agree.
      const v = editManager.blockAt(...hit.solidBlock);
      if (v !== null && materialOf(v) !== AIR) editManager.apply(...hit.solidBlock, AIR);
    } else {
      const v = editManager.blockAt(...hit.airBlock);
      if (v === null || materialOf(v) !== AIR) return;
      // §9.3: placement that would intersect any player's box is refused.
      const [bx, by, bz] = hit.airBlock;
      const px = player.position[0];
      const py = player.position[1];
      const pz = player.position[2];
      const r = PLAYER.radius;
      const intersects =
        bx + 1 > px - r && bx < px + r &&
        bz + 1 > pz - r && bz < pz + r &&
        by + 1 > py && by < py + PLAYER.height;
      if (!intersects) editManager.apply(bx, by, bz, makeBlock(material, sharp));
    }
  };

  // ---- HUD (§8.4) ----
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText =
    'position:fixed;top:4px;left:8px;font:12px monospace;color:#cfe;opacity:.85;white-space:pre;pointer-events:none;';
  document.body.appendChild(hud);

  const intervals: number[] = [];
  let lastT = performance.now();
  let hudAt = 0;
  let bannerShown = false;

  const hooks = TEST_MODE ? installTestHooks(renderer, camera) : null;
  const benchT0 = performance.now();

  let frameParity = 0;
  const frame = (): void => {
    if (FRAME_CAP === 'half' && (frameParity ^= 1) === 1) {
      requestAnimationFrame(frame);
      return;
    }
    const now = performance.now();
    const frameInterval = now - lastT;
    intervals.push(frameInterval);
    if (intervals.length > 240) intervals.shift();
    lastT = now;

    if (BENCH) {
      // §15 M2: the scripted 22 b/s flight.
      const t = (now - benchT0) / 1000;
      camera.position[0] = 0.5 + 22 * t;
      camera.position[1] = heightAt(SEED, camera.position[0], camera.position[2]) + 18;
      camera.yaw = Math.sin(t * 0.25) * 0.4;
      camera.pitch = -0.2;
    }

    if (PLAYER_MODE) {
      const dt = Math.min(0.05, (now - lastT + 0.01) / 1000) || 1 / 60;
      const spawnReady =
        source.chunkAt(
          Math.floor(player.position[0] / CHUNK),
          Math.floor(player.position[1] / CHUNK),
          Math.floor(player.position[2] / CHUNK),
        ) !== null;
      if (SCENARIO_A) {
        const t = (now - scn.start) / 1000;
        const act = scenarioA(t);
        if (!act.done && spawnReady) {
          player = stepPlayer(source, player, act.input, dt);
          camera.yaw = act.input.yaw;
          camera.pitch = t >= 60 ? -0.9 : -0.15;
          if (act.edit !== null) doEdit(act.edit, 5, false);
        }
        if (t > 10 && !act.done) scn.intervals.push(frameInterval);
        if (act.done && !scn.reported && editManager !== null) {
          scn.reported = true;
          const report = summarise(
            scn.intervals, scn.longTasks, editManager.editToVisibleMs, editManager.splitSwapCount,
          );
          (window as unknown as { __scenarioA?: unknown }).__scenarioA = report;
          console.log('scenario A:', JSON.stringify(report));
        }
      } else if (input !== null) {
        const fi = input.frame();
        camera.yaw = fi.yaw;
        camera.pitch = fi.pitch;
        if (fi.locked && spawnReady) {
          const ci: ControllerInput = {
            move: fi.move, yaw: fi.yaw, jump: fi.jump, sprint: fi.sprint,
            descend: fi.descend, toggleFly: fi.toggleFly,
          };
          player = stepPlayer(source, player, ci, dt);
          if (fi.remove) doEdit('dig', fi.material, fi.sharpMode);
          if (fi.place) doEdit('place', fi.material, fi.sharpMode);
          if (fi.pickMaterial || fi.toggleSharpTarget) {
            const eye: [number, number, number] = [
              player.position[0], player.position[1] + PLAYER.eye, player.position[2],
            ];
            const dir: [number, number, number] = [
              -Math.sin(fi.yaw) * Math.cos(fi.pitch), Math.sin(fi.pitch), -Math.cos(fi.yaw) * Math.cos(fi.pitch),
            ];
            const hit = pickRay(source, eye, dir, PLAYER.reach);
            if (hit !== null && editManager !== null) {
              const v = editManager.blockAt(...hit.solidBlock);
              if (v !== null && materialOf(v) !== AIR) {
                if (fi.pickMaterial) input.setMaterial(materialOf(v));
                else editManager.apply(...hit.solidBlock, makeBlock(materialOf(v), !isSharp(v)));
              }
            }
          }
        }
        hotbar?.update(fi.material, fi.sharpMode);
      }
      camera.position = [
        player.position[0],
        player.position[1] + PLAYER.eye,
        player.position[2],
      ];

      // target outline + placement ghost (§9.3)
      {
        const dir: [number, number, number] = [
          -Math.sin(camera.yaw) * Math.cos(camera.pitch),
          Math.sin(camera.pitch),
          -Math.cos(camera.yaw) * Math.cos(camera.pitch),
        ];
        const hit = pickRay(source, camera.position, dir, PLAYER.reach);
        if (hit !== null) {
          const verts: number[] = [];
          cubeLines(verts, hit.solidBlock, camera.position, [1, 0.95, 0.4, 1]);
          cubeLines(verts, hit.airBlock, camera.position, [1, 1, 1, 0.35]);
          renderer.setLines(new Float32Array(verts));
        } else {
          renderer.setLines(new Float32Array(0));
        }
      }
    }

    streaming?.update(camera.position);
    if (worldSession !== null && PLAYER_MODE) {
      worldSession.playerState = {
        position: player.position,
        yaw: camera.yaw,
        pitch: camera.pitch,
        flying: player.flying,
      } satisfies PlayerSave;
      worldSession.frame(now);
    }
    const stats = renderer.render(camera);
    if (hooks) {
      hooks.frames += 1;
      if (streaming !== null && streaming.pool.jobsCompleted > 0) hooks.workerOk = true;
    }

    // §8.4 tier-suggestion banner: main-thread p95 over 8 ms for ~3 s.
    if (!bannerShown && intervals.length >= 180) {
      const sorted3s = [...intervals].sort((a, b) => a - b);
      const p95i = sorted3s[Math.floor(0.95 * sorted3s.length)] ?? 0;
      if (p95i > 1000 / 60 + 8 && tierName !== 'low') {
        bannerShown = true;
        const banner = document.getElementById('banner');
        if (banner) {
          banner.textContent =
            'Struggling to keep up — a lower quality tier may help. Reload with #tier=low.';
          banner.hidden = false;
        }
      }
    }

    if (now > hudAt) {
      hudAt = now + 250;
      const sorted = [...intervals].sort((a, b) => a - b);
      const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      const pool = renderer.poolUsage;
      hud.textContent =
        `frame p50 ${q(0.5).toFixed(1)} ms  p95 ${q(0.95).toFixed(1)} ms  p99 ${q(0.99).toFixed(1)} ms\n` +
        `cpu ${stats.cpuMs.toFixed(2)} ms  chunks ${stats.drawnChunks}/${renderer.chunkCount}` +
        `  tris ${(stats.drawnTriangles / 1000).toFixed(0)}k  queue ${streaming?.pendingCount ?? 0}` +
        `  fill ${streaming?.firstFillMs === null || streaming === null ? '…' : `${(streaming.firstFillMs / 1000).toFixed(1)}s`}\n` +
        `pools v ${(pool.vertexBytes / 1048576).toFixed(1)} MiB  i ${(pool.indexBytes / 1048576).toFixed(1)} MiB` +
        `  tier ${tierName}${BENCH ? '  BENCH 22 b/s' : ''}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

}

/** M2/M3 swatch scene: all 6 materials on flat ground, on a slope, as a
 *  smooth lone block and as a SHARP lone block — the owner signs off the
 *  material look here (D-21) with the real mesher. */
function buildSwatchScene(renderer: Renderer): void {
  const apron = 10;
  const n = CHUNK + 2 * apron;
  const blocks = new Uint16Array(n * n * n);
  const rho = new Float32Array(n * n * n).fill(-1);
  const shapeEdited = new Uint8Array(n * n * n).fill(1); // relaxed binary look
  const set = (x: number, y: number, z: number, v: number): void => {
    if (x < -apron || y < -apron || z < -apron || x >= CHUNK + apron || y >= CHUNK + apron || z >= CHUNK + apron) return;
    const i = ((y + apron) * n + (z + apron)) * n + (x + apron);
    blocks[i] = v;
    rho[i] = 1;
  };
  for (let m = 1; m <= 6; m++) {
    const x0 = (m - 1) * 5;
    for (let x = x0; x < x0 + 5 && x < CHUNK; x++) {
      for (let z = -4; z < CHUNK + 4; z++) {
        for (let y = 0; y < 4; y++) set(x, y, z, makeBlock(m, false));
        const rise = Math.max(0, Math.floor((z - 16) / 2));
        for (let y = 4; y < 4 + rise && z >= 16; y++) set(x, y, z, makeBlock(m, false));
      }
    }
    set(x0 + 2, 6, 8, makeBlock(m, false)); // smooth lone block
    set(x0 + 2, 6, 4, makeBlock(m, true)); // sharp lone block
  }
  const mesh = meshRegion({ nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited, params: {} });
  renderer.addChunk(packChunkKey(0, 0, 0), [0, 0, 0], mesh);
}

export type { MeshParams };

/** 12 cube edges as camera-relative line-list vertices. */
function cubeLines(
  out: number[],
  cell: readonly [number, number, number],
  cam: readonly [number, number, number],
  color: [number, number, number, number],
): void {
  const x = cell[0] - cam[0];
  const y = cell[1] - cam[1];
  const z = cell[2] - cam[2];
  const C = [
    [x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1],
    [x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1],
  ] as const;
  const E = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ] as const;
  for (const [a, b] of E) {
    out.push(...C[a]!, ...color, ...C[b]!, ...color);
  }
}

function installTestHooks(renderer: Renderer, camera: Camera): AmorfusTestHooks {
  const hooks: AmorfusTestHooks = {
    frames: 0,
    workerOk: false,
    readCenterPixel: () => renderer.readCenterPixel(camera),
    genGolden: async (seed, chunk) => {
      const c = generateChunk(seed, ...chunk);
      const parts: Uint8Array[] = [];
      const enc = new TextEncoder();
      if (c.storage.kind === 'uniform') parts.push(enc.encode(`uniform:${c.storage.value}`));
      else parts.push(new Uint8Array(c.storage.blocks.buffer, c.storage.blocks.byteOffset, c.storage.blocks.byteLength));
      parts.push(
        c.hints === 'saturated'
          ? enc.encode('saturated')
          : new Uint8Array(c.hints.buffer, c.hints.byteOffset, c.hints.byteLength),
      );
      const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let off = 0;
      for (const p of parts) {
        total.set(p, off);
        off += p.length;
      }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', total));
      let hexStr = '';
      for (const b of digest) hexStr += b.toString(16).padStart(2, '0');
      return hexStr;
    },
  };
  window.__amorfus = hooks;
  return hooks;
}

void start();
