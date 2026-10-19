#!/usr/bin/env node
// Side-by-side key numbers for several approaches.
//   node harness/compare.mjs cubes hints bevel <more…>
// Material rows: boundary std / maxDev (blocks), worst over the scene's
// boundaries; flags: A = area off by >25 %, C = connectivity changed,
// P = a thin line pinches (min width < 0.15). Geometry rows: shading-normal
// rms / max (deg); outline rows: std / maxDev (blocks); constraints: value.
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = process.argv.slice(2);
const R = names.map((n) => JSON.parse(readFileSync(join(ROOT, 'out', n, 'results.json'), 'utf8')));
const scenes = Object.keys(R[0].scenes);
const f = (v, d = 3) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const cell = (r, s) => {
  const x = r.scenes[s];
  if (!x) return 'n/a';
  if (x.material) {
    const m = x.material;
    const worst = m.boundaries.reduce((a, b) => (b.std > (a?.std ?? -1) ? b : a), null);
    const flags = [];
    if (m.area.ratio !== null && Math.abs(m.area.ratio - 1) > 0.25) flags.push('A');
    const wantParts = s === 'checker' ? null : 1;
    if (wantParts !== null && m.components !== wantParts && !s.startsWith('edge') && s !== 'junction3' && s !== 'hill-materials') flags.push('C');
    if (m.width && m.width.min < 0.15) flags.push('P');
    const core = worst ? `${f(worst.std)} / ${f(worst.maxDev)}` : `area ×${f(m.area.ratio, 2)}, ${m.components} part${m.components === 1 ? '' : 's'}`;
    return core + (flags.length ? ` ${flags.join('')}` : '');
  }
  if (x.geometry) {
    const g = x.geometry;
    if (g.outline) return `${f(g.outline.std)} / ${f(g.outline.maxDev)}`;
    return `${f(g.shadingNormal.rms, 1)}° / ${f(g.shadingNormal.max, 1)}° ao ${f(g.aoRough?.rms, 3)}`;
  }
  const c = x.constraint;
  return `${c.pass ? 'ok' : 'FAIL'} ${f(c.value, 2)}`;
};
console.log(`| scene | ${names.join(' | ')} |`);
console.log(`|---|${names.map(() => '---').join('|')}|`);
for (const s of scenes) console.log(`| ${s} | ${R.map((r) => cell(r, s)).join(' | ')} |`);
console.log(`| mesh ms (all scenes) | ${R.map((r) => f(Object.values(r.scenes).reduce((a, x) => a + x.ms, 0), 0)).join(' | ')} |`);
