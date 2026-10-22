// Diagnostic: is the per-bubble volume constraint what makes the canonical
// table differ from terrain? Run the E2c embedding (n12) with volume: false
// and compare with the terrain-trained K8 table.
//   node src/novol.mjs > logs/novol.log   (res/novol.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { simulateScene, measureCorner, REGIMES } from './sim.mjs';
import { embed, embOpts, MATS } from './classsim.mjs';
const ROOT = new URL('..', import.meta.url).pathname;
const CL = JSON.parse(readFileSync(ROOT + 'res/classes.json', 'utf8')).classes;
const ids = [10, 2, 1, 95, 5, 35, 249, 97, 18, 36, 257, 96, 250, 253, 11, 289];
const out = {};
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
for (const reg of ['FID-0.15', 'FINITE-4']) {
  const K8 = JSON.parse(readFileSync(`${ROOT}res/table-K8-terrain-${reg}.json`, 'utf8')).entries;
  const E2c = JSON.parse(readFileSync(`${ROOT}res/table/${reg}_E2c_n12_clu.json`, 'utf8')).entries;
  const { opts } = embOpts('E2c');
  let wv = 0, wn = 0, wt = 0;
  for (const id of ids) {
    const rep = CL[id].key.split('').map(Number);
    const sim = simulateScene(embed(rep, 2), { ...REGIMES[reg], n: 12, ...opts, volume: false });
    const m = measureCorner(sim, [0, 0, 0], rep.map((L) => MATS[L]));
    const v = m.vseam && m.seamInCell ? m.vseam : m.vsn;
    const k = K8[id], e = E2c[id];
    const ev = e.vseam && e.seamInCell ? e.vseam : e.vsn;
    const dN = d3(v, k.v), dE = d3(ev, k.v);
    out[`${reg}:${id}`] = { key: CL[id].key, novol: v.map((x) => +x.toFixed(4)), steps: sim.steps, terrainK8: k.v, n: k.n, dNovolToTerrain: +dN.toFixed(4), dE2cToTerrain: +dE.toFixed(4) };
    wv += dN * k.n; wt += dE * k.n; wn += k.n;
    console.log(`${reg} c${id} ${CL[id].key}: novol ${JSON.stringify(out[`${reg}:${id}`].novol)} (${sim.steps} steps) | terrain K8 ${JSON.stringify(k.v)} (n ${k.n}) | |novol-terrain| ${dN.toFixed(3)} vs |E2c(volume)-terrain| ${dE.toFixed(3)}`);
  }
  console.log(`${reg}: terrain-count-weighted mean |novol - terrain| ${(wv / wn).toFixed(4)}, |E2c volume - terrain| ${(wt / wn).toFixed(4)} over ${ids.length} classes, ${wn} terrain corners`);
}
writeFileSync(ROOT + 'res/novol.json', JSON.stringify(out, null, 1));
