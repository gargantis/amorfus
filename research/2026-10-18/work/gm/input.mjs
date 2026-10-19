// gm — GEN_MESH input WITH material hints. Mirrors buildGenMeshInput
// (src/core/mesh/gen-mesh.ts) and adds, as region fields a production
// worker would have in hand after generating the region:
//   gmS  Int16Array(nx·nz)  sQ per column  (S = SEA+2 − H at 1/256)
//   gmD  Int8Array(N)       dQ per block   (D = dTerrain at 1/16)
//   gmEd Uint8Array(N)      1 where the cell has an edit entry and is solid
//                           (its material is the player's, not the field's)
// Everything else (nx, ny, nz, apron, blocks, rho, shapeEdited) is built by
// the same steps as the production builder, so the mesh is unchanged.
import { generateRegionGM, heightAt } from './gen-gm.mjs';

const CHUNK = 32;
const FULL_APRON = 10, SHORT_APRON = 3;
const materialOf = (v) => v & 0xff;
const isSharp = (v) => (v & 256) !== 0;
const isShapeEdit = (value, hint) => isSharp(value) || (materialOf(value) !== 0) !== hint > 0;

/** edits: Map of world cell key "x,y,z" → value (study format, not the
 *  production chunk-keyed map). */
export function buildGenMeshInputGM(seed, cx, cy, cz, edits = new Map(), opts = {}) {
  const bx = cx * CHUNK, by = cy * CHUNK, bz = cz * CHUNK;
  let apron = opts.forceApron ?? SHORT_APRON;
  const list = [];
  for (const [k, value] of edits) { const [x, y, z] = k.split(',').map(Number); list.push({ x, y, z, value }); }
  if (opts.forceApron === undefined) {
    for (const e of list) {
      if (e.x < bx - FULL_APRON || e.x >= bx + CHUNK + FULL_APRON || e.y < by - FULL_APRON || e.y >= by + CHUNK + FULL_APRON || e.z < bz - FULL_APRON || e.z >= bz + CHUNK + FULL_APRON) continue;
      const g = generateRegionGM(seed, e.x, e.y, e.z, 1, 1, 1);
      // production rule: a SHAPE edit within reach forces 52³. gm rule
      // (opts.gmApron): an edit of ANY kind (painting included) within reach
      // forces 52³, because the mf-iso fallback reads 6 blocks around it.
      if (isShapeEdit(e.value, g.hints[0]) || (opts.gmApron && (e.value & 0xff) !== 0)) { apron = FULL_APRON; break; }
    }
  }
  const n = CHUNK + 2 * apron;
  const t0 = performance.now();
  const region = generateRegionGM(seed, bx - apron, by - apron, bz - apron, n, n, n);
  const genMs = performance.now() - t0;
  const N = n * n * n;
  const rho = new Float32Array(N);
  const shapeEdited = new Uint8Array(N);
  const gmEd = new Uint8Array(N);
  const genBlocks = region.blocks.slice();
  for (let i = 0; i < N; i++) rho[i] = region.hints[i] / 127;
  for (const e of list) {
    const lx = e.x - (bx - apron), ly = e.y - (by - apron), lz = e.z - (bz - apron);
    if (lx < 0 || ly < 0 || lz < 0 || lx >= n || ly >= n || lz >= n) continue;
    const i = (ly * n + lz) * n + lx;
    const hint = region.hints[i];
    region.blocks[i] = e.value;
    if (materialOf(e.value) !== 0) gmEd[i] = 1;
    if (isShapeEdit(e.value, hint)) {
      shapeEdited[i] = 1;
      rho[i] = materialOf(e.value) !== 0 ? 1 : -1;
    }
  }
  return {
    input: {
      nx: n, ny: n, nz: n, apron,
      blocks: region.blocks, rho, shapeEdited, params: opts.params,
      gmS: region.sQ, gmD: region.dQ, gmD16: region.dQ16, gmEd,
    },
    apron, genMs,
    gen: { blocks: genBlocks, hints: region.hints, H: region.H, D: region.D, x0: bx - apron, y0: by - apron, z0: bz - apron },
  };
}
export { heightAt };
