import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [cfgPath, sceneName, label] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(cfgPath)).href);
const scene = ALL_SCENES.find((s) => s.name === sceneName);
const c = mod.configs.find((x) => x.label === label);
const mesh = c.mesh(core.buildRegion(scene.cell, c.apron ?? 10), core);
const g = scene.ideal;
const { pos, nrm, tri, T } = mesh;
const rows = [];
const fn = [0, 0, 0, 0];
for (let t = 0; t < T; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], cc = tri[t * 3 + 2];
  const cx = (pos[a * 3] + pos[b * 3] + pos[cc * 3]) / 3, cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[cc * 3 + 1]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[cc * 3 + 2]) / 3;
  if (!g.inWindow([cx, cy, cz])) continue;
  for (const v of [a, b, cc]) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const I = g.normal(p);
    const e = core.angleDeg(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2], I[0], I[1], I[2]);
    rows.push([e, p]);
  }
}
rows.sort((p, q) => q[0] - p[0]);
const seen = new Set();
let k = 0;
for (const [e, p] of rows) { const key = p.map((v) => v.toFixed(2)).join(','); if (seen.has(key)) continue; seen.add(key); console.log(e.toFixed(1), key); if (++k >= 14) break; }
