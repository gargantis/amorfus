// vgn: contact shadow on the ground around small builds — mean ground AO
// by distance (Chebyshev, blocks) from the build's footprint.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { STONE } from '../../harness/core.mjs';
for (const [name, foot, H] of [
  ['1×1 post, 3 high', (x, z) => x === 16 && z === 16, 3],
  ['1-wide fence, 3 high', (x, z) => x === 16 && z >= 8 && z < 24, 3],
  ['single block', (x, z) => x === 16 && z === 16, 1],
  ['4×4 block, 3 high', (x, z) => x >= 14 && x < 18 && z >= 14 && z < 18, 3],
]) {
  const cell = (x, y, z) => (y >= BASE && y < BASE + H && foot(x, z) ? { v: STONE, edited: true } : ground(x, y, z));
  const r = core.buildRegion(cell, 10);
  const P = core.decodeMesh(repoMesh({ ...r, params: {} })), G = core.decodeMesh(gnMesh({ ...r, params: PARAMS }));
  const dist = (x, z) => { let d = 99; for (let bx = 4; bx < 28; bx++) for (let bz = 4; bz < 28; bz++) if (foot(bx, bz)) d = Math.min(d, Math.max(Math.max(0, bx - x, x - (bx + 1)), Math.max(0, bz - z, z - (bz + 1)))); return d; };
  const buckets = (m) => { const b = [[], [], [], []]; for (let v = 0; v < m.V; v++) { if (Math.abs(m.pos[v * 3 + 1] - BASE) > 0.3) continue; const d = Math.round(dist(m.pos[v * 3], m.pos[v * 3 + 2])); if (d < 4) b[d].push(m.ao[v]); } return b.map((a) => (a.length ? (a.reduce((p, q) => p + q, 0) / a.length).toFixed(2) : '—')).join(' '); };
  console.log(`${name}: ground AO at distance 0 1 2 3 — prod ${buckets(P)} | gn ${buckets(G)}`);
}
