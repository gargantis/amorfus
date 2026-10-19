// Print xBR saddle weights (wd1: connect a–d side, wd2: connect b–c side) at every
// 2-material saddle of a scene's plan, to separate checker rims from real diagonal lines.
import { MATERIAL_SCENES } from '../../../harness/scenes.mjs';
const df = (p, q) => (p === q ? 0 : 1);
for (const name of process.argv.slice(2)) {
  const sc = MATERIAL_SCENES.find((s) => s.name === name);
  const at = (x, y) => sc.plan(x, y);
  const hist = new Map();
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) {
    const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x - 1, y), d = at(x, y);
    if (!(a === d && b === c && a !== b)) continue;
    const wd1 = df(a, at(x, y - 2)) + df(a, at(x - 2, y)) + df(d, at(x - 1, y + 1)) + df(d, at(x + 1, y - 1));
    const wd2 = df(c, at(x - 2, y - 1)) + df(c, at(x, y + 1)) + df(b, at(x + 1, y)) + df(b, at(x - 1, y - 2));
    // orient: X = the material of the side that would be connected if wd1 > wd2
    const k = `${wd1}-${wd2}`;
    hist.set(k, (hist.get(k) ?? 0) + 1);
  }
  console.log(name.padEnd(12), [...hist.entries()].sort().map(([k, v]) => `${k}:${v}`).join('  '));
}
