// Mode-border continuity: for every mesh edge shared by a gen-mode and a
// fallback-mode triangle (duplicated vertices: same positions), sample the
// edge at 15 points and compare the material each side's fragment shows.
// Also: every edge between two triangles of the SAME mode is checked the
// same way (should be 0 by construction — shared vertices).
import * as core from '../../harness/core.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { allEdits } from './edits.mjs';
import { loadMods } from './terrain-metrics.mjs';
const mods = await loadMods(process.argv.slice(2));
const CASES = [
  [[0, 0, -3], ['paint-diag', 'paint-square']],
  [[-1, 1, 1], ['place-planks', 'dig-pit', 'paint-1:2']],
  [[-2, 1, 1], ['paint-diag', 'place-planks']],
  [[0, 0, 0], ['paint-square', 'paint-1:2']],
];
for (const A of mods) {
  let border = 0, borderBad = 0, same = 0, sameBad = 0, borderLen = 0, badLen = 0;
  for (const [c, names] of CASES) {
    const inp = buildGenMeshInputGM([1, 1], ...c, allEdits(c[0], c[2], names), { forceApron: 10 }).input;
    const m = A.mesh(inp, null, core);
    const dim = m.attrDim;
    const q = (v) => `${Math.round(m.pos[v * 3] * 256)},${Math.round(m.pos[v * 3 + 1] * 256)},${Math.round(m.pos[v * 3 + 2] * 256)}`;
    const edges = new Map();
    for (let t = 0; t < m.T; t++) for (let e = 0; e < 3; e++) {
      const a = m.tri[t * 3 + e], b = m.tri[t * 3 + (e + 1) % 3];
      const ka = q(a), kb = q(b);
      const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      (edges.get(k) ?? edges.set(k, []).get(k)).push([t, a, b]);
    }
    const tmp = new Float64Array(dim);
    const info = { ownMat: 0, x: 0, y: 0, z: 0, a: 0, w: [0, 0, 0] };
    const matAt = (t, a, b, s) => {
      for (let d = 0; d < dim; d++) tmp[d] = (1 - s) * m.attrs[a * dim + d] + s * m.attrs[b * dim + d];
      info.ownMat = m.mat[m.tri[t * 3]];
      info.x = (1 - s) * m.pos[a * 3] + s * m.pos[b * 3]; info.y = (1 - s) * m.pos[a * 3 + 1] + s * m.pos[b * 3 + 1]; info.z = (1 - s) * m.pos[a * 3 + 2] + s * m.pos[b * 3 + 2];
      return A.fragment(tmp, info, null);
    };
    for (const list of edges.values()) {
      if (list.length !== 2) continue;
      const [[t1, a1, b1], [t2, a2, b2]] = list;
      const mode1 = m.attrs[m.tri[t1 * 3] * dim] > 0.5, mode2 = m.attrs[m.tri[t2 * 3] * dim] > 0.5;
      // orient: a2/b2 may be reversed relative to a1/b1
      const rev = q(a1) !== q(a2);
      const len = Math.hypot(m.pos[a1 * 3] - m.pos[b1 * 3], m.pos[a1 * 3 + 1] - m.pos[b1 * 3 + 1], m.pos[a1 * 3 + 2] - m.pos[b1 * 3 + 2]);
      let bad = 0;
      for (let k = 0; k < 15; k++) {
        const s = (k + 0.5) / 15;
        if (matAt(t1, a1, b1, s) !== matAt(t2, a2, b2, rev ? 1 - s : s)) bad++;
      }
      if (mode1 !== mode2) { border++; if (bad) borderBad++; borderLen += len; badLen += (len * bad) / 15; }
      else { same++; if (bad) sameBad++; }
    }
  }
  console.log(`${A.name}: mode-border edges ${border} (length ${borderLen.toFixed(1)}), with a material mismatch ${borderBad} (mismatched length ${badLen.toFixed(2)} blocks = ${(100 * badLen / borderLen).toFixed(2)}%); same-mode edges ${same}, mismatched ${sameBad}`);
}
