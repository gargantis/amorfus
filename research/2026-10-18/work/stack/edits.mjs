// stack — edited real-terrain inputs WITH generator material planes.
//  - gh's scenarios (work/gh/editscenes.mjs: mountain, single, town,
//    corner×8), whose edit sets are in the production chunk-keyed format,
//    converted to gm's "x,y,z" format and built with gm's extended GEN_MESH
//    builder (work/gm/input.mjs: production builder + planes + gmEd);
//  - gm's paint/place/dig cases (work/gm/edits.mjs), which add MATERIAL-only
//    edits (painted lines and squares).
// checkSameAsProduction() verifies blocks/rho/shapeEdited equal the
// production builder's (lib/gen-mesh.mjs) for the gh scenarios.
import { buildScenarios, SEED } from '../gh/editscenes.mjs';
import { buildGenMeshInput } from '../../lib/gen-mesh.mjs';
import { buildGenMeshInputGM } from '../gm/input.mjs';
import { allEdits } from '../gm/edits.mjs';

const CHUNK = 32, CX_MIN = -(2 ** 23) / 32, CX_SPAN = 2 ** 24 / 32, CY_MIN = -8, CY_SPAN = 24;
function unpackKey(k) {
  const cy = (k % CY_SPAN) + CY_MIN;
  const rest = Math.floor(k / CY_SPAN);
  const cz = (rest % CX_SPAN) + CX_MIN;
  const cx = Math.floor(rest / CX_SPAN) + CX_MIN;
  return [cx, cy, cz];
}
/** production chunk-keyed edits → Map("x,y,z" → value) */
export function toCellEdits(edits) {
  const out = new Map();
  for (const [k, m] of edits) {
    const [cx, cy, cz] = unpackKey(k);
    for (const [li, v] of m) {
      const x = li % CHUNK, z = Math.floor(li / CHUNK) % CHUNK, y = Math.floor(li / (CHUNK * CHUNK));
      out.set(`${cx * CHUNK + x},${cy * CHUNK + y},${cz * CHUNK + z}`, v);
    }
  }
  return out;
}

let SC = null;
export function ghScenarios() {
  if (SC) return SC;
  SC = buildScenarios();
  for (const sc of Object.values(SC)) sc.cellEdits = toCellEdits(sc.edits);
  return SC;
}
/** inputs (with planes) for every chunk of a gh scenario */
export function ghInputs(name, apron = 10) {
  const sc = ghScenarios()[name];
  return sc.chunks.map((c) => buildGenMeshInputGM(SEED, c[0], c[1], c[2], sc.cellEdits, { forceApron: apron }).input);
}
export const GM_CASES = [
  [[0, 0, -3], ['paint-diag', 'paint-square']],
  [[-1, 1, 1], ['place-planks', 'dig-pit', 'paint-1:2']],
  [[-2, 1, 1], ['paint-diag', 'place-planks']],
  [[0, 0, 0], ['paint-square', 'paint-1:2']],
  [[-3, 1, 0], ['place-planks']],
  [[1, 1, 1], ['dig-pit']],
];
export function gmCaseInputs(apron = 10) {
  return GM_CASES.map(([c, names]) => ({ label: `${c.join(',')} ${names.join('+')}`, c, input: buildGenMeshInputGM([1, 1], ...c, allEdits(c[0], c[2], names), { forceApron: apron }).input }));
}

export function checkSameAsProduction(apron = 10) {
  const out = [];
  for (const [name, sc] of Object.entries(ghScenarios())) {
    let bad = 0, cells = 0;
    for (const c of sc.chunks) {
      const p = buildGenMeshInput(SEED, c[0], c[1], c[2], sc.edits, { forceApron: apron }).input;
      const g = buildGenMeshInputGM(SEED, c[0], c[1], c[2], sc.cellEdits, { forceApron: apron }).input;
      for (let i = 0; i < p.blocks.length; i++) { cells++; if (p.blocks[i] !== g.blocks[i] || p.rho[i] !== g.rho[i] || p.shapeEdited[i] !== g.shapeEdited[i]) bad++; }
    }
    out.push(`${name}: ${cells} cells, ${bad} differ (edits ${sc.cellEdits.size})`);
  }
  return out;
}

if (process.argv[1]?.endsWith('edits.mjs')) for (const l of checkSameAsProduction()) console.log(l);
