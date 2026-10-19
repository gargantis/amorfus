// Step compactness: a straight built step (edge along z at x = 16) of height
// H on hinted ground (top y = 6), and a 6×6 one-high platform. Reports the
// 10–90 % transition width along x, the max surface slope across the step,
// and the platform's centre height (ideal 7.0) and edge midpoint height.
//   node work/gs/tools/steps.mjs '<label>' '<json>' [...]
import * as core from '../../../harness/core.mjs';
import { meshRegion } from '../mesher-gs.mjs';
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3;
const clampRho = (d) => { const q = Math.max(-1, Math.min(1, d / 4)); return q === 0 ? (d >= 0 ? 1 / 127 : -1 / 127) : q; };
const ground = (x, y, z) => { const d = 6 - (y + 0.5); if (d <= 0) return { v: AIR, rho: clampRho(d) }; return { v: d < 1 ? GRASS : d < 4 ? DIRT : STONE, rho: clampRho(d) }; };
const stepScene = (H) => (x, y, z) => (y >= 6 && y < 6 + H && x >= 16 ? { v: STONE, edited: true } : ground(x, y, z));
const platform = (x, y, z) => (y === 6 && x >= 13 && x < 19 && z >= 13 && z < 19 ? { v: STONE, edited: true } : ground(x, y, z));
function topHeights(mesh, z0) {
  // highest surface y along x at z = z0 (vertical ray cast on up-facing tris)
  const out = [];
  for (let x = 4; x <= 28; x += 0.125) {
    let best = -Infinity;
    for (let t = 0; t < mesh.T; t++) {
      const a = mesh.tri[t * 3], b = mesh.tri[t * 3 + 1], c = mesh.tri[t * 3 + 2];
      const ax = mesh.pos[a * 3], az = mesh.pos[a * 3 + 2], bx = mesh.pos[b * 3], bz = mesh.pos[b * 3 + 2], cx = mesh.pos[c * 3], cz = mesh.pos[c * 3 + 2];
      const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (area >= -1e-12) continue;
      const w0 = ((bx - x) * (cz - z0) - (bz - z0) * (cx - x)) / area;
      const w1 = ((cx - x) * (az - z0) - (cz - z0) * (ax - x)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const y = w0 * mesh.pos[a * 3 + 1] + w1 * mesh.pos[b * 3 + 1] + w2 * mesh.pos[c * 3 + 1];
      if (y > best) best = y;
    }
    out.push([x, best]);
  }
  return out;
}
const args = process.argv.slice(2);
console.log('variant'.padEnd(14) + 'step1: width  maxSlope | step2: width  maxSlope  minY@x<16 | platform: centre  edgeMid');
for (let i = 0; i < args.length; i += 2) {
  const params = JSON.parse(args[i + 1]);
  const res = [];
  for (const H of [1, 2]) {
    const mesh = core.decodeMesh(meshRegion({ ...core.buildRegion(stepScene(H), 10), params }));
    const prof = topHeights(mesh, 16.37);
    const lo = 6 + 0.1 * H, hi = 6 + 0.9 * H;
    const x10 = prof.find(([, y]) => y >= lo)?.[0], x90 = prof.find(([, y]) => y >= hi)?.[0];
    let maxS = 0;
    for (let k = 1; k < prof.length; k++) { const s = Math.atan2(prof[k][1] - prof[k - 1][1], 0.125) * 180 / Math.PI; if (s > maxS) maxS = s; }
    res.push([x90 - x10, maxS]);
  }
  const pm = core.decodeMesh(meshRegion({ ...core.buildRegion(platform, 10), params }));
  const pp = topHeights(pm, 16.0);
  const at = (x) => pp.reduce((b, p) => (Math.abs(p[0] - x) < Math.abs(b[0] - x) ? p : b))[1];
  console.log(args[i].padEnd(14) + `${res[0][0].toFixed(2).padStart(11)} ${res[0][1].toFixed(1).padStart(8)}° | ${res[1][0].toFixed(2).padStart(12)} ${res[1][1].toFixed(1).padStart(8)}° ${''.padStart(10)} | ${at(16).toFixed(2).padStart(15)} ${at(13.5).toFixed(2).padStart(8)}`);
}
