import { join } from 'node:path';
import { meshWorld, renderPanels, IMG } from './viz.mjs';
import { ALL_SCENES } from '../../harness/scenes.mjs';
for (const nm of ['ramp-1:8', 'ramp-1:4', 'mound-r6.4', 'pit-r5.4', 'tower-r4.6', 'terrace-disc']) {
  const s = ALL_SCENES.find((x) => x.name === nm);
  for (const noao of [false, true]) {
    const panels = ['hints', 'gs-ctx', 'gs-mls'].map((v) => ({ mesh: meshWorld(s.cell, v) }));
    console.log(renderPanels(join(IMG, `look-${nm.replace(':', '_')}${noao ? '-noao' : ''}.png`), panels, s.camera, { width: 400, height: 280, noao }));
  }
}
