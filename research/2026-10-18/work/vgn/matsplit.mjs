// vgn: do the per-material copies of a lattice corner agree (normal, AO)?
// Mixed-material builds in the edit zone + generated material splits.
import * as core from '../../harness/core.mjs';
import { meshRegion as gnMesh } from '../gn/mesher-gn.mjs';
import { PARAMS } from '../../approaches/gn-best.mjs';
import { ground, BASE } from './thin-scenes.mjs';
import { PLANKS, STONE, BRICK, SHARP_BIT } from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
const B = BASE;
const scenes = [
  ['striped wall planks/stone', (x, y, z) => (y >= B && x === 16 && z >= 6 && z < 26 && y < B + 4 ? { v: (z % 2 ? PLANKS : STONE), edited: true } : ground(x, y, z))],
  ['mound brick/planks bands', (x, y, z) => (y >= B && Math.hypot(x + 0.5 - 16, y + 0.5 - B, z + 0.5 - 16) < 6 ? { v: (y % 2 ? BRICK : PLANKS), edited: true } : ground(x, y, z))],
  ['ramp checker', (x, y, z) => (y >= B && x >= 8 && x < 24 && z >= 8 && z < 24 && (y - B + 0.5) < (x - 8 + 0.5) / 2 ? { v: ((x + z) % 2 ? STONE : PLANKS), edited: true } : ground(x, y, z))],
  ['planks wall with sharp brick inlay', (x, y, z) => (y >= B && x === 16 && z >= 6 && z < 26 && y < B + 4 ? { v: (z === 15 || z === 16) && y === B + 2 ? (BRICK | SHARP_BIT) : PLANKS, edited: true } : ground(x, y, z))],
];
for (const s of ALL_SCENES.filter((s) => s.name === 'hill-materials' || s.name === 'junction3')) scenes.push([s.name, s.cell]);
for (const [name, cell] of scenes) {
  const m = gnMesh({ ...core.buildRegion(cell, 10), params: PARAMS });
  const d = core.decodeMesh(m);
  const groups = new Map();
  for (let v = 0; v < d.V; v++) {
    if (d.flags[v] & 1) continue;
    const k = `${m.corners[v * 3]},${m.corners[v * 3 + 1]},${m.corners[v * 3 + 2]}`;
    const rec = `${d.nrm[v * 3].toFixed(6)},${d.nrm[v * 3 + 1].toFixed(6)},${d.nrm[v * 3 + 2].toFixed(6)}|${d.ao[v].toFixed(6)}`;
    const g = groups.get(k); if (g) g.push(rec); else groups.set(k, [rec]);
  }
  let multi = 0, disagree = 0;
  for (const g of groups.values()) { if (g.length < 2) continue; multi++; if (new Set(g).size > 1) disagree++; }
  console.log(`${name}: ${multi} corners shared by ≥ 2 materials; normal/AO disagree at ${disagree}`);
}
