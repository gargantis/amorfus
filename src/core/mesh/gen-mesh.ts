// §9.1 GEN_MESH: build a mesh input straight from the generator plus the
// edit overlay, choosing the 38³ shortcut (apron 3) when nothing within
// reach is shape-edited, else the full 52³ (apron 10 = k + 4). Used by the
// worker (M4) and by tests; REMESH (assemble.ts) must reproduce it
// byte for byte from loaded chunks.
import { generateRegion, hintAt } from '../gen/v1/index';
import { CHUNK, packChunkKey, localIndex, cellOfIndex } from '../world/coords';
import { materialOf, isSharp, AIR } from '../world/block';
import { meshRegion, type MeshRegionInput, type MeshResult, type MeshParams } from './mesher';

export type EditsByChunk = ReadonlyMap<number, ReadonlyMap<number, number>>;

const FULL_APRON = 10; // k + 4 (§7.5)
const SHORT_APRON = 3;

/** §7.1: shapeEdited ⇔ an entry exists and (sharp(W) ∨ solid(W) ≠ hint>0). */
function isShapeEdit(value: number, hint: number): boolean {
  return isSharp(value) || (materialOf(value) !== AIR) !== hint > 0;
}

interface EditCell {
  x: number; // world coords
  y: number;
  z: number;
  value: number;
}

function collectEdits(
  edits: EditsByChunk,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): EditCell[] {
  const out: EditCell[] = [];
  const cx0 = Math.floor(x0 / CHUNK);
  const cx1 = Math.floor((x1 - 1) / CHUNK);
  const cy0 = Math.floor(y0 / CHUNK);
  const cy1 = Math.floor((y1 - 1) / CHUNK);
  const cz0 = Math.floor(z0 / CHUNK);
  const cz1 = Math.floor((z1 - 1) / CHUNK);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        let chunk: ReadonlyMap<number, number> | undefined;
        try {
          chunk = edits.get(packChunkKey(cx, cy, cz));
        } catch {
          continue; // outside world bounds
        }
        if (chunk === undefined) continue;
        for (const [index, value] of chunk) {
          const { x, y, z } = cellOfIndex(index);
          const wx = cx * CHUNK + x;
          const wy = cy * CHUNK + y;
          const wz = cz * CHUNK + z;
          if (wx >= x0 && wx < x1 && wy >= y0 && wy < y1 && wz >= z0 && wz < z1) {
            out.push({ x: wx, y: wy, z: wz, value });
          }
        }
      }
    }
  }
  return out;
}

export function buildGenMeshInput(
  seed: readonly [number, number],
  cx: number, cy: number, cz: number,
  edits: EditsByChunk,
  opts: { forceApron?: number; params?: Partial<MeshParams> } = {},
): { input: MeshRegionInput; apron: number; genHints: Int8Array } {
  const bx = cx * CHUNK;
  const by = cy * CHUNK;
  const bz = cz * CHUNK;

  // Apron decision: any shape edit within reach (FULL_APRON) of the chunk
  // forces the 52³ region (§7.5).
  let apron = opts.forceApron ?? SHORT_APRON;
  if (opts.forceApron === undefined) {
    const reach = collectEdits(
      edits,
      bx - FULL_APRON, by - FULL_APRON, bz - FULL_APRON,
      bx + CHUNK + FULL_APRON, by + CHUNK + FULL_APRON, bz + CHUNK + FULL_APRON,
    );
    for (const e of reach) {
      // The hint at the edited cell decides shape-editedness (§7.1).
      const hint = hintAt(seed, e.x, e.y, e.z);
      if (isShapeEdit(e.value, hint)) {
        apron = FULL_APRON;
        break;
      }
    }
  }

  const n = CHUNK + 2 * apron;
  const region = generateRegion(seed, bx - apron, by - apron, bz - apron, n, n, n);
  const rho = new Float32Array(n * n * n);
  const shapeEdited = new Uint8Array(n * n * n);
  for (let i = 0; i < rho.length; i++) rho[i] = region.hints[i]! / 127;

  for (const e of collectEdits(edits, bx - apron, by - apron, bz - apron, bx + CHUNK + apron, by + CHUNK + apron, bz + CHUNK + apron)) {
    const i = ((e.y - (by - apron)) * n + (e.z - (bz - apron))) * n + (e.x - (bx - apron));
    const hint = region.hints[i]!;
    region.blocks[i] = e.value;
    if (isShapeEdit(e.value, hint)) {
      shapeEdited[i] = 1;
      rho[i] = materialOf(e.value) !== AIR ? 1 : -1;
    }
  }

  return {
    input: {
      nx: n, ny: n, nz: n,
      apron,
      blocks: region.blocks,
      rho,
      shapeEdited,
      params: opts.params,
    },
    apron,
    genHints: region.hints,
  };
}

export interface GenMeshJobResult {
  mesh: MeshResult;
  /** CURRENT storage for the main-thread cache: edits applied. */
  storage: { kind: 'uniform'; value: number } | { kind: 'dense'; blocks: Uint16Array };
  /** GENERATED hint state (edits never change hints, §7.1). */
  hints: Int8Array | 'saturated';
}

/** §9.1 GEN_MESH: mesh the chunk AND hand back its own 32³ slice, so the
 *  main thread caches blocks and hint state without regenerating. */
export function genMeshJob(
  seed: readonly [number, number],
  cx: number, cy: number, cz: number,
  edits: EditsByChunk,
  opts: { forceApron?: number; params?: Partial<MeshParams> } = {},
): GenMeshJobResult {
  const { input, apron, genHints } = buildGenMeshInput(seed, cx, cy, cz, edits, opts);
  const mesh = meshRegion(input);
  const n = input.nx;
  const blocks = new Uint16Array(CHUNK * CHUNK * CHUNK);
  const hintsPlane = new Int8Array(CHUNK * CHUNK * CHUNK);
  let uniform: number | null = null;
  let uniformSet = false;
  let allUniform = true;
  let saturated = true;
  for (let y = 0; y < CHUNK; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const ri = ((y + apron) * n + (z + apron)) * n + (x + apron);
        const li = localIndex(x, y, z);
        const v = input.blocks[ri]!;
        blocks[li] = v;
        if (!uniformSet) {
          uniform = v;
          uniformSet = true;
        } else if (v !== uniform) {
          allUniform = false;
        }
        const h = genHints[ri]!;
        hintsPlane[li] = h;
        if (h !== 127 && h !== -127) saturated = false;
      }
    }
  }
  return {
    mesh,
    storage:
      allUniform && uniform !== null
        ? { kind: 'uniform', value: uniform }
        : { kind: 'dense', blocks },
    hints: saturated ? 'saturated' : hintsPlane,
  };
}

export function meshGeneratedChunk(
  seed: readonly [number, number],
  cx: number, cy: number, cz: number,
  edits: EditsByChunk,
  opts: { forceApron?: number; params?: Partial<MeshParams> } = {},
): MeshResult {
  return meshRegion(buildGenMeshInput(seed, cx, cy, cz, edits, opts).input);
}

export { localIndex };
