// Model registry for t2/t3. ids: <family>-<kernel><sigma*100>
//  A0  one step, lambda 0 (threshold 1/2)
//  Bx  one step, per-cluster lambda solved for exact volume (non-local)
//  Bc  one step, a single constant lambda (local)
//  Bl  one step, lambda from a local count rule (see LOCAL below)
//  F1  one step with the FID-0.15 hysteresis (fid cost on leaving the blocks)
//  I<k> k iterated steps (first analytic, then engine-style discrete blur)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const MODELS = {};
const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'res');
const fit = (f) => { const p = join(RES, f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).best : null; };
const add = (id, spec) => { MODELS[id] = spec; };
for (const s of [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]) {
  const t = Math.round(s * 100);
  add(`A0-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'none' });
  add(`Bx-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'exact' });
  add(`F1-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'none', fid: 0.15 });
  add(`F1x-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'exact', fid: 0.15 });
  for (const m of [1, 2, 3]) {
    add(`A0-b${m}s${t}`, { kernel: `bspline${m}`, sigma: s, lambda: 'none' });
    add(`Bx-b${m}s${t}`, { kernel: `bspline${m}`, sigma: s, lambda: 'exact' });
    add(`F1-b${m}s${t}`, { kernel: `bspline${m}`, sigma: s, lambda: 'none', fid: 0.15 });
  }
  for (const c of [0.03, 0.05, 0.08, 0.1, 0.12, 0.15]) {
    add(`Bc${Math.round(c * 100)}-g${t}`, { kernel: 'gauss', sigma: s, lambda: { const: c } });
    add(`Bc${Math.round(c * 100)}-b3s${t}`, { kernel: 'bspline3', sigma: s, lambda: { const: c } });
    add(`F1c${Math.round(c * 100)}-g${t}`, { kernel: 'gauss', sigma: s, lambda: { const: c }, fid: 0.15 });
  }
  for (const k of [2, 3, 4, 6, 10]) {
    add(`I${k}-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'none', iters: k });
    add(`I${k}x-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'exact', iters: k });
    add(`I${k}F-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'none', fid: 0.15, iters: k });
    add(`I${k}Fx-g${t}`, { kernel: 'gauss', sigma: s, lambda: 'exact', fid: 0.15, iters: k });
  }
}

// local lambda rule (fitlam.mjs): lambda_b = a + b ((27 - n27)/26)^p, blended by the kernel
for (const [t, f] of [[20, 'fitlam-g20.json'], [30, 'fitlam-g30.json'], [40, 'fitlam-g40.json']]) {
  const F = fit(f);
  if (!F) continue;
  const local = { a: F.a, b: F.b, p: F.p };
  add(`Bl-g${t}`, { kernel: 'gauss', sigma: t / 100, lambda: { local } });
  for (const m of [1, 2, 3]) add(`Bl-b${m}s${t}`, { kernel: `bspline${m}`, sigma: t / 100, lambda: { local } });
}
// holdout: rule fitted on configurations of <= 12 blocks only
{ const F = fit('fitlam-g20-small.json'); if (F) { const local = { a: F.a, b: F.b, p: F.p }; add('Blh-g20', { kernel: 'gauss', sigma: 0.2, lambda: { local } }); add('Blh-b3s20', { kernel: 'bspline3', sigma: 0.2, lambda: { local } }); } }
