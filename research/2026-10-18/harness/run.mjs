#!/usr/bin/env node
// Run one approach over every scene: metrics, plan images, shaded views.
//   node harness/run.mjs approaches/<name>.mjs [--only a,b] [--no-images] [--S 32]
// Writes out/<name>/results.json, summary.md and img/<scene>-{plan,view}.png.
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import * as core from './core.mjs';
import { ALL_SCENES, BASE } from './scenes.mjs';
import { rasterTopDown, materialImageRgb, renderShaded } from './raster.mjs';
import { materialMetrics, geometryMetrics, constraintMetrics } from './metrics.mjs';
import { writePng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const approachPath = resolve(args[0]);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--only')?.split(',');
const images = !args.includes('--no-images');
const S = Number(opt('--S') ?? 32);
const approach = await import(pathToFileURL(approachPath).href);
const name = approach.name;
const outDir = resolve(opt('--out') ?? join(ROOT, 'out', name));
mkdirSync(join(outDir, 'img'), { recursive: true });

const results = { approach: name, describe: approach.describe ?? '', scenes: {} };
const lines = [`# ${name}`, '', approach.describe ?? '', ''];
const f3 = (v) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(3));
const f1 = (v) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(1));
let totalMs = 0;
for (const scene of ALL_SCENES) {
  if (only && !only.includes(scene.name)) continue;
  const region = core.buildRegion(scene.cell, approach.apron ?? 10);
  const [mesh, ms] = core.timed(() => approach.mesh(region, scene, core));
  totalMs += ms;
  const frag = approach.fragment ? (a, i) => approach.fragment(a, i, scene) : null;
  const flatShading = approach.flatShading === true;
  const r = { kind: scene.kind, ms, triangles: mesh.T, vertices: mesh.V };
  if (scene.kind === 'material') {
    const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: frag, scene });
    r.material = materialMetrics(img, scene);
    if (images) {
      const crop = materialImageRgb(img, { crop: scene.window });
      writePng(join(outDir, 'img', `${scene.name}-plan.png`), crop.width, crop.height, crop.rgb);
    }
  } else if (scene.kind === 'geometry') {
    r.geometry = geometryMetrics(mesh, scene, { flatShading });
  } else {
    r.constraint = constraintMetrics(mesh, scene, BASE);
  }
  if (images) {
    const view = renderShaded(mesh, { ...scene.camera, fragment: frag, scene, flatShading });
    writePng(join(outDir, 'img', `${scene.name}-view.png`), view.width, view.height, view.rgb);
  }
  results.scenes[scene.name] = r;
  // summary line
  if (r.material) {
    const b = r.material.boundaries.map((x) => `${x.label}: std ${f3(x.std)} max ${f3(x.maxDev)} off ${f3(x.mean)}`).join('; ');
    const w = r.material.width ? ` width min ${f3(r.material.width.min)} mean ${f3(r.material.width.mean)} (ideal ${f3(r.material.width.ideal)})` : '';
    lines.push(`- **${scene.name}** ${b}${b ? ' ·' : ''} area ×${f3(r.material.area.ratio)} · parts ${r.material.components}${r.material.specks ? `+${r.material.specks} specks` : ''}${w} · ${f1(ms)} ms`);
  } else if (r.geometry) {
    const g = r.geometry;
    const parts = [];
    if (g.position) parts.push(`pos std ${f3(g.position.std)} max ${f3(g.position.maxDev)} off ${f3(g.position.mean)}`);
    if (g.shadingNormal) parts.push(`shading ${f1(g.shadingNormal.rms)}° rms / ${f1(g.shadingNormal.max)}° max`);
    if (g.faceNormal) parts.push(`faces ${f1(g.faceNormal.rms)}° / ${f1(g.faceNormal.max)}°`);
    if (g.crease) parts.push(`crease ${f1(g.crease.rms)}° / ${f1(g.crease.max)}°`);
    if (g.aoRough) parts.push(`AO rough ${f3(g.aoRough.rms)} / ${f3(g.aoRough.max)}`);
    if (g.outline) parts.push(`outline std ${f3(g.outline.std)} max ${f3(g.outline.maxDev)} off ${f3(g.outline.mean)}`);
    lines.push(`- **${scene.name}** ${parts.join(' · ')} · ${r.triangles} tris · ${f1(ms)} ms`);
  } else {
    const c = r.constraint;
    lines.push(`- **${scene.name}** ${c.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(c)} (want ${scene.want})`);
  }
}
lines.push('', `total mesh time ${f1(totalMs)} ms`);
// --only updates the named scenes inside an existing results.json
const resultsPath = join(outDir, 'results.json');
if (only && existsSync(resultsPath)) {
  const prev = JSON.parse(readFileSync(resultsPath, 'utf8'));
  results.scenes = { ...prev.scenes, ...results.scenes };
}
writeFileSync(resultsPath, JSON.stringify(results, null, 1));
writeFileSync(join(outDir, 'summary.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
