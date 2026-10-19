// vmv: small player-painted shapes (stone on hinted flat grass), one per
// scene so they cannot interact. For each: displayed stone area vs painted
// blocks, stone parts, and the area shown with a material other than the
// painted block's ("wrong", blocks²). Sheet: top hints, bottom mv-quad.
//   node work/vmv/shapes.mjs [approaches/x.mjs …]
import { join } from 'node:path';
import { core, flatGround, loadApproach, plan, fidelity, matStats, setPlan, planRgb, hcat, vcat, save, ROOT } from './vlib.mjs';
const files = process.argv.slice(2).filter((a) => a.endsWith('.mjs'));
const apps = [];
for (const f of files.length ? files : ['approaches/hints.mjs', 'approaches/mv-quad.mjs']) apps.push(await loadApproach(f));
const rect = (x0, z0, w, h) => { const c = []; for (let z = z0; z < z0 + h; z++) for (let x = x0; x < x0 + w; x++) c.push([x, z]); return c; };
const ring = (x0, z0, w, h) => rect(x0, z0, w, h).filter(([x, z]) => x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + h - 1);
const SHAPES = {
  'bar 1x3': rect(15, 16, 3, 1),
  'bar 1x4': rect(14, 16, 4, 1),
  'bar 1x5': rect(14, 16, 5, 1),
  'bar 1x6': rect(13, 16, 6, 1),
  'square 2': rect(15, 15, 2, 2),
  'square 3': rect(15, 15, 3, 3),
  'square 4': rect(14, 14, 4, 4),
  'square 5': rect(14, 14, 5, 5),
  'square 6': rect(13, 13, 6, 6),
  'rect 2x4': rect(14, 15, 4, 2),
  'L tromino': [[15, 15], [15, 16], [16, 16]],
  'T tetromino': [[15, 15], [16, 15], [17, 15], [16, 16]],
  'S tetromino': [[16, 15], [17, 15], [15, 16], [16, 16]],
  'plus 5': [[16, 15], [15, 16], [16, 16], [17, 16], [16, 17]],
  'ring 3x3': ring(15, 15, 3, 3),
  'ring 5x5': ring(14, 14, 5, 5),
  'ring 7x7': ring(13, 13, 7, 7),
  'hollow 4x4 (2x2 hole)': ring(14, 14, 4, 4),
  'pixel disc r2': rect(13, 13, 7, 7).filter(([x, z]) => (x - 16) ** 2 + (z - 16) ** 2 <= 5),
  'arrow': [[16, 13], [15, 14], [16, 14], [17, 14], [14, 15], [16, 15], [18, 15], [16, 16], [16, 17], [16, 18]],
};
const WIN = [10, 10, 23, 23];
const rows = apps.map(() => []);
console.log(`| shape [blocks] | ${apps.map((a) => `${a.name}: area shown, parts, wrong blocks²`).join(' | ')} |`);
console.log(`|---|${apps.map(() => '---').join('|')}|`);
for (const [label, cells] of Object.entries(SHAPES)) {
  const pf = setPlan(cells);
  const cell = flatGround(pf);
  const out = [];
  apps.forEach((A, k) => {
    const { img } = plan(A, cell, WIN, 24);
    const st = matStats(img, WIN);
    const f = fidelity(img, pf, WIN);
    out.push(`${st.area[core.STONE].toFixed(2)} (×${(st.area[core.STONE] / cells.length).toFixed(2)}), ${st.parts[core.STONE]} part${st.parts[core.STONE] === 1 ? '' : 's'}, ${f.wrong.toFixed(2)}`);
    rows[k].push(planRgb(img));
  });
  console.log(`| ${label} [${cells.length}] | ${out.join(' | ')} |`);
}
const half = Math.ceil(rows[0].length / 2);
const sheet = vcat([hcat(rows[0].slice(0, half), 6), ...rows.slice(1).map((r) => hcat(r.slice(0, half), 6)), hcat(rows[0].slice(half), 6), ...rows.slice(1).map((r) => hcat(r.slice(half), 6))], 10);
save(join(ROOT, 'out', 'vmv-adv', 'shapes.png'), sheet);
console.log('sheet: out/vmv-adv/shapes.png (rows: first half per approach, then second half per approach)');
