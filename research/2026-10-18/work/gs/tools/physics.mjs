// node work/gs/tools/physics.mjs '<label>' '<json params>' [...]
import { battery } from '../physics-gs.mjs';
const args = process.argv.slice(2);
const sets = [];
for (let i = 0; i < args.length; i += 2) sets.push([args[i], JSON.parse(args[i + 1])]);
const res = sets.map(([l, p]) => [l, battery(p)]);
const names = res[0][1].map((r) => r.name);
console.log('test'.padEnd(58) + res.map(([l]) => l.padEnd(30)).join(''));
for (let i = 0; i < names.length; i++) {
  console.log(names[i].padEnd(58) + res.map(([, r]) => `${r[i].pass ? 'PASS' : 'FAIL'} ${r[i].detail}`.padEnd(30)).join(''));
}
for (const [l, r] of res) console.log(`${l}: ${r.filter((x) => x.pass).length}/${r.length} pass`);
