// Exact solver, forced X outcomes: final energy of each choice at the X (C8 check).
// node forced.mjs <cfg> <x,y> [maxTime]
import { writeFileSync } from 'node:fs';
import { foam, CFG2 } from './foamrun.mjs';
const [name, xat, mt] = process.argv.slice(2);
const [X0, Y0] = xat.split(',').map(Number);
const out = { cfg: name, X: [X0, Y0], runs: [] };
for (const want of [null, 6, 7]) {
  const choose = (opts, F, decided) => {
    // only steer the junction at the X of interest (first decision there)
    const j = opts[0]; void j; void F; void decided;
    if (want === null) return null;
    const k = opts.findIndex((o) => o.mats[0] === want && o.mats[1] === want);
    return k >= 0 ? k : null;
  };
  const t0 = performance.now();
  const r = foam(CFG2[name](), { maxTime: mt ? +mt : 40, h: 0.04, choose });
  const rec = { forced: want, E: r.res.E, converged: r.res.converged, t: r.res.t, contact: r.res.contact, bubbles: r.bubbles.map((b) => `${b.mat}:${b.target}`).join(' '), picks: r.events.filter((e) => e.kind === 'decide').map((e) => `${e.at}:${e.pick.join('')}`).join(' '), s: Math.round((performance.now() - t0) / 1000) };
  out.runs.push(rec); console.log(JSON.stringify(rec));
}
writeFileSync(new URL(`./foam/forced-${name}.json`, import.meta.url), JSON.stringify(out, null, 1));
