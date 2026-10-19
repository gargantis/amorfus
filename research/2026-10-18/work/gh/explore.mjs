#!/usr/bin/env node
// Quick multi-config exploration (team gh): runs the geometry and
// constraint scenes (and optionally material scenes) through a mesh
// function built from a config, prints one compact table. No images,
// writes nothing outside work/gh.
//   node work/gh/explore.mjs <configs.mjs> [--scenes a,b] [--all]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as core from '../../harness/core.mjs';
import { ALL_SCENES, BASE } from '../../harness/scenes.mjs';
import { geometryMetrics, constraintMetrics, materialMetrics } from '../../harness/metrics.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';

const args = process.argv.slice(2);
const mod = await import(pathToFileURL(resolve(args[0])).href);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const only = opt('--scenes')?.split(',');
const all = args.includes('--all');
const configs = mod.configs; // [{ label, apron, mesh(region, core), flatShading? }]
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—');
const scenes = ALL_SCENES.filter((s) => (only ? only.includes(s.name) : all || s.kind !== 'material'));
const rows = {};
const times = {};
for (const c of configs) {
  times[c.label] = 0;
  for (const scene of scenes) {
    const region = core.buildRegion(scene.cell, c.apron ?? 10);
    const t0 = performance.now();
    const mesh = c.mesh(region, core);
    times[c.label] += performance.now() - t0;
    let cell;
    if (scene.kind === 'geometry') {
      const g = geometryMetrics(mesh, scene, { flatShading: c.flatShading === true });
      cell = g.outline ? `${f3(g.outline.std)}/${f3(g.outline.maxDev)} o${f2(g.outline.mean)}`
        : `${f1(g.shadingNormal.rms)}/${f1(g.shadingNormal.max)} ao${f3(g.aoRough.rms)} p${f2(g.position.std)}`;
    } else if (scene.kind === 'constraint') {
      const r = constraintMetrics(mesh, scene, BASE);
      cell = `${r.pass ? 'ok' : 'FAIL'} ${f2(r.value)}${r.width !== undefined ? ` w${f2(r.width)} h${f2(r.height)}` : ''}`;
    } else {
      const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S: 16, scene });
      const m = materialMetrics(img, scene);
      const worst = m.boundaries.reduce((a, b) => (b.std > (a?.std ?? -1) ? b : a), null);
      cell = worst ? `${f3(worst.std)}/${f3(worst.maxDev)}` : `x${f2(m.area.ratio)} ${m.components}p`;
    }
    (rows[scene.name] ??= {})[c.label] = cell;
  }
}
const labels = configs.map((c) => c.label);
const w0 = Math.max(...scenes.map((s) => s.name.length));
const ws = labels.map((l) => Math.max(l.length, ...scenes.map((s) => rows[s.name][l].length)));
console.log(`${'scene'.padEnd(w0)} | ${labels.map((l, i) => l.padEnd(ws[i])).join(' | ')}`);
for (const s of scenes) console.log(`${s.name.padEnd(w0)} | ${labels.map((l, i) => rows[s.name][l].padEnd(ws[i])).join(' | ')}`);
console.log(`${'ms'.padEnd(w0)} | ${labels.map((l, i) => times[l].toFixed(0).padEnd(ws[i])).join(' | ')}`);
