import { simulateKeep, labelImage, junctions2D, anglesAt } from '../labtools.mjs';
import { drawLabels, savePng } from '../labimg.mjs';
import { A, B } from '../../../lib/configs.mjs';
const sim = simulateKeep([[0,0,0,A],[1,0,0,B],[2,0,0,B]], { n: 16, s: 3.2, maxSteps: 400 });
const img = labelImage(sim, 2, 0.5 + 0.25/16);
for (const J of junctions2D(img)) { const r = anglesAt(img, J, { rOut: 0.5 }); console.log(JSON.stringify(J), JSON.stringify(r)); }
savePng(new URL('./abb-slice.png', import.meta.url).pathname, drawLabels(sim, img, { scale: 10 }));
