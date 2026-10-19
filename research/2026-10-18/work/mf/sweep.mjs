// Parameter sweeps for the mf approach over the material scenes, using the
// harness's own rasteriser and metrics (imported read-only).
import * as core from '../../harness/core.mjs';
import { MATERIAL_SCENES } from '../../harness/scenes.mjs';
import { rasterTopDown } from '../../harness/raster.mjs';
import { materialMetrics } from '../../harness/metrics.mjs';
import { build } from './field.mjs';
import { makeFast, fragmentArgmax } from './fast.mjs';
export const buildAny = (c) => {
  if (!c.fast) return build(c);
  const add = makeFast(c.fast);
  return { name: c.name, mesh: (region, scene, core) => add(core.decodeMesh(core.meshRegion({ ...region, params: {} })), region), fragment: fragmentArgmax };
};

const regionCache = new Map();
export function regionFor(scene, apron = 10) {
  const k = `${scene.name}@${apron}`;
  if (!regionCache.has(k)) regionCache.set(k, core.buildRegion(scene.cell, apron));
  return regionCache.get(k);
}

export function cellText(scene, r) {
  const m = r.material;
  const f = (v) => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(3));
  const worst = m.boundaries.reduce((a, b) => (b.std > (a?.std ?? -1) ? b : a), null);
  const flags = [];
  if (m.area.ratio !== null && Math.abs(m.area.ratio - 1) > 0.25) flags.push('A');
  const s = scene.name;
  const wantParts = s === 'checker' ? null : 1;
  if (wantParts !== null && m.components !== wantParts && !s.startsWith('edge') && s !== 'junction3' && s !== 'hill-materials') flags.push('C');
  if (m.width && m.width.min < 0.15) flags.push('P');
  let t = worst ? `${f(worst.std)}/${f(worst.maxDev)}` : `a${m.area.ratio.toFixed(2)},${m.components}p`;
  if (m.width) t += ` w${m.width.min.toFixed(2)}-${m.width.mean.toFixed(2)}`;
  if (s === 'single' || s === 'checker' || s.startsWith('disc') || s === 'square-6') t += ` a${m.area.ratio.toFixed(2)}`;
  if (s === 'checker') t += ` ${m.components}p`;
  return t + (flags.length ? ` ${flags.join('')}` : '');
}

export function evalConfig(opts, names = null, S = 32) {
  const A = buildAny(opts);
  const out = {};
  for (const scene of MATERIAL_SCENES) {
    if (names && !names.includes(scene.name)) continue;
    const region = regionFor(scene, 10);
    const mesh = A.mesh(region, null, core);
    const img = rasterTopDown(mesh, { x0: 0, z0: 0, w: 32, h: 32, S, fragment: (a, i) => A.fragment(a, i, scene), scene });
    out[scene.name] = { material: materialMetrics(img, scene), stats: mesh.mfStats };
  }
  return out;
}

export function table(configs, names = null, S = 32) {
  const rows = [];
  const res = configs.map((c) => evalConfig(c, names, S));
  const scenes = MATERIAL_SCENES.filter((s) => !names || names.includes(s.name));
  console.log(`| scene | ${configs.map((c) => c.name).join(' | ')} |`);
  for (const s of scenes) console.log(`| ${s.name} | ${res.map((r) => cellText(s, r[s.name])).join(' | ')} |`);
  return res;
}

// CLI: node work/mf/sweep.mjs '<json array of configs>' [scene,scene]
if (process.argv[1] && process.argv[1].endsWith('sweep.mjs') && process.argv[2]) {
  const configs = JSON.parse(process.argv[2]);
  const names = process.argv[3] ? process.argv[3].split(',') : null;
  table(configs, names);
}
