// SPIKE material-borders — THROWAWAY. Answers one question: do material
// borders drawn as a contour (per-corner material counts, plus each face's
// claim on its own centre and edges) look good enough to be worth a spec?
// Open with
// #scene=borders. Nothing here is production wiring: the world, the
// workers and the goldens never set `materialBorders`.
import type { Renderer, Camera } from '../render/renderer';
import { meshRegion } from '../core/mesh/mesher';
import { CHUNK, packChunkKey } from '../core/world/coords';
import { makeBlock, AIR } from '../core/world/block';
import { HINT_SCALE } from '../core/gen/v1/index';

const GRASS = makeBlock(1, false);
const DIRT = makeBlock(2, false);
const STONE = makeBlock(3, false);
const SAND = makeBlock(4, false);
const PLANKS = makeBlock(5, false);
const BRICK_SHARP = makeBlock(6, true);

interface Cell {
  v: number;
  rho: number;
  edited: boolean;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Terrain height, generator-style: a block is solid while y < height. The
 *  left chunk is flat (surface at y = 4); the right one rolls, with a hill
 *  steep enough to bare dirt and a cliff steep enough to bare stone. */
function heightAt(x: number, z: number): number {
  const s = smoothstep(32, 38, x);
  const ripple = 0.9 * Math.sin(x * 0.45) * Math.cos(z * 0.4);
  const hill = 9 * Math.exp(-((x - 49) ** 2 + (z - 12) ** 2) / (2 * 4.2 ** 2));
  const cliff = 7 * smoothstep(24.5, 26, z) * smoothstep(40, 44, x);
  return 3.5 + s * (ripple + hill + cliff);
}

/** Top-block material on the flat left chunk: every border shape at once. */
function patchwork(x: number, z: number): number {
  // one stone region bounded by a 45° run, then 1:2 stairs, then 1:3 stairs
  const edge = x < 8 ? 19 + x : x < 20 ? 27 - Math.floor((x - 8) / 2) : 21 + Math.floor((x - 20) / 3);
  if (z >= edge) return STONE;
  // a disc: every border angle in one shape
  if ((x - 7) ** 2 + (z - 8) ** 2 < 5.2 ** 2) return SAND;
  // a patch that meets both sand and grass (three-material corners)
  if (x >= 10 && x < 15 && z >= 11 && z < 16) return DIRT;
  // lone features, stone in grass
  if (x === 17 && z === 3) return STONE; // single block
  if ((x === 20 && z === 3) || (x === 21 && z === 4)) return STONE; // corner-touching pair
  if (x >= 24 && x < 30 && z === 3) return STONE; // 1-wide strip
  if (x >= 17 && x < 23 && z - 7 === x - 17) return STONE; // 1-wide diagonal chain
  if (x >= 25 && x < 27 && z >= 8 && z < 10) return STONE; // 2×2
  if ((x >= 25 && x < 28 && z === 12) || (x === 25 && z >= 12 && z < 15)) return STONE; // L
  return GRASS;
}

/** What a player does to flat ground: place, place sharp, dig, pile. */
function editAt(x: number, y: number, z: number): number | null {
  if (x === 18 && y === 4 && z === 17) return PLANKS; // placed block
  if (x === 21 && y === 4 && z === 17) return BRICK_SHARP; // placed sharp block
  if (x >= 24 && x < 26 && y === 3 && z >= 16 && z < 18) return AIR; // pit, 1 deep
  if (x === 24 && y === 2 && z === 16) return AIR; // and one deeper
  if (x >= 28 && x < 30 && y === 4 && z >= 16 && z < 18) return STONE; // mound
  return null;
}

function sample(x: number, y: number, z: number): Cell {
  const edit = editAt(x, y, z);
  if (edit !== null) return { v: edit, rho: edit === AIR ? -1 : 1, edited: true };
  const h = heightAt(x, z);
  const d = h - y;
  const q = Math.max(-1, Math.min(1, d / HINT_SCALE));
  if (d <= 0) return { v: AIR, rho: Math.min(-1 / 127, q), edited: false };
  const rho = Math.max(1 / 127, q);
  // materials as generator v1 lays them: a top block, 3 dirt, then stone
  if (d > 4) return { v: STONE, rho, edited: false };
  if (d > 1) return { v: DIRT, rho, edited: false };
  if (x < 32) return { v: patchwork(x, z), rho, edited: false };
  return { v: h < 3.3 ? SAND : GRASS, rho, edited: false };
}

interface View {
  target: [number, number, number];
  yaw: number;
  pitch: number;
  dist: number;
}

const VIEWS: Record<string, View> = {
  top: { target: [16, 4, 15], yaw: 0, pitch: -Math.PI / 2 + 0.001, dist: 30 },
  oblique: { target: [15, 4, 13], yaw: 0.5, pitch: -0.6, dist: 26 },
  edits: { target: [24, 4, 17], yaw: -0.3, pitch: -0.55, dist: 11 },
  terrain: { target: [48, 7, 14], yaw: 0.45, pitch: -0.5, dist: 34 },
  cliff: { target: [52, 10, 25], yaw: 2.9, pitch: -0.25, dist: 22 },
};

export function setupBordersSpike(renderer: Renderer, camera: Camera, hash: URLSearchParams): void {
  const num = (key: string, fallback: number): number => {
    const v = Number(hash.get(key) ?? NaN);
    return Number.isFinite(v) ? v : fallback;
  };
  let borders = hash.get('borders') !== '0';
  renderer.borderGuard = num('guard', renderer.borderGuard);
  renderer.borderThin = hash.get('thin') !== '0';

  const apron = 10;
  const rebuild = (): void => {
    for (let cxi = 0; cxi < 2; cxi++) {
      const n = CHUNK + 2 * apron;
      const blocks = new Uint16Array(n * n * n);
      const rho = new Float32Array(n * n * n);
      const shapeEdited = new Uint8Array(n * n * n);
      for (let y = 0; y < n; y++) {
        for (let z = 0; z < n; z++) {
          for (let x = 0; x < n; x++) {
            const c = sample(cxi * CHUNK + x - apron, y - apron, z - apron);
            const i = (y * n + z) * n + x;
            blocks[i] = c.v;
            rho[i] = c.rho;
            if (c.edited) shapeEdited[i] = 1;
          }
        }
      }
      const key = packChunkKey(cxi, 0, 0);
      renderer.removeChunk(key);
      const mesh = meshRegion({
        nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited,
        params: { materialBorders: borders },
      });
      if (mesh.quadCount > 0) renderer.addChunk(key, [cxi * CHUNK, 0, 0], mesh);
    }
  };

  // ---- orbit camera: drag to turn, shift-drag to slide, wheel to zoom ----
  const view: View = { ...VIEWS.top!, target: [...VIEWS.top!.target] };
  const applyView = (): void => {
    const cp = Math.cos(view.pitch);
    const dir = [-Math.sin(view.yaw) * cp, Math.sin(view.pitch), -Math.cos(view.yaw) * cp];
    camera.position = [
      view.target[0] - dir[0]! * view.dist,
      view.target[1] - dir[1]! * view.dist,
      view.target[2] - dir[2]! * view.dist,
    ];
    camera.yaw = view.yaw;
    camera.pitch = view.pitch;
  };
  const setView = (name: string): void => {
    const v = VIEWS[name] ?? VIEWS.top!;
    view.target = [...v.target];
    view.yaw = v.yaw;
    view.pitch = v.pitch;
    view.dist = v.dist;
    applyView();
  };
  let dragging = false;
  addEventListener('pointerdown', (ev) => {
    if ((ev.target as HTMLElement).closest('#borders-spike') === null) dragging = true;
  });
  addEventListener('pointerup', () => {
    dragging = false;
  });
  addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    if (ev.shiftKey) {
      const k = view.dist * 0.0015;
      const c = Math.cos(view.yaw);
      const s = Math.sin(view.yaw);
      view.target[0] += (-c * ev.movementX + s * ev.movementY) * k;
      view.target[2] += (s * ev.movementX + c * ev.movementY) * k;
    } else {
      view.yaw -= ev.movementX * 0.005;
      view.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(-0.05, view.pitch - ev.movementY * 0.005));
    }
    applyView();
  });
  addEventListener('wheel', (ev) => {
    view.dist = Math.max(3, Math.min(80, view.dist * Math.exp(ev.deltaY * 0.001)));
    applyView();
  }, { passive: true });

  // ---- controls ----
  const panel = document.createElement('div');
  panel.id = 'borders-spike';
  panel.style.cssText =
    'position:fixed;right:8px;top:8px;background:#1a2129e0;padding:10px 14px;border-radius:8px;' +
    'font:13px system-ui;color:#dde;z-index:10;display:grid;gap:6px;min-width:240px;';
  panel.innerHTML = '<strong>Material borders — spike (throwaway)</strong>';

  const toggleRow = document.createElement('label');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = borders;
  toggle.onchange = () => {
    borders = toggle.checked;
    rebuild();
  };
  toggleRow.append(toggle, document.createTextNode(' smooth borders (off = today)'));
  panel.appendChild(toggleRow);

  const addSlider = (
    label: string, min: number, max: number, step: number, value: number,
    onInput: (v: number) => void,
  ): void => {
    const row = document.createElement('label');
    row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;';
    const name = document.createElement('span');
    const out = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.gridColumn = '1 / span 2';
    out.textContent = String(value);
    name.textContent = label;
    input.oninput = () => {
      out.textContent = input.value;
      onInput(Number(input.value));
    };
    row.append(name, out, input);
    panel.appendChild(row);
  };
  addSlider('guard (1 = blocks keep their face, 0 = smoothest)', 0, 1, 0.05, renderer.borderGuard, (v) => {
    renderer.borderGuard = v;
  });
  const thinRow = document.createElement('label');
  const thinBox = document.createElement('input');
  thinBox.type = 'checkbox';
  thinBox.checked = renderer.borderThin;
  thinBox.onchange = () => {
    renderer.borderThin = thinBox.checked;
  };
  thinRow.append(thinBox, document.createTextNode(' thin features keep guard 1'));
  panel.appendChild(thinRow);

  const views = document.createElement('div');
  views.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
  for (const name of Object.keys(VIEWS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.style.cssText =
      'padding:3px 8px;border-radius:5px;border:1px solid #567;background:#1c232b;color:#dde;cursor:pointer;';
    b.onclick = () => setView(name);
    views.appendChild(b);
  }
  panel.appendChild(views);
  const help = document.createElement('div');
  help.style.cssText = 'font-size:11px;opacity:.7;';
  help.textContent = 'drag: turn · shift-drag: slide · wheel: zoom';
  panel.appendChild(help);
  document.body.appendChild(panel);

  rebuild();
  setView(hash.get('view') ?? 'top');
  // Scripted capture (headless canvases screenshot blank): PNG data URL.
  (window as unknown as { __bordersCapture?: (w: number, h: number) => Promise<string> }).__bordersCapture =
    async (w, h) => {
      const rgba = await renderer.captureFrame(camera, w, h);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
      return c.toDataURL('image/png');
    };
  document.body.dataset.spikeReady = '1';
}
