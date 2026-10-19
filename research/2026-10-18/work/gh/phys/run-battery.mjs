#!/usr/bin/env node
// node work/gh/phys/run-battery.mjs <variant> [<variant>…] [--only a,b]
// Variants are raw mesh functions from work/gh/variants.mjs.
import { battery, printTable } from './battery.mjs';
import { VARIANTS } from '../variants.mjs';
const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args[oi + 1].split(',') : null;
const names = args.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));
const results = [];
for (const n of names) {
  const v = VARIANTS[n];
  if (!v) throw new Error(`unknown variant ${n}; known: ${Object.keys(VARIANTS).join(', ')}`);
  const t0 = performance.now();
  results.push([n, battery(v.raw, { apron: v.apron ?? 10, only })]);
  console.error(`${n}: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
printTable(results);
