import * as core from '../../harness/core.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const [cfgPath, sceneName, ...labels] = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(cfgPath)).href);
const scene = ALL_SCENES.find((s) => s.name === sceneName);
const o = scene.ideal.outline;
for (const lab of labels) {
  const c = mod.configs.find((x) => x.label === lab);
  const mesh = c.mesh(core.buildRegion(scene.cell, c.apron ?? 10), core);
  const { pos, tri, T } = mesh;
  const pts = [];
  for (let t = 0; t < T; t++) {
    const vs = [tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]];
    const P = [];
    for (let e = 0; e < 3; e++) {
      const a = vs[e], b = vs[(e + 1) % 3];
      const ya = pos[a * 3 + 1] - o.y, yb = pos[b * 3 + 1] - o.y;
      if ((ya < 0 && yb >= 0) || (ya >= 0 && yb < 0)) { const s = ya / (ya - yb); P.push([pos[a * 3] + s * (pos[b * 3] - pos[a * 3]), pos[a * 3 + 2] + s * (pos[b * 3 + 2] - pos[a * 3 + 2])]); }
    }
    if (P.length === 2) pts.push([(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2]);
  }
  // bin by angle (16 bins), print mean signed distance to circle
  const bins = Array.from({ length: 24 }, () => []);
  for (const p of pts) {
    const dx = p[0] - o.c[0], dz = p[1] - o.c[1];
    const ang = Math.atan2(dz, dx);
    const k = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 24) % 24;
    bins[k].push(Math.hypot(dx, dz) - o.r);
  }
  console.log(lab.padEnd(14), bins.map((b) => (b.length ? (b.reduce((x, y) => x + y, 0) / b.length).toFixed(2) : '  —')).join(' '));
}
