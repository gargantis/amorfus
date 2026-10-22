// Images for Tasks 2 and 3 (3D, n = 12). node img23.mjs <regime> <set: seam|pit|bridge|seamend>
import { mkdirSync } from 'node:fs';
import { runSim } from './lib/loc.mjs';
import { renderView, renderSlice, savePng } from '../../lib/render.mjs';
const A = 6, B = 7;
const [regName, set] = process.argv.slice(2);
const box = (x0, y0, z0, x1, y1, z1, m) => { const o = []; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) o.push([x, y, z, m]); return o; };
const dir = new URL(`./img/${set}/`, import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const jobs = [];
if (set === 'seam') {
  for (const [a, b, L] of [[1, 1, 4], [2, 2, 4], [5, 5, 4], [2, 5, 4]]) jobs.push({ name: `seam-a${a}b${b}L${L}`, blocks: [...box(-a, 0, 0, -1, 1, L - 1, A), ...box(0, 0, 0, b - 1, 1, L - 1, B)], slice: { axis: 2, at: L / 2, ppb: 60 } });
}
if (set === 'pit') {
  for (const k of [3, 5, 7]) { const c = Math.floor(k / 2); jobs.push({ name: `pit-slab${k}`, blocks: box(0, 0, 0, k - 1, 1, k - 1, A).filter((b) => !(b[0] === c && b[2] === c && b[1] === 1)), slice: { axis: 2, at: c + 0.5, ppb: 50 } }); }
  for (const k of [3, 7]) { const c = Math.floor(k / 2); jobs.push({ name: `bump-slab${k}`, blocks: [...box(0, 0, 0, k - 1, 1, k - 1, A), [c, 2, c, A]], slice: { axis: 2, at: c + 0.5, ppb: 50 } }); }
}
if (set === 'bridge') {
  const left = box(0, 0, 0, 2, 1, 4, A), right = box(4, 0, 0, 6, 1, 4, A);
  jobs.push({ name: 'bridge-sep', blocks: [...left, ...right], bbox: [0, 0, 0, 6, 1, 4], slice: { axis: 2, at: 2.5, ppb: 50 } });
  jobs.push({ name: 'bridge-A', blocks: [...left, ...right, [3, 1, 2, A]], bbox: [0, 0, 0, 6, 1, 4], slice: { axis: 2, at: 2.5, ppb: 50 } });
  jobs.push({ name: 'bridge-B', blocks: [...left, ...right, [3, 1, 2, B]], bbox: [0, 0, 0, 6, 1, 4], slice: { axis: 2, at: 2.5, ppb: 50 } });
}
if (set === 'seamend') {
  const blocks = []; for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 4; z++) blocks.push([x, y, z, z < 2 ? A : B]);
  jobs.push({ name: 'seamend-sym', blocks, slice: { axis: 0, at: 4, ppb: 60 }, view: { dir: [-1, 0.8, 0.6] } });
  const inc = []; for (let x = 0; x < 6; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 6; z++) inc.push([x, y, z, x === 2 && z === 2 && y === 1 ? B : A]);
  jobs.push({ name: 'incl-slab6', blocks: inc, slice: { axis: 2, at: 2.5, ppb: 50 } });
}
for (const j of jobs) {
  const sim = runSim(j.blocks, regName, { n: 12, ...(j.bbox ? { bbox: j.bbox } : {}) });
  const bmin = [0, 1, 2].map((t) => Math.min(...j.blocks.map((b) => b[t]))), bmax = [0, 1, 2].map((t) => Math.max(...j.blocks.map((b) => b[t])) + 1);
  if (j.bbox) { for (let t = 0; t < 3; t++) { bmin[t] = Math.min(bmin[t], j.bbox[t]); bmax[t] = Math.max(bmax[t], j.bbox[t + 3] + 1); } }
  savePng(`${dir}${j.name}-${regName}-view.png`, renderView(sim, { bounds: { min: bmin, max: bmax }, width: 420, height: 300, ...(j.view ?? {}) }));
  savePng(`${dir}${j.name}-${regName}-slice.png`, renderSlice(sim, j.slice));
  console.log(set, j.name, regName, sim.steps, 'steps', sim.converged ? '' : 'NC');
}
