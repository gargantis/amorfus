// §9.1: the stateless module worker. GEN_MESH generates its own region
// from (seed, edits) and meshes it; REMESH meshes a region the main
// thread assembled. ArrayBuffers are transferred, never shared.
import { genMeshJob, type EditsByChunk } from '../core/mesh/gen-mesh';
import { meshRegion, type MeshRegionInput } from '../core/mesh/mesher';

export interface GenMeshRequest {
  type: 'gen_mesh';
  id: number;
  key: number;
  version: number;
  seed: [number, number];
  cx: number;
  cy: number;
  cz: number;
  /** edits serialized as [chunkKey, [index, value, index, value, …]][] */
  edits: Array<[number, number[]]>;
}

export interface RemeshRequest {
  type: 'remesh';
  id: number;
  key: number;
  version: number;
  cx: number;
  cy: number;
  cz: number;
  nx: number;
  ny: number;
  nz: number;
  apron: number;
  blocks: Uint16Array;
  rho: Float32Array;
  shapeEdited: Uint8Array;
}

export type WorkerRequest = GenMeshRequest | RemeshRequest;

export interface MeshResponse {
  type: 'mesh';
  id: number;
  key: number;
  version: number;
  cx: number;
  cy: number;
  cz: number;
  vertexData: ArrayBuffer;
  vertexCount: number;
  indexData: Uint32Array;
  quadCount: number;
  positions: Float32Array;
  pickRecords: Uint32Array;
  pickOffsets: Uint32Array;
  /** GEN_MESH only: the chunk's own data for the main-thread cache. */
  storage?: { kind: 'uniform'; value: number } | { kind: 'dense'; blocks: Uint16Array };
  hints?: Int8Array | 'saturated';
}

interface WorkerCtx {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent) => void) | null;
}
const ctx = self as unknown as WorkerCtx;

function deserializeEdits(flat: Array<[number, number[]]>): EditsByChunk {
  const out = new Map<number, Map<number, number>>();
  for (const [key, pairs] of flat) {
    const m = new Map<number, number>();
    for (let i = 0; i < pairs.length; i += 2) m.set(pairs[i]!, pairs[i + 1]!);
    out.set(key, m);
  }
  return out;
}

ctx.onmessage = (ev: MessageEvent) => {
  const req = ev.data as WorkerRequest;
  if (req.type === 'gen_mesh') {
    const job = genMeshJob(req.seed, req.cx, req.cy, req.cz, deserializeEdits(req.edits));
    const m = job.mesh;
    const res: MeshResponse = {
      type: 'mesh',
      id: req.id,
      key: req.key,
      version: req.version,
      cx: req.cx,
      cy: req.cy,
      cz: req.cz,
      vertexData: m.vertexData,
      vertexCount: m.vertexCount,
      indexData: m.indexData,
      quadCount: m.quadCount,
      positions: m.positions,
      pickRecords: m.pickRecords,
      pickOffsets: m.pickOffsets,
      storage: job.storage,
      hints: job.hints,
    };
    const transfer: Transferable[] = [
      m.vertexData, m.indexData.buffer, m.positions.buffer, m.pickRecords.buffer, m.pickOffsets.buffer,
    ];
    if (job.storage.kind === 'dense') transfer.push(job.storage.blocks.buffer);
    if (job.hints !== 'saturated') transfer.push((job.hints as Int8Array).buffer);
    ctx.postMessage(res, transfer);
    return;
  }
  if (req.type === 'remesh') {
    const input: MeshRegionInput = {
      nx: req.nx, ny: req.ny, nz: req.nz,
      apron: req.apron,
      blocks: req.blocks,
      rho: req.rho,
      shapeEdited: req.shapeEdited,
      params: undefined,
    };
    const m = meshRegion(input);
    const res: MeshResponse = {
      type: 'mesh',
      id: req.id,
      key: req.key,
      version: req.version,
      cx: req.cx,
      cy: req.cy,
      cz: req.cz,
      vertexData: m.vertexData,
      vertexCount: m.vertexCount,
      indexData: m.indexData,
      quadCount: m.quadCount,
      positions: m.positions,
      pickRecords: m.pickRecords,
      pickOffsets: m.pickOffsets,
    };
    ctx.postMessage(res, [
      m.vertexData, m.indexData.buffer, m.positions.buffer, m.pickRecords.buffer, m.pickOffsets.buffer,
    ]);
  }
};
