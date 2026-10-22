import { fromBlocks } from '../foam2d.mjs';
import { byName, to2D } from '../../../lib/configs.mjs';
const F = fromBlocks(to2D(byName(process.argv[2]).blocks), { h: +(process.argv[3] ?? 0.08) });
for (let j = 0; j < F.X.length; j++) if (F.isJ[j]) {
  const o = F.splitOptions(j);
  const a = F.around(j);
  console.log(j, F.X[j].toFixed(4), F.Y[j].toFixed(4), 'deg', a.length, a.map(x => (x.ang*180/Math.PI).toFixed(2)).join(','), o ? o.map(x => `${x.mats}:${x.rate.toFixed(4)}`).join(' ') : '');
}
