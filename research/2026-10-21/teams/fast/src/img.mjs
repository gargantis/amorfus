// Images: reference (cached engine run) and local models, same camera.
//   node img.mjs <outDir> <REGIME|-> <names> <modelIds|-> [view,slice,blocks]
// Writes <outDir>/<name>__<tag>-view.png / -slice.png, tag = regime or model id.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { byName } from '../../../lib/configs.mjs';
import { renderView, renderSlice, blocksSlice, savePng } from '../../../lib/render.mjs';
import { blockBounds, beforeSim } from '../../../lib/run.mjs';
import { nFor } from './refs.mjs';
import { loadRef } from './refs.mjs';
import { makeModel } from './t2.mjs';
import { MODELS } from './models.mjs';

const [outDir, regime, names, modelIds, what = 'view,slice'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const kinds = what.split(',');
for (const name of names.split(',')) {
  const cfg = byName(name);
  const bounds = blockBounds(cfg.blocks);
  const vopts = { bounds, ...(cfg.viewOpts ?? {}) };
  const emit = (tag, sim) => {
    if (kinds.includes('view')) savePng(join(outDir, `${name}__${tag}-view.png`), renderView(sim, vopts));
    if (kinds.includes('slice') && cfg.slice) savePng(join(outDir, `${name}__${tag}-slice.png`), renderSlice(sim, cfg.slice));
    if (kinds.includes('blocks') && cfg.slice) savePng(join(outDir, `${name}__blocks-slice.png`), blocksSlice(cfg.blocks, sim, cfg.slice));
  };
  for (const rg of regime === '-' ? [] : regime.split(',')) { const { sim } = loadRef(rg, cfg); emit(rg, sim); }
  if (modelIds !== '-') for (const id of modelIds.split(',')) emit(id, id === 'blocks' ? beforeSim(cfg.blocks, { n: nFor(cfg.name) }) : makeModel(cfg, MODELS[id]));
  console.log(name, 'done');
}
