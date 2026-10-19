// Like explore.mjs, plus the high-frequency normal error (hf) per scene.
import * as core from '../../harness/core.mjs';
import { GEOMETRY_SCENES } from '../../harness/scenes.mjs';
import { geometryMetrics } from '../../harness/metrics.mjs';
import { meshRegion } from './mesher-gn.mjs';
import { meshRegion as repoMesh } from '../../lib/mesher-repo.mjs';
import { SETS } from './variants.mjs';
import { hfNormalError } from './hf.mjs';
const [set, list] = process.argv.slice(2);
const variants = SETS[set];
const names = list ? list.split(',') : Object.keys(variants);
const scenes = GEOMETRY_SCENES.filter((s) => s.ideal.sdf);
const regions = scenes.map((s) => core.buildRegion(s.cell, 12));
console.log(['variant (rms/max hf)', ...scenes.map((s) => s.name)].join(' | '));
for (const vn of names) {
  const params = variants[vn];
  const flat = params.rule === 'bevel' && params.faceted !== false;
  const cells = scenes.map((s, i) => {
    const m = core.decodeMesh(meshRegion({ ...regions[i], params }));
    const g = geometryMetrics(m, s, { flatShading: false });
    return `${g.shadingNormal.rms.toFixed(1)}/${g.shadingNormal.max.toFixed(0)} hf${hfNormalError(m, s, flat).toFixed(1)}`;
  });
  console.log([vn, ...cells].join(' | '));
}
