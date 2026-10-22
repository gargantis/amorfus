import { fromBlocks } from '../foam2d.mjs';
import { byName, to2D } from '../../../lib/configs.mjs';
const name = process.argv[2], h = +(process.argv[3] ?? 0.05), T = +(process.argv[4] ?? 1);
const F = fromBlocks(to2D(byName(name).blocks), { h });
const r = F.run({ maxTime: T, holdTime: 0.5 });
for (const e of F.events.filter(e => e.kind === 'decide')) console.log(name, 't', e.t.toFixed(4), 'at', e.at.map(v=>v.toFixed(2)).join(','), 'decided', e.decided, e.options.map(o => `${o.mats}:${o.rate.toFixed(4)}`).join(' '), 'pick', e.pick);
