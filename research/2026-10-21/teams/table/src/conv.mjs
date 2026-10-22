// Resolution check: central-corner vertex of a few classes (E2) vs n.
//   node src/conv.mjs <regime> <n,n,..> <ids> [margin]
import { readFileSync } from 'node:fs';
import { simulateScene, measureCorner, REGIMES } from './sim.mjs';
const [reg, ns, idsS, extS] = process.argv.slice(2);
const ext = extS ? +extS : 2;
const CL = JSON.parse(readFileSync(new URL('../res/classes.json', import.meta.url))).classes;
const MATS = [0, 6, 7, 1, 4, 2, 3, 5];
const embed = (rep, ext) => { const out = []; rep.forEach((L, b) => { if (!L) return; const c = [b & 1, (b >> 2) & 1, (b >> 1) & 1]; const r = c.map((v) => (v ? [0, ext - 1] : [-ext, -1])); for (let y = r[1][0]; y <= r[1][1]; y++) for (let z = r[2][0]; z <= r[2][1]; z++) for (let x = r[0][0]; x <= r[0][1]; x++) out.push([x, y, z, MATS[L]]); }); return out; };
for (const id of idsS.split(',').map(Number)) for (const n of ns.split(',').map(Number)) {
  const rep = CL[id].key.split('').map(Number);
  const t0 = performance.now();
  const sim = simulateScene(embed(rep, ext), { ...REGIMES[reg], n, margin: 0, bbox: [-ext, -ext, -ext, ext - 1, ext - 1, ext - 1] });
  const m = measureCorner(sim, [0, 0, 0], rep.map((L) => MATS[L]));
  console.log(JSON.stringify({ reg, id, key: CL[id].key, n, ext, cells: sim.N, steps: sim.steps, ms: Math.round(performance.now() - t0), changes: sim.history.slice(0, 8), vsn: m.vsn?.map((x) => +x.toFixed(4)), vseam: m.vseam?.map((x) => +x.toFixed(4)) }));
}
