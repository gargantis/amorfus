// §7.8 look sign-off gallery: the M3 scenes rendered with the production
// shader, with sliders for k, the guard scale, the clearance caps and
// hints on/off. The owner approves the smoothing constants here (D-3,
// D-4, C-8); the §14 invariants pin the mechanics — this page judges
// taste.
import type { Renderer } from '../render/renderer';
import { meshRegion, DEFAULT_PARAMS, type MeshParams } from '../core/mesh/mesher';
import { CHUNK, packChunkKey } from '../core/world/coords';
import { makeBlock, AIR } from '../core/world/block';
import { HINT_SCALE } from '../core/gen/v1/index';

const STONE = makeBlock(3, false);
const GRASS = makeBlock(1, false);
const BRICK_SHARP = makeBlock(6, true);
const PLANKS = makeBlock(5, false);

interface SceneCell {
  v: number;
  rho?: number | undefined;
  edited?: boolean | undefined;
}

type SceneFn = (x: number, y: number, z: number, hints: boolean) => SceneCell | null;

/** Each scene occupies a 16-block-wide slot along x, ground at y < 4. */
const SCENES: Array<{ name: string; fn: SceneFn }> = [
  {
    name: 'bump+dent',
    fn: (x, y, z) => {
      if (x === 5 && y === 4 && z === 8) return { v: GRASS, edited: true }; // bump
      if (x === 10 && y === 3 && z === 8) return { v: AIR, edited: true }; // dent
      return null;
    },
  },
  {
    name: 'floating+pillar+wall',
    fn: (x, y, z) => {
      if (x === 3 && y === 8 && z === 8) return { v: PLANKS, edited: true }; // floating block
      if (x === 8 && z === 8 && y >= 4 && y < 10) return { v: PLANKS, edited: true }; // pillar
      if (x >= 11 && x < 14 && z === 10 && y >= 4 && y < 7) return { v: PLANKS, edited: true }; // wall
      return null;
    },
  },
  {
    name: 'tunnels 1×2 and 2×3',
    fn: (x, y, z) => {
      // a solid hill from y 4..12, with two tunnels dug along z
      const hill = y >= 4 && y < 12 && x >= 1 && x < 15;
      const t1 = x === 4 && (y === 4 || y === 5) && z >= 4 && z < 12;
      const t2 = (x === 9 || x === 10) && y >= 4 && y < 7 && z >= 4 && z < 12;
      if (t1 || t2) return { v: AIR, edited: true };
      if (hill) return { v: STONE };
      return null;
    },
  },
  {
    name: '2-high room + stairs',
    fn: (x, y, z) => {
      // room: roof plate placed 2 above ground
      if (x >= 2 && x < 8 && z >= 6 && z < 11 && y === 6) return { v: PLANKS, edited: true };
      // stairs up along x
      if (x >= 10 && x < 15 && z >= 7 && z < 10) {
        const step = x - 10;
        if (y >= 4 && y < 4 + step + 1) return { v: STONE, edited: true };
      }
      return null;
    },
  },
  {
    name: 'generated slopes 1:2..1:16',
    fn: (x, y, z, hints) => {
      // four hinted ramps side by side (1:2, 1:4, 1:8, 1:16)
      const lane = Math.floor(z / 4);
      if (lane < 0 || lane > 3) return null;
      const grade = [2, 4, 8, 16][lane]!;
      const h = 4 + x / grade;
      const d = h - y;
      if (y < 4) return { v: STONE };
      if (d > 0) return { v: STONE, rho: hints ? clampRho(d) : undefined };
      if (d > -2) return { v: AIR, rho: hints ? clampRho(d) : undefined };
      return null;
    },
  },
  {
    name: 'hand-built ramps 1:4 and 1:8',
    fn: (x, y, z) => {
      const lane = Math.floor(z / 6);
      if (lane < 0 || lane > 1) return null;
      const grade = lane === 0 ? 4 : 8;
      const h = 4 + Math.floor(x / grade);
      if (y >= 4 && y < h) return { v: STONE, edited: true };
      return null;
    },
  },
  {
    name: 'dug slope + sphere + sharp wall on slope',
    fn: (x, y, z, hints) => {
      const h = 4 + x / 4;
      const d = h - y;
      // sphere of edited planks
      const ds = 3.2 - Math.hypot(x - 11, y - 9, z - 11);
      if (ds > 0) return { v: PLANKS, edited: true };
      // block dug out of the slope
      if (x === 6 && y === Math.floor(4 + 6 / 4) && z === 4) return { v: AIR, edited: true };
      // sharp wall crossing the slope
      if (x >= 3 && x < 9 && z === 8 && y >= 4 && y < 9) return { v: BRICK_SHARP };
      if (y < 4) return { v: STONE };
      if (d > 0) return { v: STONE, rho: hints ? clampRho(d) : undefined };
      if (d > -2) return { v: AIR, rho: hints ? clampRho(d) : undefined };
      return null;
    },
  },
];

