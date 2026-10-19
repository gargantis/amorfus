import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { runRule2d, RULES } from './bench2d.mjs';
import { jagMetrics } from './jag.mjs';
const [variant, only, json] = process.argv.slice(2);
const own = () => (plan, cx, cz) => { const e = plan(cx, cz); return () => e; };
const rule = variant === 'cubes' ? own() : RULES[variant](json ? JSON.parse(json) : {});
const f3 = (v) => (v === null || !Number.isFinite(v) ? '  —  ' : v.toFixed(3));
for (const sc of MATERIAL_SCENES) {
  if (sc.name === 'hill-materials' || !sc.ideals.length) continue;
  if (only && only !== 'all' && !only.split(',').includes(sc.name)) continue;
  const img = runRule2d(sc, rule);
  const rows = sc.ideals.map((id) => { const m = jagMetrics(img, id); return `jag ${f3(m.jag)} (max ${f3(m.jagMax)}) shape ${f3(m.shape)}${m.bandOffset !== null ? ` bandOff ${f3(m.bandOffset)}` : ''}`; });
  console.log(sc.name.padEnd(12), rows.join(' | '));
}
