// Share of rendered surface (3-D area, 16 bench chunks) whose displayed
// material differs from the quad's own block material ("dig it and you get
// something else"), split by what is shown vs what is stored.
import * as core from '../../harness/core.mjs';
import { buildGenMeshInputGM } from './input.mjs';
import { BENCH, loadMods } from './terrain-metrics.mjs';
const NAMES = ['air', 'grass', 'dirt', 'stone', 'sand', 'planks', 'brick', 'r7'];
const mods = await loadMods(process.argv.slice(2));
const fn = [0, 0, 0, 0];
for (const A of mods) {
  let tot = 0, diff = 0; const pairs = {};
  for (const c of BENCH) {
    const inp = buildGenMeshInputGM([1, 1], ...c, new Map(), { forceApron: 10 }).input;
    const m = A.mesh(inp, null, core);
    const dim = m.attrDim ?? 0, tmp = new Float64Array(Math.max(1, dim));
    const info = { ownMat: 0, x: 0, y: 0, z: 0 };
    const G = 6;
    for (let t = 0; t < m.T; t++) {
      core.faceNormal(m, t, fn); const ar = fn[3]; if (ar <= 0) continue;
      const a = m.tri[t * 3], b = m.tri[t * 3 + 1], cc = m.tri[t * 3 + 2];
      const own = m.mat[a];
      let n = 0, d = 0;
      for (let i = 0; i < G; i++) for (let j = 0; j < G - i; j++) {
        const w1 = (i + 1 / 3) / G, w2 = (j + 1 / 3) / G, w0 = 1 - w1 - w2;
        for (let k = 0; k < dim; k++) tmp[k] = w0 * m.attrs[a * dim + k] + w1 * m.attrs[b * dim + k] + w2 * m.attrs[cc * dim + k];
        info.ownMat = own; info.x = w0 * m.pos[a * 3] + w1 * m.pos[b * 3] + w2 * m.pos[cc * 3]; info.y = w0 * m.pos[a * 3 + 1] + w1 * m.pos[b * 3 + 1] + w2 * m.pos[cc * 3 + 1]; info.z = w0 * m.pos[a * 3 + 2] + w1 * m.pos[b * 3 + 2] + w2 * m.pos[cc * 3 + 2];
        const shown = A.fragment ? A.fragment(tmp, info, null) : own;
        n++; if (shown !== own) { d++; const k = `${NAMES[shown]} shown on ${NAMES[own]}`; pairs[k] = (pairs[k] ?? 0) + ar / G / G * 2; }
      }
      tot += ar; diff += (ar * d) / n;
    }
  }
  const top = Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(2)}%`).join(', ');
  console.log(`${A.name}: ${(100 * diff / tot).toFixed(2)}% of surface shows a material other than its block (${top})`);
}
