// Prints at which steps the engine merged phases (FREE, maxSteps 400).
//   node mergetiming.mjs <config> <dims> <seed> [jitter=1e-3]
import { simulate } from '../../lib/mbo.mjs';
import { byName, to2D } from '../../lib/configs.mjs';
const name = process.argv[2], dims = +process.argv[3], seed = +process.argv[4], jit = +(process.argv[5] ?? 1e-3);
const b = byName(name).blocks;
const lines = [];
const orig = console.log; console.log = (s) => lines.push(s);
const sim = simulate(dims === 2 ? to2D(b) : b, { dims, maxSteps: 400, jitter: jit, seed, log: true });
console.log = orig;
console.log(name, dims + 'D', 'seed', seed, 'jit', jit, 'steps', sim.steps, lines.filter((l) => l.includes('merged')).join(' | '));
