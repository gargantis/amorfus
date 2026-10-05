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
): { input: MeshRegionInput; apron: number } {
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
