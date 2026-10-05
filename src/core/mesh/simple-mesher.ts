// M2 interim mesher: Minecraft culled-face topology in the PERMANENT A.1
// vertex layout (16 B: u16x4 pos+AO/flags, snorm16x2 octahedral normal,
// u8x4 material). Vertices sit exactly on cell corners — the §7 guarded
// surface nets replace the positions at M3; buffers, renderer and formats
// stay. Quads are owned by the chunk holding the SOLID block of the pair,
// so chunk borders never emit a face twice.
import { CHUNK } from '../world/coords';
import { AIR, materialOf } from '../world/block';

export const VERTEX_STRIDE = 16;
const P = CHUNK + 2; // 34³ padded region, 1-block apron

export interface SimpleMesh {
  vertexData: ArrayBuffer;
  indexData: Uint32Array;
  quadCount: number;
  debug: { octDecode: (x: number, y: number) => [number, number, number] };
}

// Face tables: axis, sign, and the 4 corner offsets (CCW seen from the
// air side) relative to the solid block's min corner.
const FACES: Array<{
  dir: [number, number, number];
  corners: Array<[number, number, number]>;
}> = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

function octEncode(x: number, y: number, z: number): [number, number] {
  const inv = 1 / (Math.abs(x) + Math.abs(y) + Math.abs(z));
  let ox = x * inv;
  let oy = y * inv;
  if (z < 0) {
    const tx = (1 - Math.abs(oy)) * (ox >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(ox)) * (oy >= 0 ? 1 : -1);
    ox = tx;
    oy = ty;
  }
  return [ox, oy];
}

function octDecode(x: number, y: number): [number, number, number] {
  const nz = 1 - Math.abs(x) - Math.abs(y);
  let nx = x;
  let ny = y;
  if (nz < 0) {
    const tx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
    const ty = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
    nx = tx;
    ny = ty;
  }
  const len = Math.hypot(nx, ny, nz);
  return [nx / len, ny / len, nz / len];
}

/** `region` is a 34³ Uint16Array of block values: the chunk plus a
 *  1-block apron, indexed ((y+1)·34 + (z+1))·34 + (x+1). */
export function meshChunkSimple(region: Uint16Array): SimpleMesh {
  const at = (x: number, y: number, z: number): number =>
    region[((y + 1) * P + (z + 1)) * P + (x + 1)]!;
  const solid = (x: number, y: number, z: number): boolean => materialOf(at(x, y, z)) !== AIR;

  // AO (§7.2): f = solid fraction of the 4×4×4 blocks around the corner.
  const aoAt = (cx: number, cy: number, cz: number): number => {
    let count = 0;
    let total = 0;
    for (let y = cy - 2; y < cy + 2; y++) {
      for (let z = cz - 2; z < cz + 2; z++) {
        for (let x = cx - 2; x < cx + 2; x++) {
          if (x < -1 || x > CHUNK || y < -1 || y > CHUNK || z < -1 || z > CHUNK) continue;
          total += 1;
          if (solid(x, y, z)) count += 1;
        }
      }
    }
    const f = total > 0 ? count / total : 0;
    return Math.min(1, Math.max(0.55, 1 - 1.2 * Math.max(0, f - 0.5)));
  };

  const index: number[] = [];
  let quadCount = 0;
  const vertexBytes: number[] = [];

  const pushVertex = (
    x: number, y: number, z: number,
    normal: [number, number, number],
    material: number,
    ao: number,
  ): void => {
    // A.1: u16 pos = (local + 0.5)·256 → corner local c maps to c·256+128.
    const px = x * 256 + 128;
    const py = y * 256 + 128;
    const pz = z * 256 + 128;
    const ao8 = Math.round(ao * 255);
    const [ox, oy] = octEncode(normal[0], normal[1], normal[2]);
    const sx = Math.max(-32767, Math.min(32767, Math.round(ox * 32767)));
    const sy = Math.max(-32767, Math.min(32767, Math.round(oy * 32767)));
    vertexBytes.push(
      px & 0xff, px >> 8, py & 0xff, py >> 8, pz & 0xff, pz >> 8,
      ao8, 0, // w = AO | flags
      sx & 0xff, (sx >> 8) & 0xff, sy & 0xff, (sy >> 8) & 0xff,
      material, 0, 0, 0,
    );
  };

  for (let y = 0; y < CHUNK; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const value = at(x, y, z);
        const material = materialOf(value);
        if (material === AIR) continue;
        for (const face of FACES) {
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          if (solid(nx, ny, nz)) continue;
          const base = quadCount * 4;
          for (const [cx, cy, cz] of face.corners) {
            pushVertex(
              x + cx, y + cy, z + cz,
              face.dir,
              material,
              aoAt(x + cx, y + cy, z + cz),
            );
          }
          // §7.2: triangulated on the shorter diagonal (0–2 on a tie —
          // always a tie for flat quads).
          index.push(base, base + 1, base + 2, base, base + 2, base + 3);
          quadCount += 1;
        }
      }
    }
  }
  return {
    vertexData: new Uint8Array(vertexBytes).buffer,
    indexData: new Uint32Array(index),
    quadCount,
    debug: { octDecode },
  };
}
