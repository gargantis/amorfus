import './style.css';
import { gpuInit } from './render/gpu-init';
import { messageFor } from './ui/gpu-messages';
import { showMessage } from './ui/show-message';
import { Renderer, type Camera } from './render/renderer';
import { TIERS } from './render/resize';
import { meshRegion, type MeshParams } from './core/mesh/mesher';
import { meshGeneratedChunk } from './core/mesh/gen-mesh';
import { setupGallery } from './ui/gallery';
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
const SEED: [number, number] = TEST_MODE ? [42, 0] : [1, 1];

const tierName = (hash.get('tier') ?? query.get('tier') ?? 'medium') as keyof typeof TIERS;
const VIEW_RADIUS = TEST_MODE ? 32 : TIERS[tierName]?.viewRadius ?? 160;

async function start(): Promise<void> {
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

  const pending: Array<[number, number, number]> = [];
  if (GALLERY) {
    setupGallery(renderer);
  } else if (SWATCH) {
    buildSwatchScene(renderer);
  } else {
    const cr = Math.ceil(VIEW_RADIUS / CHUNK);
    for (let dz = -cr; dz <= cr; dz++) {
      for (let dx = -cr; dx <= cr; dx++) {
        if (dx * dx + dz * dz > cr * cr + 1) continue;
        for (let cy = -2; cy <= 4; cy++) pending.push([dx, cy, dz]);
      }
    }
    pending.sort((a, b) => a[0] * a[0] + a[2] * a[2] - (b[0] * b[0] + b[2] * b[2]));
  }

  const meshBudgetMs = TEST_MODE ? 50 : 7;
  const fillSome = (): void => {
    const t0 = performance.now();
    while (pending.length > 0 && performance.now() - t0 < meshBudgetMs) {
      const [cx, cy, cz] = pending.shift()!;
      const g = generateChunk(SEED, cx, cy, cz);
      if (g.storage.kind === 'uniform') continue; // nothing to draw
      const mesh = meshGeneratedChunk(SEED, cx, cy, cz, new Map());
      if (mesh.quadCount > 0) {
        renderer.addChunk(packChunkKey(cx, cy, cz), [cx * CHUNK, cy * CHUNK, cz * CHUNK], mesh);
      }
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

  const hooks = TEST_MODE ? installTestHooks(renderer, camera) : null;
  const benchT0 = performance.now();

  const frame = (): void => {
    const now = performance.now();
    intervals.push(now - lastT);
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

    fillSome();
    const stats = renderer.render(camera);
    if (hooks) hooks.frames += 1;

    if (now > hudAt) {
      hudAt = now + 250;
      const sorted = [...intervals].sort((a, b) => a - b);
      const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
      const pool = renderer.poolUsage;
      hud.textContent =
        `frame p50 ${q(0.5).toFixed(1)} ms  p95 ${q(0.95).toFixed(1)} ms  p99 ${q(0.99).toFixed(1)} ms\n` +
        `cpu ${stats.cpuMs.toFixed(2)} ms  chunks ${stats.drawnChunks}/${renderer.chunkCount}` +
        `  tris ${(stats.drawnTriangles / 1000).toFixed(0)}k  queue ${pending.length}\n` +
        `pools v ${(pool.vertexBytes / 1048576).toFixed(1)} MiB  i ${(pool.indexBytes / 1048576).toFixed(1)} MiB` +
        `  tier ${tierName}${BENCH ? '  BENCH 22 b/s' : ''}`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Module worker probe stays until the M4 pool replaces it (§13.2).
  const worker = new Worker(new URL('./workers/gen-mesh.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; nested?: string };
    if (data.type === 'pong' && data.nested === 'nested-import-ok' && hooks) hooks.workerOk = true;
  };
  worker.postMessage({ type: 'ping' });
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
