// Physics-test harness: hand-built regions meshed with the REAL mesher,
// served through the same per-chunk CPU copies the game uses (§9.3).
// rho control gives exact surface offsets ("hint phases") without the
// generator.
import { meshRegion, type MeshResult, type MeshParams } from '../mesh/mesher';
import { CHUNK, packChunkKey } from '../world/coords';
import { AIR } from '../world/block';
import type { TriangleSource, ChunkTriangles } from './collision';

export interface CellSpec {
  v: number;
  rho?: number | undefined;
  edited?: boolean | undefined;
}

export type WorldFn = (x: number, y: number, z: number) => CellSpec;

const APRON = 10;

export class MeshWorld implements TriangleSource {
  private meshes = new Map<number, { mesh: MeshResult; origin: [number, number, number] }>();
  private fn: WorldFn;
  private params: Partial<MeshParams> | undefined;

  constructor(fn: WorldFn, params?: Partial<MeshParams>) {
    this.fn = fn;
    this.params = params;
  }

  /** Mesh the chunks covering the given chunk-coordinate box. */
  build(cx0: number, cy0: number, cz0: number, cx1: number, cy1: number, cz1: number): void {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const n = CHUNK + 2 * APRON;
          const blocks = new Uint16Array(n * n * n);
          const rho = new Float32Array(n * n * n);
          const shapeEdited = new Uint8Array(n * n * n);
          for (let y = 0; y < n; y++) {
            for (let z = 0; z < n; z++) {
              for (let x = 0; x < n; x++) {
                const c = this.fn(cx * CHUNK + x - APRON, cy * CHUNK + y - APRON, cz * CHUNK + z - APRON);
                const i = (y * n + z) * n + x;
                blocks[i] = c.v;
                rho[i] = c.rho ?? (c.v === AIR ? -1 : 1);
                if (c.edited === true) shapeEdited[i] = 1;
              }
            }
          }
          const mesh = meshRegion({
            nx: n, ny: n, nz: n, apron: APRON, blocks, rho, shapeEdited, params: this.params,
          });
          this.meshes.set(packChunkKey(cx, cy, cz), {
            mesh,
            origin: [cx * CHUNK, cy * CHUNK, cz * CHUNK],
          });
        }
      }
    }
  }

  chunkAt(cx: number, cy: number, cz: number): ChunkTriangles | null {
    const e = this.meshes.get(packChunkKey(cx, cy, cz));
    if (e === undefined) return null;
    return {
      origin: e.origin,
      positions: e.mesh.positions,
      indexData: e.mesh.indexData,
      pickRecords: e.mesh.pickRecords,
      pickOffsets: e.mesh.pickOffsets,
    };
  }
}