function clampRho(d: number): number {
  const q = Math.max(-1, Math.min(1, d / HINT_SCALE));
  return q === 0 ? 1 / 127 : q;
}

export interface GalleryParams {
  k: number;
  guardScale: number; // multiplies G[0..2]
  capH: number;
  capV: number;
  hints: boolean;
}

export function setupGallery(renderer: Renderer): void {
  const params: GalleryParams = {
    k: DEFAULT_PARAMS.k,
    guardScale: 1,
    capH: DEFAULT_PARAMS.capHorizontal,
    capV: DEFAULT_PARAMS.capVertical,
    hints: true,
  };

  const SLOT = 16;
  const apron = 10;

  const sample = (x: number, y: number, z: number): SceneCell => {
    // shared ground plane
    const slot = Math.floor(x / SLOT);
    const scene = SCENES[slot];
    const local = scene?.fn(x - slot * SLOT, y, z, params.hints) ?? null;
    if (local !== null) return local;
    if (y >= 0 && y < 4) return { v: GRASS };
    return { v: AIR };
  };

  const rebuild = (): void => {
    const meshParams: Partial<MeshParams> = {
      k: params.k,
      guard: DEFAULT_PARAMS.guard.map((g, i) => (i < 3 ? Math.min(0.5, g * params.guardScale) : g)),
      capHorizontal: params.capH,
      capVertical: params.capV,
    };
    const ccount = Math.ceil((SCENES.length * SLOT) / CHUNK);
    for (let cxi = 0; cxi < ccount; cxi++) {
      for (let czi = 0; czi < 1; czi++) {
        const n = CHUNK + 2 * apron;
        const blocks = new Uint16Array(n * n * n);
        const rho = new Float32Array(n * n * n);
        const shapeEdited = new Uint8Array(n * n * n);
        for (let y = 0; y < n; y++) {
          for (let z = 0; z < n; z++) {
            for (let x = 0; x < n; x++) {
              const c = sample(cxi * CHUNK + x - apron, y - apron, czi * CHUNK + z - apron);
              const i = (y * n + z) * n + x;
              blocks[i] = c.v;
              rho[i] = c.rho ?? (c.v === AIR ? -1 : 1);
              if (c.edited === true) shapeEdited[i] = 1;
            }
          }
        }
        const key = packChunkKey(cxi, 0, czi);
        renderer.removeChunk(key);
        const mesh = meshRegion({ nx: n, ny: n, nz: n, apron, blocks, rho, shapeEdited, params: meshParams });
        if (mesh.quadCount > 0) renderer.addChunk(key, [cxi * CHUNK, 0, czi * CHUNK], mesh);
      }
    }
  };

  // ---- controls ----
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;right:8px;top:8px;background:#1a2129e0;padding:10px 14px;border-radius:8px;' +
    'font:13px system-ui;color:#dde;z-index:10;display:grid;gap:6px;min-width:230px;';
  panel.innerHTML = '<strong>M3 gallery (§7.8)</strong>';

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
      rebuild();
    };
    row.append(name, out, input);
    panel.appendChild(row);
  };

  addSlider('k (relaxation)', 0, 10, 1, params.k, (v) => {
    params.k = v;
  });
  addSlider('guard scale', 0.5, 2.5, 0.05, params.guardScale, (v) => {
    params.guardScale = v;
  });
  addSlider('clearance cap horizontal', 0, 0.5, 0.01, params.capH, (v) => {
    params.capH = v;
  });
  addSlider('clearance cap vertical', 0, 0.5, 0.01, params.capV, (v) => {
    params.capV = v;
  });
  const hintRow = document.createElement('label');
  const hintBox = document.createElement('input');
  hintBox.type = 'checkbox';
  hintBox.checked = params.hints;
  hintBox.onchange = () => {
    params.hints = hintBox.checked;
    rebuild();
  };
  hintRow.append(hintBox, document.createTextNode(' density hints'));
  panel.appendChild(hintRow);
  const names = document.createElement('div');
  names.style.cssText = 'font-size:11px;opacity:.7;';
  names.textContent = SCENES.map((s, i) => `${i}: ${s.name}`).join(' · ');
  panel.appendChild(names);
  document.body.appendChild(panel);

  rebuild();
}
